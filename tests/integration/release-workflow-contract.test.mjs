import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const releaseWorkflow = parse(
  readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8")
);
const releaseCompose = parse(
  readFileSync(new URL("../../docker/docker-compose.release.yml", import.meta.url), "utf8")
);

const releaseImageServices = [
  ["keycloak", "evcp-keycloak", "Build and push keycloak", "keycloak"],
  ["platform-api", "evcp-platform-api", "Build and push platform-api", "platform_api"],
  ["admin-web", "evcp-admin-web", "Build and push admin-web", "admin_web"],
  ["creator-web", "evcp-creator-web", "Build and push creator-web", "creator_web"],
  ["app-store-pwa", "evcp-app-store-pwa", "Build and push app-store-pwa", "app_store_pwa"],
  ["workspace-next-image", "evcp-workspace-next", "Build and push workspace-next", "workspace_next"]
];

function publishSteps() {
  return releaseWorkflow.jobs.publish.steps;
}

function stepByName(name) {
  return publishSteps().find((step) => step.name === name);
}

test("release workflows check out the selected release ref before quality and publish", () => {
  const expectedRef = "${{ inputs.version || github.ref }}";
  const qualityCheckout = releaseWorkflow.jobs.quality.steps.find((step) => step.name === "Checkout");
  const publishCheckout = stepByName("Checkout");

  assert.equal(qualityCheckout.uses, "actions/checkout@v7");
  assert.equal(qualityCheckout.with.ref, expectedRef);
  assert.equal(publishCheckout.uses, "actions/checkout@v7");
  assert.equal(publishCheckout.with.ref, expectedRef);
  assert.equal(publishCheckout.with["fetch-depth"], 0);
});

test("release source SHA is resolved from the selected release tag", () => {
  const sourceStep = stepByName("Validate release tag");

  assert.equal(sourceStep.id, "source");
  assert.match(sourceStep.run, /source_sha=\$\(git rev-parse "\$\{RELEASE_VERSION\}\^\{commit\}"\)/);
  assert.match(sourceStep.run, /echo "sha=\$\{source_sha\}" >> "\$\{GITHUB_OUTPUT\}"/);
});

test("release workflow builds and pushes every image referenced by release compose from the resolved source", () => {
  for (const [serviceName, imageName, buildStepName, buildStepId] of releaseImageServices) {
    const image = releaseCompose.services[serviceName].image;
    const buildStep = stepByName(buildStepName);
    const expectedTags = [
      "${{ steps.release.outputs.image_repository }}/" + imageName + ":${{ steps.release.outputs.version }}",
      "${{ steps.release.outputs.image_repository }}/" + imageName + ":${{ steps.source.outputs.sha }}"
    ].join("\n");

    assert.match(image, new RegExp(`/${imageName}:`), `${serviceName} compose image mismatch`);
    assert.equal(buildStep.id, buildStepId);
    assert.equal(buildStep.uses, "docker/build-push-action@v7");
    assert.equal(buildStep.with.push, true);
    assert.equal(buildStep.with.tags.trim(), expectedTags);
    assert.match(
      buildStep.with.labels,
      /org\.opencontainers\.image\.revision=\$\{\{ steps\.source\.outputs\.sha \}\}/
    );
  }
});

test("Keycloak build is the pinned release image build", () => {
  const keycloakStep = stepByName("Build and push keycloak");

  assert.equal(keycloakStep.id, "keycloak");
  assert.equal(keycloakStep.with.file, "docker/keycloak.Dockerfile");
  assert.equal(keycloakStep.with.push, true);
});

test("release workflow signs and manifests image digests from their matching build steps", () => {
  const signStep = stepByName("Sign image digests");
  const assetStep = stepByName("Create release assets");

  for (const [, imageName, , buildStepId] of releaseImageServices) {
    const digestEnv = `${buildStepId.toUpperCase()}_DIGEST`;
    const manifestImageName = imageName.replace("evcp-", "");

    assert.equal(signStep.env[digestEnv], `\${{ steps.${buildStepId}.outputs.digest }}`);
    assert.equal(assetStep.env[digestEnv], `\${{ steps.${buildStepId}.outputs.digest }}`);
    assert.match(signStep.run, new RegExp(`${imageName}@\\$\\{${digestEnv}\\}`));
    assert.match(
      assetStep.run,
      new RegExp(`"${manifestImageName}": \\{[\\s\\S]*?"digest": "\\$\\{${digestEnv}\\}"`)
    );
  }
});

test("release assets bind the resolved source SHA into the manifest and notes", () => {
  const assetStep = stepByName("Create release assets");

  assert.equal(assetStep.env.SOURCE_SHA, "${{ steps.source.outputs.sha }}");
  assert.match(assetStep.run, /"sourceSha": "\$\{SOURCE_SHA\}"/);
  assert.ok(assetStep.run.includes("Source SHA: \\`${SOURCE_SHA}\\`"));
  assert.doesNotMatch(assetStep.run, /GITHUB_SHA/);
});

test("publish step IDs are unique", () => {
  const ids = publishSteps().map((step) => step.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
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
