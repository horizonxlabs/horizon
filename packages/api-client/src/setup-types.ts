// First-run setup + business-settings DTOs. Kept in a focused module and re-exported from the
// package entry so the client class stays lean.

export type SetupStatusDto = {
  setupCompleted: boolean;
  businessName: string | null;
};

export type SetupInitializeInput = {
  business: {
    businessName: string;
    timezone: string;
    locale: string;
    contactEmail?: string;
    website?: string;
    logoUrl?: string;
    industry?: string;
  };
  admin: {
    email: string;
    name: string;
    password: string;
  };
};

export type BusinessSettingsDto = {
  businessName: string;
  timezone: string;
  locale: string;
  contactEmail: string | null;
  website: string | null;
  logoUrl: string | null;
  industry: string | null;
  setupCompleted: boolean;
  setupCompletedAt: string | null;
};

export type BusinessSettingsInput = {
  businessName: string;
  timezone: string;
  locale: string;
  contactEmail?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  industry?: string | null;
};
