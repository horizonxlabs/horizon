import assert from "node:assert/strict";
import { createDefaultGenerationService } from "../../apps/platform-api/src/generation-loop/factory.ts";

const acceptancePath = "public/hot-handoff-acceptance.md";
const acceptanceContent = "hot handoff edit\n";

// Only model selection is scripted. The production factory resolves the logical project,
// and the real Pi tools, path/command policies, action runner, snapshots and commits execute.
export async function runHotWorkspaceActions({
  orchestrator,
  docker,
  projectId,
  actor,
  expectedContainerId
}) {
  const observed = [];
  for (const method of ["execInContainer", "execInContainerStream"]) {
    const execute = docker[method].bind(docker);
    docker[method] = (containerId, command, ...args) => {
      const script = command.at(-1);
      observed.push({
        containerId,
        kind:
          command[0] === "su" && script.includes("base64 -d >")
            ? "file"
            : script.includes("evcp-agent-validation.")
              ? "command"
              : "other"
      });
      return execute(containerId, command, ...args);
    };
  }
  const toolCalls = [
    {
      name: "write_workspace_file",
      arguments: { path: acceptancePath, content: "hot handoff initial\n" }
    },
    {
      name: "edit_workspace_file",
      arguments: { path: acceptancePath, find: "initial", replace: "edit" }
    },
    { name: "run_workspace_command", arguments: { command: "npm", args: ["run", "build"] } }
  ];
  let round = 0;
  const service = await createDefaultGenerationService({
    orchestrator,
    docker,
    // Use in-memory chat/checkpoints for this isolated fixture; workspace adapters stay real.
    env: { EVCP_WORKSPACE_REAL_ADAPTERS: "1", EVCP_CORE_PERSISTENCE: "legacy" },
    governedAiExecutor: {
      async executeAgentRound(currentActor, input) {
        assert.equal(currentActor.id, actor.id);
        assert.equal(input.projectId, projectId);
        const call = toolCalls[round++];
        return {
          status: "succeeded",
          message: {
            role: "assistant",
            content: call
              ? [{ type: "toolCall", id: `hot-action-${round}`, ...call }]
              : [{ type: "text", text: "Acceptance actions complete." }],
            timestamp: Date.now()
          },
          usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    }
  });
  const events = [];
  for await (const event of service.runTurn({
    projectId,
    actor,
    agentMode: "build",
    prompt: "Edit the acceptance marker and validate the workspace build."
  })) {
    // Store only non-secret action outcome fields, never generated command output.
    events.push({ type: event.type, actionType: event.actionType, ok: event.ok });
  }
  assert.equal(
    events.some((event) => event.type === "error"),
    false,
    "production generation turn must complete without errors"
  );
  assert.deepEqual(
    events
      .filter((event) => event.type === "action_result")
      .map(({ actionType, ok }) => ({ actionType, ok })),
    [
      { actionType: "file", ok: true },
      { actionType: "edit", ok: true },
      { actionType: "shell", ok: true }
    ]
  );
  assert.equal(
    events.some((event) => event.type === "commit"),
    true,
    "file actions must be committed through the production generation lifecycle"
  );
  assert.ok(
    observed.filter((call) => call.kind === "file").length >= 2,
    "both write and edit must reach Docker"
  );
  assert.ok(
    observed.some((call) => call.kind === "command"),
    "allowlisted build must reach the production command runner"
  );
  assert.equal(
    observed.every((call) => call.containerId === expectedContainerId),
    true,
    "all production file/command operations must use the claimed physical container ID"
  );
  return {
    async assertFilePersists() {
      const before = observed.length;
      const files = await service.listWorkspaceFiles(projectId);
      assert.equal(
        files.find((file) => file.path === acceptancePath)?.content,
        acceptanceContent,
        "production file browser must read the edited file by logical project ID"
      );
      assert.ok(observed.length > before);
      assert.equal(
        observed.slice(before).every((call) => call.containerId === expectedContainerId),
        true
      );
    }
  };
}
