import assert from "node:assert/strict";
import test from "node:test";

import { persistPiTurnErrorAssistant } from "../../apps/platform-api/src/generation-loop/pi-turn-error-persistence.ts";
import { ChatHistoryRepositoryBackedStore } from "../../apps/platform-api/src/persistence/chat-history-repository.ts";

function repositoryFixture() {
  const records = new Map();
  let loseNextWriteAcknowledgement = false;
  let writeCalls = 0;
  const client = {
    chatMessage: {
      async create({ data }) {
        writeCalls += 1;
        if (records.has(data.id)) throw new Error("duplicate message ID");
        records.set(data.id, data);
        if (loseNextWriteAcknowledgement) {
          loseNextWriteAcknowledgement = false;
          throw new Error("database acknowledgement lost");
        }
        return data;
      },
      async findUnique({ where }) {
        return records.get(where.id) ?? null;
      },
      async updateMany({ where, data }) {
        writeCalls += 1;
        const existing = records.get(where.id);
        if (!existing || existing.projectId !== where.projectId || existing.role !== where.role) {
          return { count: 0 };
        }
        records.set(where.id, { ...existing, ...data });
        if (loseNextWriteAcknowledgement) {
          loseNextWriteAcknowledgement = false;
          throw new Error("database acknowledgement lost");
        }
        return { count: 1 };
      },
      async findMany({ where }) {
        return [...records.values()]
          .filter((record) => record.projectId === where.projectId)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      }
    },
    chatSummary: {
      async upsert({ create }) {
        return create;
      },
      async findUnique() {
        return null;
      }
    }
  };
  return {
    store: new ChatHistoryRepositoryBackedStore(client),
    loseNextAcknowledgement() {
      loseNextWriteAcknowledgement = true;
    },
    records,
    writeCalls: () => writeCalls
  };
}

test("lost upsert acknowledgement retries idempotently and persists warning plus commit SHA", async () => {
  const fixture = repositoryFixture();
  const assistant = {
    id: "assistant-1",
    projectId: "p1",
    role: "assistant",
    agentMode: "auto",
    content: "Candidate ready",
    artifactActionIds: ["action-1"],
    actions: [],
    commitSha: null,
    tokenUsage: { promptTokens: 2, completionTokens: 3 },
    createdAt: "2026-08-16T00:00:00.000Z"
  };
  await fixture.store.appendMessage(assistant);
  const writesBeforePersistence = fixture.writeCalls();
  fixture.loseNextAcknowledgement();

  const errorMessage = await persistPiTurnErrorAssistant({
    chatHistory: fixture.store,
    projectId: "p1",
    mode: "auto",
    assistantText: "Candidate ready",
    errorMessage: "evidence persistence failed",
    inputAborted: false,
    preservedCommitSha: "candidate-sha",
    assistantMessage: { ...assistant },
    artifactActionIds: ["action-1"],
    actions: [],
    tokenUsage: { promptTokens: 2, completionTokens: 3 }
  });

  assert.equal(errorMessage, "evidence persistence failed");
  const messages = await fixture.store.listMessages("p1");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].commitSha, "candidate-sha");
  assert.match(messages[0].content, /evidence persistence failed/);
  assert.equal(fixture.writeCalls() - writesBeforePersistence, 2);
});

test("repository rejects reuse of a message ID across project or role identities", async () => {
  const fixture = repositoryFixture();
  const base = {
    id: "identity-1",
    projectId: "p1",
    role: "assistant",
    content: "original",
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt: "2026-08-16T00:00:00.000Z"
  };
  await fixture.store.appendMessage(base);

  await assert.rejects(
    () => fixture.store.appendMessage({ ...base, projectId: "p2" }),
    /message identity conflict/i
  );
  await assert.rejects(
    () => fixture.store.appendMessage({ ...base, role: "user" }),
    /message identity conflict/i
  );

  assert.equal(fixture.records.size, 1);
  assert.equal((await fixture.store.listMessages("p1"))[0].content, "original");
});

test("concurrent same-identity appends converge on one row", async () => {
  const fixture = repositoryFixture();
  const base = {
    id: "concurrent-1",
    projectId: "p1",
    role: "assistant",
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt: "2026-08-16T00:00:00.000Z"
  };

  await Promise.all([
    fixture.store.appendMessage({ ...base, content: "first" }),
    fixture.store.appendMessage({ ...base, content: "second" })
  ]);

  assert.equal(fixture.records.size, 1);
  assert.equal((await fixture.store.listMessages("p1")).length, 1);
});
