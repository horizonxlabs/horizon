import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const releaseWorkflowText = readFileSync(
  new URL("../../.github/workflows/release.yml", import.meta.url),
  "utf8"
);
const releaseWorkflow = parse(releaseWorkflowText);
const releaseCompose = parse(
  readFileSync(new URL("../../docker/docker-compose.release.yml", import.meta.url), "utf8")
);

const releaseImageServices = [
  ["platform-api", "evcp-platform-api"],
  ["admin-web", "evcp-admin-web"],
  ["creator-web", "evcp-creator-web"],
  ["app-store-pwa", "evcp-app-store-pwa"],
  ["workspace-next-image", "evcp-workspace-next"]
];

function publishSteps() {
  return releaseWorkflow.jobs.publish.steps;
}

function stepByName(name) {
  return publishSteps().find((step) => step.name === name);
}

test("release workflow builds and pushes every image referenced by release compose", () => {
  for (const [serviceName, imageName] of releaseImageServices) {
    const image = releaseCompose.services[serviceName].image;
    assert.match(image, new RegExp(`/${imageName}:`), `${serviceName} compose image mismatch`);
    assert.match(
      releaseWorkflowText,
      new RegExp(`Build and push .*${imageName.replace("evcp-", "").replaceAll("-", ".*")}`),
      `${imageName} build step missing`
    );
    assert.match(releaseWorkflowText, new RegExp(`/${imageName}:\\$\\{\\{ steps\\.release\\.outputs\\.version`));
    assert.match(releaseWorkflowText, new RegExp(`/${imageName}:\\$\\{\\{ github\\.sha`));
  }
});

test("release workflow signs and manifests workspace runtime image", () => {
  assert.equal(stepByName("Build and push workspace-next").uses, "docker/build-push-action@v7");
  assert.match(stepByName("Build and push workspace-next").with.file, /workspace-next\.Dockerfile/);

  const signStep = stepByName("Sign image digests");
  assert.match(signStep.run, /evcp-workspace-next@\$\{WORKSPACE_NEXT_DIGEST\}/);
  assert.equal(signStep.env.WORKSPACE_NEXT_DIGEST, "${{ steps.workspace_next.outputs.digest }}");

  const assetStep = stepByName("Create release assets");
  assert.match(assetStep.run, /"workspace-next"/);
  assert.match(assetStep.run, /evcp-workspace-next:\$\{VERSION\}/);
  assert.match(assetStep.run, /"digest": "\$\{WORKSPACE_NEXT_DIGEST\}"/);
});

test("release workflow validates rendered compose image coordinates", () => {
  const validateStep = stepByName("Validate release compose image coordinates");
  assert.ok(validateStep, "release workflow must validate compose image coordinates");
  assert.equal(validateStep.env.EVCP_IMAGE_REPOSITORY, "${{ steps.release.outputs.image_repository }}");
  assert.equal(validateStep.env.EVCP_VERSION, "${{ steps.release.outputs.version }}");
  for (const [, imageName] of releaseImageServices) {
    assert.match(validateStep.run, new RegExp(`\\$\\{EVCP_IMAGE_REPOSITORY\\}/${imageName}:\\$\\{EVCP_VERSION\\}`));
  }
  assert.match(validateStep.run, /workspace-next-image/);
});
