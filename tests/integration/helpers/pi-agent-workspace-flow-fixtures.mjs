import {
  buildDevContainerSpec,
  createMemoryDockerEngine
} from "../../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

export const actor = {
  id: "creator-integration",
  email: "creator@example.test",
  name: "Creator",
  role: "creator"
};

export async function drain(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

export async function memoryWorkspace() {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer(
    buildDevContainerSpec({
      projectId: "project-flow",
      slug: "pi-flow",
      image: "workspace:test",
      env: {},
      cpuCores: 1,
      memoryMb: 512,
      network: "test"
    })
  );
  await docker.startContainer(containerId);
  const files = new Map([
    ["app/page.tsx", "export default function Page() { return <h1>Old</h1>; }"],
    ["lib/mock-data.ts", "export const rows = [];\n"]
  ]);
  const originalExec = docker.execInContainer.bind(docker);
  docker.execInContainer = async (id, command) => {
    await originalExec(id, command);
    const script =
      command[0] === "sh" && command[1] === "-c"
        ? command[2]
        : command[0] === "su" && command[4] === "-c"
          ? command[5]
          : undefined;
    if (script === undefined) {
      return { stdout: command[0] === "pnpm" ? "checks passed\n" : "", stderr: "", exitCode: 0 };
    }
    const sizePath = script.match(/^wc -c < '([^']+)'/)?.[1];
    if (sizePath) {
      const content = files.get(sizePath);
      return {
        stdout: `${content === undefined ? -1 : Buffer.byteLength(content, "utf8")}\n`,
        stderr: "",
        exitCode: 0
      };
    }
    const readPath = script.match(/^base64 < '([^']+)'/)?.[1];
    if (readPath) {
      const content = files.get(readPath);
      return {
        stdout:
          content === undefined
            ? "__EVCP_MISSING__\n"
            : `${Buffer.from(content).toString("base64")}\n`,
        stderr: "",
        exitCode: 0
      };
    }
    for (const match of script.matchAll(/echo ([A-Za-z0-9+/=]+) \| base64 -d > '([^']+)'/g)) {
      files.set(match[2], Buffer.from(match[1], "base64").toString("utf8"));
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  docker.execInContainerStream = async (id, command, onChunk) => {
    await originalExec(id, command);
    onChunk("checks passed\n");
    return { exitCode: 0 };
  };
  return { docker, containerId, files };
}

export function scriptedGovernedAiExecutor(script, finalText) {
  let round = 0;
  return {
    async executeAgentRound(_actor, input) {
      const step = script[round++];
      return {
        status: "succeeded",
        message: step
          ? {
              role: "assistant",
              content: [
                { type: "toolCall", id: `call-${round}`, name: step[0], arguments: step[1] }
              ],
              timestamp: round
            }
          : {
              role: "assistant",
              content: [{ type: "text", text: finalText }],
              timestamp: round
            },
        usage: { input: 2, output: 1, totalTokens: 3, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
}

export function instrumentedCheckpoints(store, onCreate) {
  return {
    async createCheckpoint(input) {
      onCreate();
      return store.createCheckpoint(input);
    },
    listCheckpoints: (projectId) => store.listCheckpoints(projectId)
  };
}
