import { assertValidProjectSlug } from "./postgres-provisioner";

export interface DevContainerSpec {
  name: string;
  image: string;
  env: string[];
  hostConfig: {
    NanoCpus: number;
    Memory: number;
    NetworkMode: string;
    Binds: string[];
  };
  labels: Record<string, string>;
  exposedPort: 3000;
  publishPorts: false;
}

export function buildDevContainerSpec(input: {
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
      Binds: [`${input.workspaceVolume}:/workspace`]
    },
    labels: { "evcp.managed": "true", "evcp.project-slug": input.slug },
    exposedPort: 3000,
    publishPorts: false
  };
}

export function buildProdContainerSpec(input: {
  slug: string;
  image: string;
  env: Record<string, string>;
  cpuCores?: number;
  memoryMb?: number;
  network: string;
  workspaceVolume: string;
}): DevContainerSpec {
  assertValidProjectSlug(input.slug);
  const cpuCores = input.cpuCores ?? 1;
  const memoryMb = input.memoryMb ?? 1024;
  const env = { ...input.env, NODE_ENV: "production" };
  return {
    name: `evcp-prod-${input.slug}`,
    image: input.image,
    env: Object.entries(env).map(([name, value]) => `${name}=${value}`),
    hostConfig: {
      NanoCpus: Math.round(cpuCores * 1_000_000_000),
      Memory: memoryMb * 1024 * 1024,
      NetworkMode: input.network,
      Binds: [`${input.workspaceVolume}:/workspace`]
    },
    labels: { "evcp.managed": "true", "evcp.project-slug": input.slug, "evcp.env": "production" },
    exposedPort: 3000,
    publishPorts: false
  };
}

export interface DockerEngine {
  createContainer(spec: DevContainerSpec): Promise<{ containerId: string }>;
  startContainer(containerId: string): Promise<void>;
  stopContainer(containerId: string): Promise<void>;
  removeContainer(containerId: string): Promise<void>;
  execInContainer(containerId: string, cmd: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  commitContainer(containerId: string, imageTag: string): Promise<{ imageId: string }>;
}

interface MemoryContainer {
  containerId: string;
  spec: DevContainerSpec;
  status: "created" | "running" | "stopped";
}

export function createMemoryDockerEngine(): DockerEngine & {
  state: {
    containers: MemoryContainer[];
    execCalls: Array<{ containerId: string; cmd: string[] }>;
    commits: Array<{ containerId: string; imageTag: string }>;
  };
} {
  const state = {
    containers: [] as MemoryContainer[],
    execCalls: [] as Array<{ containerId: string; cmd: string[] }>,
    commits: [] as Array<{ containerId: string; imageTag: string }>
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
    async execInContainer(containerId, cmd) {
      find(containerId);
      state.execCalls.push({ containerId, cmd });
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    async commitContainer(containerId, imageTag) {
      find(containerId);
      state.commits.push({ containerId, imageTag });
      return { imageId: `mem-image-${state.commits.length}` };
    }
  };
}
