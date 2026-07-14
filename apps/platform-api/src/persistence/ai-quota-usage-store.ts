export type AiQuotaUsageRecord = {
  id: string;
  scope: string;
  scopeId: string;
  usedToday: number;
  createdAt?: Date | string;
};

export type AiQuotaUsagePersistence = {
  findUnique(args: { where: { scope_scopeId: { scope: string; scopeId: string } } }): Promise<AiQuotaUsageRecord | null>;
  upsert(args: {
    where: { scope_scopeId: { scope: string; scopeId: string } };
    update: Partial<AiQuotaUsageRecord>;
    create: AiQuotaUsageRecord;
  }): Promise<AiQuotaUsageRecord>;
};

export function createMemoryAiQuotaUsagePersistence(): AiQuotaUsagePersistence {
  const rows: AiQuotaUsageRecord[] = [];
  return {
    findUnique: async ({ where }) => rows.find((row) => row.scope === where.scope_scopeId.scope && row.scopeId === where.scope_scopeId.scopeId) ?? null,
    upsert: async ({ where, update, create }) => {
      const index = rows.findIndex((row) => row.scope === where.scope_scopeId.scope && row.scopeId === where.scope_scopeId.scopeId);
      if (index < 0) return rows[rows.push({ ...create }) - 1];
      rows[index] = { ...rows[index], ...update };
      return rows[index];
    }
  };
}
