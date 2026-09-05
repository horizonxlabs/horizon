import type { EnvironmentName } from "@evcp/types";
import { assertValidProjectSlug } from "./postgres-provisioner";
import type { TarFile } from "./tar-inject";
import { workspaceWarmResourceLabels } from "./workspace-lifecycle";

export interface DevContainerSpec {
  name: string;
  image: string;
  env: string[];
  hostConfig: {
    NanoCpus: number;
    Memory: number;
    NetworkMode: string;
    Binds: string[];
    Mounts?: Array<{
      Type: "volume";
      Source: string;
      Target: string;
      VolumeOptions: { NoCopy: boolean };
    }>;
  };
  labels: Record<string, string>;
  exposedPort: 3000;
  publishPorts: false;
}

export function buildDevContainerSpec(input: {
  projectId?: string;
  slug: string;
  image: string;
  env: Record<string, string>;
  cpuCores: number;
  memoryMb: number;
  network: string;
  workspaceVolume: string;
}): DevContainerSpec {
  assertValidProjectSlug(input.slug);
  return {
    name: `evcp-ws-${input.slug}`,
    image: input.image,
    env: Object.entries(input.env).map(([name, value]) => `${name}=${value}`),
    hostConfig: {
      NanoCpus: Math.round(input.cpuCores * 1_000_000_000),
      Memory: input.memoryMb * 1024 * 1024,
      NetworkMode: input.network,
      Binds: [],
      Mounts: [
        {
          Type: "volume",
          Source: input.workspaceVolume,
          Target: "/workspace",
          VolumeOptions: { NoCopy: true }
        }
      ]
    },
    labels: {
      "evcp.managed": "true",
      "evcp.project-slug": input.slug,
      ...(input.projectId ? { "evcp.project-id": input.projectId } : {})
    },
    exposedPort: 3000,
    publishPorts: false
  };
}

export function workspaceWarmContainerLabels(slotId: string): Record<string, string> {
  return workspaceWarmResourceLabels(slotId);
}

export function buildWarmContainerSpec(input: {
  slotId: string;
  resourceKey: string;
  image: string;
  env: Record<string, string>;
  cpuCores: number;
  memoryMb: number;
  network: string;
  workspaceVolume: string;
}): DevContainerSpec {
  const spec = buildDevContainerSpec({
    slug: input.resourceKey,
    image: input.image,
    env: input.env,
    cpuCores: input.cpuCores,
    memoryMb: input.memoryMb,
    network: input.network,
    workspaceVolume: input.workspaceVolume
  });
  return {
    ...spec,
    labels: { ...spec.labels, ...workspaceWarmContainerLabels(input.slotId) }
  };
}

/**
 * Build a deployed-app container spec for a given environment (staging or production). Each
 * environment gets its own container name (`evcp-<env>-<slug>`), `evcp.env` label, and workspace
 * volume (`evcp-ws-<slug>-<env>-data`) so a staging deploy can never corrupt production's disk.
 * NODE_ENV is always "production" — the app runs its production build in every deployed tier.
 */
export function buildAppContainerSpec(
  input: {
    projectId?: string;
    slug: string;
    image: string;
    env: Record<string, string>;
    cpuCores?: number;
    memoryMb?: number;
    network: string;
  },
  environment: EnvironmentName
): DevContainerSpec {
  assertValidProjectSlug(input.slug);
  const cpuCores = input.cpuCores ?? 1;
  const memoryMb = input.memoryMb ?? 1024;
  const env = { ...input.env, NODE_ENV: "production" };
  return {
    name: `evcp-${environment}-${input.slug}`,
    image: input.image,
    env: Object.entries(env).map(([name, value]) => `${name}=${value}`),
    hostConfig: {
      NanoCpus: Math.round(cpuCores * 1_000_000_000),
      Memory: memoryMb * 1024 * 1024,
      NetworkMode: input.network,
      Binds: []
    },
    labels: {
      "evcp.managed": "true",
      "evcp.project-slug": input.slug,
      "evcp.env": environment,
      ...(input.projectId ? { "evcp.project-id": input.projectId } : {})
    },
    exposedPort: 3000,
    publishPorts: false
  };
}

/** Thin wrapper — production is the default deployed tier. */
export function buildProdContainerSpec(input: {
  slug: string;
  image: string;
  env: Record<string, string>;
  cpuCores?: number;
  memoryMb?: number;
  network: string;
}): DevContainerSpec {
  return buildAppContainerSpec(input, "production");
}

