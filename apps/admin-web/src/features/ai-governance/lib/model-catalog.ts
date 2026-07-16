import type { ProviderModelCatalogDto } from "@evcp/api-client";

export type CatalogModel = ProviderModelCatalogDto["models"][number];

export function filterModels(models: CatalogModel[], query: string): CatalogModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter(
    (model) => model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q)
  );
}
