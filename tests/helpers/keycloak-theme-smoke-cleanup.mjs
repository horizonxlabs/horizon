const cleanupSignals = ["SIGINT", "SIGTERM"];

function commandOutput(result) {
  return [result?.stderr, result?.stdout]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim())
    .join("\n");
}

function expectedNotFound(result, kind, target) {
  if (result.status !== 1) return false;

  const expectedMessages =
    kind === "container"
      ? [
          `Error response from daemon: No such container: ${target}`,
          `Error: No such container: ${target}`
        ]
      : [
          `Error response from daemon: No such image: ${target}`,
          `Error: No such image: ${target}`,
          `Error: No such object: ${target}`
        ];

  return expectedMessages.includes(result.stderr?.trim());
}

function assertDockerExecuted(action, result) {
  if (result?.error || result?.status === null || !Number.isInteger(result?.status)) {
    throw new Error(
      `${action} could not execute: ${result?.error?.message || "unknown Docker error"}`
    );
  }

  if (result.status === 0 && result.stderr?.trim()) {
    throw new Error(`${action} wrote unexpected stderr: ${result.stderr.trim()}`);
  }
}

function assertRemovedOrAbsent(action, kind, target, result) {
  assertDockerExecuted(action, result);
  if (result.status === 0 || expectedNotFound(result, kind, target)) return;

  throw new Error(
    `${action} failed with status ${result.status}: ${commandOutput(result) || "no Docker output"}`
  );
}

function assertAbsent(action, kind, target, result) {
  assertDockerExecuted(action, result);
  if (expectedNotFound(result, kind, target)) return;
  if (result.status === 0) throw new Error(`${action} failed: ${kind} still exists: ${target}`);

  throw new Error(
    `${action} failed with status ${result.status}: ${commandOutput(result) || "no Docker output"}`
  );
}

export function createDockerCleanupController({
  container,
  image,
  docker,
  processTarget = process,
  logger = console
}) {
  const signalHandlers = new Map();
  let handlersRegistered = false;

  function cleanup() {
    const errors = [];
    const attempt = (operation) => {
      try {
        operation();
      } catch (error) {
        errors.push(error);
      }
    };

    attempt(() => {
      const result = docker(["container", "rm", "--force", container], {
        timeout: 30_000
      });
      assertRemovedOrAbsent("Container removal", "container", container, result);
    });
    attempt(() => {
      const result = docker(["image", "rm", "--force", image], { timeout: 60_000 });
      assertRemovedOrAbsent("Image removal", "image", image, result);
    });
    attempt(() => {
      const result = docker(["container", "inspect", container], { timeout: 10_000 });
      assertAbsent("Container cleanup verification", "container", container, result);
    });
    attempt(() => {
      const result = docker(["image", "inspect", image], { timeout: 10_000 });
      assertAbsent("Image cleanup verification", "image", image, result);
    });

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `Docker cleanup failed for exact resources:\n${errors.map((error) => error.message).join("\n")}`
      );
    }

    logger.log(`Cleanup verified for ${container} and ${image}`);
  }

  function unregisterSignalHandlers() {
    if (!handlersRegistered) return;
    for (const [signal, handler] of signalHandlers) processTarget.off(signal, handler);
    signalHandlers.clear();
    handlersRegistered = false;
  }

  function registerSignalHandlers() {
    if (handlersRegistered) return;

    for (const signal of cleanupSignals) {
      const handler = () => {
        unregisterSignalHandlers();
        try {
          cleanup();
        } catch (error) {
          logger.error(error.stack || error.message);
        } finally {
          processTarget.kill(processTarget.pid, signal);
        }
      };
      signalHandlers.set(signal, handler);
      processTarget.on(signal, handler);
    }
    handlersRegistered = true;
  }

  return { cleanup, registerSignalHandlers, unregisterSignalHandlers };
}
