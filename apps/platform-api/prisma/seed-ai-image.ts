import type { PrismaClient } from "@prisma/client";

const IMAGE_PROVIDER_ID = "aip_google_image";
const IMAGE_KEY_ID = "aik_google_image_primary";
const IMAGE_MODEL = process.env.EVCP_GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

// Reuse an administrator-supplied Gemini credential. The encrypted value is copied
// server-side; seed data must never invent or reactivate a fake production secret.
// An explicitly configured image route always wins over this automatic setup.
export async function seedImageGeneration(prisma: PrismaClient): Promise<void> {
  const currentRoute = await prisma.aiScenarioRoute.findUnique({
    where: { scenario: "image_generation" }
  });
  const providers = await prisma.aiProvider.findMany();
  const keys = await prisma.aiApiKey.findMany();
  const configuredProvider = currentRoute
    ? providers.find((provider) => provider.id === currentRoute.primaryProviderId)
    : undefined;
  const hasUsableConfiguredRoute =
    configuredProvider &&
    configuredProvider.status === "active" &&
    ["google", "openai"].includes(configuredProvider.adapter) &&
    configuredProvider.models.includes(currentRoute?.primaryModel ?? "") &&
    keys.some(
      (key) => key.providerId === configuredProvider.id && key.status === "active"
    );
  if (
    currentRoute &&
    currentRoute.primaryProviderId !== IMAGE_PROVIDER_ID &&
    hasUsableConfiguredRoute
  )
    return;

  const sourceProvider = providers.find(
    (provider) =>
      provider.id !== IMAGE_PROVIDER_ID &&
      provider.status === "active" &&
      /gemini|generativelanguage\.googleapis\.com/i.test(`${provider.name} ${provider.baseUrl}`) &&
      keys.some((key) => key.providerId === provider.id && key.status === "active")
  );
  if (!sourceProvider) return;
  const sourceKey = keys.find(
    (key) => key.providerId === sourceProvider.id && key.status === "active"
  );
  if (!sourceKey) return;

  const provider = {
    name: "Gemini Images",
    adapter: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: [IMAGE_MODEL],
    status: "active" as const
  };
  await prisma.aiProvider.upsert({
    where: { id: IMAGE_PROVIDER_ID },
    update: provider,
    create: { id: IMAGE_PROVIDER_ID, ...provider }
  });

  const key = {
    name: "Gemini Image Key",
    usageMode: sourceKey.usageMode,
    quotaTokens: sourceKey.quotaTokens,
    fallbackPriority: sourceKey.fallbackPriority,
    fingerprint: sourceKey.fingerprint,
    maskedValue: sourceKey.maskedValue,
    secretCiphertext: sourceKey.secretCiphertext,
    keyVersion: sourceKey.keyVersion,
    encryptionProvider: sourceKey.encryptionProvider,
    status: "active"
  };
  await prisma.aiApiKey.upsert({
    where: { id: IMAGE_KEY_ID },
    update: key,
    create: { id: IMAGE_KEY_ID, providerId: IMAGE_PROVIDER_ID, ...key }
  });

  await prisma.aiScenarioRoute.upsert({
    where: { scenario: "image_generation" },
    update: {
      primaryProviderId: IMAGE_PROVIDER_ID,
      primaryModel: IMAGE_MODEL,
      fallbackProviderId: null,
      fallbackModel: null
    },
    create: {
      id: "air_image_generation",
      scenario: "image_generation",
      primaryProviderId: IMAGE_PROVIDER_ID,
      primaryModel: IMAGE_MODEL
    }
  });
}
