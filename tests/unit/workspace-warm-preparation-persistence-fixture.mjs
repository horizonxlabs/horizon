export function createWarmPreparationPersistenceModel() {
  const rows = new Map();
  return {
    async findMany() {
      return [...rows.values()].map((row) => structuredClone(row));
    },
    async create({ data }) {
      if (rows.has(data.resourceKey)) throw new Error("duplicate warm generation");
      const row = { ...data, settled: false };
      rows.set(data.resourceKey, row);
      return structuredClone(row);
    },
    async updateMany({ where, data }) {
      const row = rows.get(where.resourceKey);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
    async deleteMany({ where }) {
      return { count: rows.delete(where.resourceKey) ? 1 : 0 };
    }
  };
}
