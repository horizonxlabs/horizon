import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createDockerCleanupController } from "../helpers/keycloak-theme-smoke-cleanup.mjs";

const container = "evcp-keycloak-theme-smoke-test-container";
const image = "evcp-keycloak-theme-smoke:test-image";

function ok(stdout = "") {
  return { status: 0, stdout, stderr: "" };
}

function missing(kind, target) {
  return {
    status: 1,
    stdout: kind === "inspect" ? "[]\n" : "",
    stderr: `Error response from daemon: No such ${kind === "container" ? "container" : "image"}: ${target}\n`
  };
}

function dockerSequence(results) {
  const calls = [];
  return {
    calls,
    docker(args) {
      calls.push(args);
      assert.ok(results.length > 0, `Unexpected Docker call: ${args.join(" ")}`);
      return results.shift();
    }
  };
}

function expectedCalls() {
  return [
    ["container", "rm", "--force", container],
    ["image", "rm", "--force", image],
    ["container", "inspect", container],
    ["image", "inspect", image]
  ];
}

test("cleanup is exact and idempotent when Docker resources exist or are already absent", () => {
  const sequence = dockerSequence([
    ok(`${container}\n`),
    ok(`Untagged: ${image}\n`),
    missing("container", container),
    missing("image", image),
    missing("container", container),
    missing("image", image),
    missing("container", container),
    missing("image", image)
  ]);
  const messages = [];
  const controller = createDockerCleanupController({
    container,
    image,
    docker: sequence.docker,
    logger: { log: (message) => messages.push(message), error() {} }
  });

  controller.cleanup();
  controller.cleanup();

  assert.deepEqual(sequence.calls, [...expectedCalls(), ...expectedCalls()]);
  assert.equal(messages.length, 2);
});

test("cleanup rejects Docker execution failures instead of treating them as absence", () => {
  const sequence = dockerSequence([
    { status: null, stdout: "", stderr: "", error: new Error("spawn docker ETIMEDOUT") },
    missing("image", image),
    missing("container", container),
    missing("image", image)
  ]);
  const controller = createDockerCleanupController({
    container,
    image,
    docker: sequence.docker,
    logger: { log() {}, error() {} }
  });

  assert.throws(() => controller.cleanup(), /spawn docker ETIMEDOUT/);
  assert.deepEqual(sequence.calls, expectedCalls());
});

test("cleanup rejects unexpected Docker errors and resources that still exist", async (t) => {
  await t.test("unexpected nonzero status", () => {
    const sequence = dockerSequence([
      { status: 125, stdout: "", stderr: "Cannot connect to the Docker daemon\n" },
      missing("image", image),
      missing("container", container),
      missing("image", image)
    ]);
    const controller = createDockerCleanupController({
      container,
      image,
      docker: sequence.docker,
      logger: { log() {}, error() {} }
    });

    assert.throws(() => controller.cleanup(), /Cannot connect to the Docker daemon/);
  });

  await t.test("successful inspect means the resource remains", () => {
    const sequence = dockerSequence([
      ok(container),
      ok(image),
      ok(`[{"Name":"/${container}"}]`),
      missing("image", image)
    ]);
    const controller = createDockerCleanupController({
      container,
      image,
      docker: sequence.docker,
      logger: { log() {}, error() {} }
    });

    assert.throws(() => controller.cleanup(), /still exists/);
  });

  await t.test("status zero with stderr is not accepted", () => {
    const sequence = dockerSequence([
      { status: 0, stdout: container, stderr: "unexpected warning\n" },
      missing("image", image),
      missing("container", container),
      missing("image", image)
    ]);
    const controller = createDockerCleanupController({
      container,
      image,
      docker: sequence.docker,
      logger: { log() {}, error() {} }
    });

    assert.throws(() => controller.cleanup(), /unexpected warning/);
  });
});

test("signal handlers unregister, clean up, and re-send the same signal", () => {
  const sequence = dockerSequence([
    missing("container", container),
    missing("image", image),
    missing("container", container),
    missing("image", image)
  ]);
  const processTarget = new EventEmitter();
  const kills = [];
  processTarget.pid = 4242;
  processTarget.kill = (pid, signal) => kills.push([pid, signal]);

  const controller = createDockerCleanupController({
    container,
    image,
    docker: sequence.docker,
    processTarget,
    logger: { log() {}, error() {} }
  });

  controller.registerSignalHandlers();
  assert.equal(processTarget.listenerCount("SIGINT"), 1);
  assert.equal(processTarget.listenerCount("SIGTERM"), 1);

  processTarget.emit("SIGTERM");

  assert.equal(processTarget.listenerCount("SIGINT"), 0);
  assert.equal(processTarget.listenerCount("SIGTERM"), 0);
  assert.deepEqual(sequence.calls, expectedCalls());
  assert.deepEqual(kills, [[4242, "SIGTERM"]]);
});

test("signal handlers preserve termination when cleanup reports a Docker failure", () => {
  const sequence = dockerSequence([
    { status: 125, stdout: "", stderr: "Cannot connect to the Docker daemon\n" },
    missing("image", image),
    missing("container", container),
    missing("image", image)
  ]);
  const processTarget = new EventEmitter();
  const kills = [];
  const errors = [];
  processTarget.pid = 4242;
  processTarget.kill = (pid, signal) => kills.push([pid, signal]);

  const controller = createDockerCleanupController({
    container,
    image,
    docker: sequence.docker,
    processTarget,
    logger: { log() {}, error: (message) => errors.push(message) }
  });

  controller.registerSignalHandlers();
  processTarget.emit("SIGINT");

  assert.equal(processTarget.listenerCount("SIGINT"), 0);
  assert.equal(processTarget.listenerCount("SIGTERM"), 0);
  assert.match(errors.join("\n"), /Cannot connect to the Docker daemon/);
  assert.deepEqual(kills, [[4242, "SIGINT"]]);
});

test("normal unregistration removes signal listeners without cleanup", () => {
  const processTarget = new EventEmitter();
  processTarget.pid = 4242;
  processTarget.kill = () => assert.fail("Signal must not be re-sent");
  const controller = createDockerCleanupController({
    container,
    image,
    docker: () => assert.fail("Cleanup must not run"),
    processTarget,
    logger: { log() {}, error() {} }
  });

  controller.registerSignalHandlers();
  controller.unregisterSignalHandlers();
  controller.unregisterSignalHandlers();

  assert.equal(processTarget.listenerCount("SIGINT"), 0);
  assert.equal(processTarget.listenerCount("SIGTERM"), 0);
});
