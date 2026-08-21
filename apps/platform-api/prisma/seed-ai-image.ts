import type { PrismaClient } from "@prisma/client";

// Image-generation governance seed: a Google (Gemini) provider + the image_generation
// scenario route. Kept out of seed.ts (that file sits at its large-file ratchet ceiling).
// The demo key is a placeholder ciphertext — a real install must supply a key in the
// admin console before the generate_image tool activates; until then the tool fails soft.
export async function seedImageGeneration(prisma: PrismaClient): Promise<void> {
  const provider = {
    name: "Google Gemini Images",
    adapter: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-2.5-flash-image"],
    status: "active"
  };
  await prisma.aiProvider.upsert({
    where: { id: "aip_google_image" },
    update: provider,
    create: { id: "aip_google_image", ...provider }
  });

  const key = {
    name: "Gemini Image Key",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1,
    fingerprint: "fp_seed_demo_img_001",
    maskedValue: "AI...demo",
    secretCiphertext: "local-envelope:c2VlZC1kZW1vLWltYWdlLWtleQ==",
    keyVersion: 1,
    encryptionProvider: "local-envelope",
    status: "active"
  };
  await prisma.aiApiKey.upsert({
    where: { id: "aik_google_image_primary" },
    update: key,
    create: { id: "aik_google_image_primary", providerId: "aip_google_image", ...key }
  });

  await prisma.aiScenarioRoute.upsert({
    where: { scenario: "image_generation" },
    update: {
      primaryProviderId: "aip_google_image",
      primaryModel: "gemini-2.5-flash-image",
      fallbackProviderId: null,
      fallbackModel: null
    },
    create: {
      id: "air_image_generation",
      scenario: "image_generation",
      primaryProviderId: "aip_google_image",
      primaryModel: "gemini-2.5-flash-image"
    }
  });
}
