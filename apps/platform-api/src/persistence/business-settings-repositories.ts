import type { PlatformUser } from "../platform-services";
import { PermissionError, ValidationError } from "../platform-services";

type DateValue = Date | string;

export const BUSINESS_SETTINGS_SINGLETON_ID = "business_settings_singleton";

export interface BusinessSettingsRecord {
  id: string;
  businessName: string;
  timezone: string;
  locale: string;
  contactEmail?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  industry?: string | null;
  /** Real go-live domain (B2), e.g. "app.example.com" — set via POST /admin/system/domain. */
  domain?: string | null;
  setupCompletedAt?: DateValue | null;
  createdAt: DateValue;
  updatedAt: DateValue;
}

export interface BusinessSettingsInput {
  businessName: string;
  timezone?: string;
  locale?: string;
  contactEmail?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  industry?: string | null;
  domain?: string | null;
}

export interface SetupStatus {
  setupCompleted: boolean;
  businessName: string | null;
}

interface UpsertBusinessSettingsArgs {
  where: { id: string };
  update: Partial<BusinessSettingsRecord>;
  create: BusinessSettingsRecord;
}

export interface BusinessSettingsPersistenceClient {
  businessSettings: {
    findUnique(args: { where: { id: string } }): Promise<BusinessSettingsRecord | null>;
    upsert(args: UpsertBusinessSettingsArgs): Promise<BusinessSettingsRecord>;
  };
}

export class BusinessSettingsRepositoryBackedService {
  constructor(private readonly client: BusinessSettingsPersistenceClient) {}

  async getBusinessSettings(): Promise<BusinessSettingsRecord | null> {
    return this.client.businessSettings.findUnique({
      where: { id: BUSINESS_SETTINGS_SINGLETON_ID }
    });
  }

  async getSetupStatus(): Promise<SetupStatus> {
    const record = await this.getBusinessSettings();
    return {
      setupCompleted: Boolean(record?.setupCompletedAt),
      businessName: record?.businessName ?? null
    };
  }

  async saveBusinessSettings(
    actor: PlatformUser,
    input: BusinessSettingsInput
  ): Promise<BusinessSettingsRecord> {
    requireAdmin(actor);
    if (!input.businessName.trim()) throw new ValidationError("Business name is required");
    return this.upsertSingleton(input, undefined);
  }

  async completeSetup(business: BusinessSettingsInput): Promise<BusinessSettingsRecord> {
    if (!business.businessName.trim()) throw new ValidationError("Business name is required");
    return this.upsertSingleton(business, new Date());
  }

  /**
   * Sets only the go-live domain (B2), leaving every other business-settings field untouched.
   * Admin gating happens in the caller (domain-routes.ts), mirroring system-update-service —
   * this repository layer stays a thin persistence wrapper.
   */
  async setDomain(domain: string): Promise<BusinessSettingsRecord> {
    const now = new Date();
    const existing = await this.getBusinessSettings();
    return this.client.businessSettings.upsert({
      where: { id: BUSINESS_SETTINGS_SINGLETON_ID },
      update: { domain, updatedAt: now },
      create: {
        id: BUSINESS_SETTINGS_SINGLETON_ID,
        businessName: existing?.businessName ?? "",
        timezone: existing?.timezone ?? "Asia/Bangkok",
        locale: existing?.locale ?? "th",
        contactEmail: existing?.contactEmail ?? null,
        website: existing?.website ?? null,
        logoUrl: existing?.logoUrl ?? null,
        industry: existing?.industry ?? null,
        domain,
        setupCompletedAt: existing?.setupCompletedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      }
    });
  }

  private async upsertSingleton(
    input: BusinessSettingsInput,
    setupCompletedAt: Date | undefined
  ): Promise<BusinessSettingsRecord> {
    const now = new Date();
    const businessName = input.businessName.trim();
    const timezone = input.timezone?.trim() || "Asia/Bangkok";
    const locale = input.locale?.trim() || "th";
    const contactEmail = normalizeOptional(input.contactEmail);
    const website = normalizeOptional(input.website);
    const logoUrl = normalizeOptional(input.logoUrl);
    const industry = normalizeOptional(input.industry);

    const update: Partial<BusinessSettingsRecord> = {
      businessName,
      timezone,
      locale,
      contactEmail,
      website,
      logoUrl,
      industry,
      updatedAt: now
    };
    // completeSetup stamps setupCompletedAt; saveBusinessSettings never mutates it.
    if (setupCompletedAt) update.setupCompletedAt = setupCompletedAt;

    return this.client.businessSettings.upsert({
      where: { id: BUSINESS_SETTINGS_SINGLETON_ID },
      update,
      create: {
        id: BUSINESS_SETTINGS_SINGLETON_ID,
        businessName,
        timezone,
        locale,
        contactEmail,
        website,
        logoUrl,
        industry,
        setupCompletedAt: setupCompletedAt ?? null,
        createdAt: now,
        updatedAt: now
      }
    });
  }
}

export class MemoryBusinessSettingsPersistenceClient
  implements BusinessSettingsPersistenceClient
{
  businessSettings: BusinessSettingsPersistenceClient["businessSettings"];

  private record: BusinessSettingsRecord | null;

  constructor(seed: { record?: BusinessSettingsRecord | null } = {}) {
    this.record = seed.record ?? null;
    this.businessSettings = {
      findUnique: async ({ where }) =>
        this.record && this.record.id === where.id ? this.record : null,
      upsert: async ({ where, update, create }) => {
        if (this.record && this.record.id === where.id) {
          this.record = { ...this.record, ...update };
          return this.record;
        }
        this.record = create;
        return this.record;
      }
    };
  }
}

export function createBusinessSettingsRepositoryBackedService(
  client: BusinessSettingsPersistenceClient = new MemoryBusinessSettingsPersistenceClient()
): BusinessSettingsRepositoryBackedService {
  return new BusinessSettingsRepositoryBackedService(client);
}

export async function createPrismaBusinessSettingsPersistence(
  databaseUrl = process.env.DATABASE_URL
): Promise<{
  client: BusinessSettingsPersistenceClient;
  service: BusinessSettingsRepositoryBackedService;
}> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined
  ) as unknown as BusinessSettingsPersistenceClient;
  return {
    client,
    service: new BusinessSettingsRepositoryBackedService(client)
  };
}

function requireAdmin(actor: PlatformUser): void {
  if (actor.role !== "admin") {
    throw new PermissionError(`Role ${actor.role} cannot manage business settings`);
  }
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