export interface DockerEngine {
  ensureVolume(name: string, labels: Record<string, string>): Promise<void>;
  removeVolume(name: string): Promise<void>;
  listManagedVolumes(): Promise<
    Array<{
      name: string;
      labels: Record<string, string>;
    }>
  >;
  createContainer(spec: DevContainerSpec): Promise<{ containerId: string }>;
  startContainer(containerId: string): Promise<void>;
  stopContainer(containerId: string): Promise<void>;
  removeContainer(containerId: string): Promise<void>;
  // Look up an existing container by its name (e.g. "evcp-ws-<slug>"). Returns null if none.
  // Used to self-heal the orchestrator after a restart and to keep provisioning idempotent.
  inspectContainer(name: string): Promise<{
    containerId: string;
    running: boolean;
    image: string;
    labels: Record<string, string>;
    env: string[];
  } | null>;
  listManagedContainers(): Promise<
    Array<{
      containerId: string;
      name: string;
      running: boolean;
      labels: Record<string, string>;
    }>
  >;
  execInContainer(
    containerId: string,
    cmd: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  // Like execInContainer but streams merged stdout/stderr via onChunk as it arrives (docker
  // exec attach). Optional — callers fall back to the buffered execInContainer when absent.
  execInContainerStream?(
    containerId: string,
    cmd: string[],
    onChunk: (text: string) => void
  ): Promise<{ exitCode: number }>;
  commitContainer(containerId: string, imageTag: string): Promise<{ imageId: string }>;
  // Build a REAL production image from the container's /workspace build context. Used by publish so
  // deployed tiers run `next start`, not `next dev`. `extraFiles` are injected into the build-context
  // tar IN MEMORY (e.g. the Dockerfile/.dockerignore) so nothing is written into the source
  // workspace — writing them there would dirty its git tree and break the clean-tree pre-check.
  buildImage(
    sourceContainerId: string,
    imageTag: string,
    dockerfilePath?: string,
    extraFiles?: TarFile[]
  ): Promise<{ imageId: string }>;
  removeImage?(imageIdOrTag: string): Promise<void>;
}

interface MemoryContainer {
  containerId: string;
  spec: DevContainerSpec;
  status: "created" | "running" | "stopped";
}

interface MemoryVolume {
  name: string;
  labels: Record<string, string>;
}

export function createMemoryDockerEngine(): DockerEngine & {
  state: {
    containers: MemoryContainer[];
    volumes: MemoryVolume[];
    execCalls: Array<{ containerId: string; cmd: string[] }>;
    commits: Array<{ containerId: string; imageTag: string }>;
    builds: Array<{
      containerId: string;
      imageTag: string;
      dockerfilePath: string;
      extraFiles: TarFile[];
    }>;
    removedImages: string[];
  };
} {
  const state = {
    containers: [] as MemoryContainer[],
    volumes: [] as MemoryVolume[],
    execCalls: [] as Array<{ containerId: string; cmd: string[] }>,
    commits: [] as Array<{ containerId: string; imageTag: string }>,
    builds: [] as Array<{
      containerId: string;
      imageTag: string;
      dockerfilePath: string;
      extraFiles: TarFile[];
    }>,
    removedImages: [] as string[]
  };
  const find = (containerId: string) => {
    const container = state.containers.find((item) => item.containerId === containerId);
    if (!container) {
      throw new Error(`unknown container '${containerId}'`);
    }
    return container;
  };
  return {
    state,
    async ensureVolume(name, labels) {
      const existing = state.volumes.find((volume) => volume.name === name);
      if (existing) return;
      state.volumes.push({ name, labels: { ...labels } });
    },
    async removeVolume(name) {
      state.volumes = state.volumes.filter((volume) => volume.name !== name);
    },
    async listManagedVolumes() {
      return state.volumes
        .filter((volume) => volume.labels["evcp.managed"] === "true")
        .map((volume) => ({ name: volume.name, labels: { ...volume.labels } }));
    },
    async createContainer(spec) {
      const containerId = `mem-${state.containers.length + 1}-${spec.name}`;
      state.containers.push({ containerId, spec, status: "created" });
      return { containerId };
    },
    async startContainer(containerId) {
      find(containerId).status = "running";
    },
    async stopContainer(containerId) {
      find(containerId).status = "stopped";
    },
    async removeContainer(containerId) {
      find(containerId);
      state.containers = state.containers.filter((item) => item.containerId !== containerId);
    },
    async inspectContainer(name) {
      const container = state.containers.find((item) => item.spec.name === name);
      return container
        ? {
            containerId: container.containerId,
            running: container.status === "running",
            image: container.spec.image,
            labels: { ...container.spec.labels },
            env: [...container.spec.env]
          }
        : null;
    },
    async listManagedContainers() {
      return state.containers
        .filter((container) => container.spec.labels["evcp.managed"] === "true")
        .map((container) => ({
          containerId: container.containerId,
          name: container.spec.name,
          running: container.status === "running",
          labels: { ...container.spec.labels }
        }));
    },
    async execInContainer(containerId, cmd) {
      find(containerId);
      state.execCalls.push({ containerId, cmd });
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    async commitContainer(containerId, imageTag) {
      find(containerId);
      state.commits.push({ containerId, imageTag });
      return { imageId: `mem-image-${state.commits.length}` };
    },
    async buildImage(containerId, imageTag, dockerfilePath, extraFiles) {
      find(containerId);
      state.builds.push({
        containerId,
        imageTag,
        dockerfilePath: dockerfilePath ?? "Dockerfile",
        extraFiles: (extraFiles ?? []).map((file) => ({ ...file }))
      });
      return { imageId: `mem-build-${state.builds.length}` };
    },
    async removeImage(imageIdOrTag) {
      state.removedImages.push(imageIdOrTag);
    }
  };
}
