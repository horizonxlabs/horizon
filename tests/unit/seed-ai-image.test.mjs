import test from "node:test";
import assert from "node:assert/strict";
import { seedImageGeneration } from "../../apps/platform-api/prisma/seed-ai-image.ts";

test("image seed clones an existing Gemini credential without exposing or inventing a key", async () => {
  const calls = { providers: [], keys: [], routes: [] };
  const sourceKey = {
    id: "aik_gemini",
    providerId: "aip_gemini",
    name: "Gemini key",
    usageMode: "production",
    quotaTokens: 123,
    fallbackPriority: 2,
    fingerprint: "fp_real",
    maskedValue: "***real",
    secretCiphertext: "vault:v1:opaque",
    keyVersion: 3,
    encryptionProvider: "vault",
    status: "active"
  };
  const prisma = {
    aiScenarioRoute: {
      findUnique: async () => null,
      upsert: async (args) => calls.routes.push(args)
    },
    aiProvider: {
      findMany: async () => [
        {
          id: "aip_gemini",
          name: "Gemini",
          adapter: "openai",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
          models: ["gemini-3.7-flash"],
          status: "active"
        }
      ],
      upsert: async (args) => calls.providers.push(args)
    },
    aiApiKey: {
      findMany: async () => [sourceKey],
      upsert: async (args) => calls.keys.push(args)
    }
  };

  await seedImageGeneration(prisma);

  assert.equal(calls.providers.length, 1);
  assert.equal(calls.providers[0].create.adapter, "google");
  assert.equal(calls.keys.length, 1);
  assert.equal(calls.keys[0].create.secretCiphertext, sourceKey.secretCiphertext);
  assert.equal(calls.keys[0].create.fingerprint, sourceKey.fingerprint);
  assert.doesNotMatch(JSON.stringify(calls), /seed-demo-image-key|fp_seed_demo_img/);
  assert.equal(calls.routes[0].create.scenario, "image_generation");
});

test("image seed preserves an explicitly configured image route", async () => {
  let mutated = false;
  const prisma = {
    aiScenarioRoute: {
      findUnique: async () => ({ primaryProviderId: "aip_custom_image" }),
      upsert: async () => {
        mutated = true;
      }
    },
    aiProvider: {
      findMany: async () => [],
      upsert: async () => {
        mutated = true;
      }
    },
    aiApiKey: {
      findMany: async () => [],
      upsert: async () => {
        mutated = true;
      }
    }
  };

  await seedImageGeneration(prisma);
  assert.equal(mutated, false);
});
