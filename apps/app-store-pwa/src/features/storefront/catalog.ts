import type { AppStoreItem } from "@evcp/types";

export type StoreCatalogCollection = "all" | "my-apps" | "available";

export type StoreCatalogFilters = {
  collection: StoreCatalogCollection;
  accessStatus?: AppStoreItem["accessStatus"];
  installStatus?: NonNullable<AppStoreItem["installStatus"]>;
};

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function matchesCollection(app: AppStoreItem, collection: StoreCatalogCollection): boolean {
  if (collection === "all") return true;
  return collection === "my-apps" ? app.accessStatus === "active" : app.accessStatus !== "active";
}

export function filterStoreApps(
  apps: readonly AppStoreItem[],
  query: string,
  filters: StoreCatalogFilters
): AppStoreItem[] {
  const search = normalized(query);
  return apps.filter((app) => {
    if (!matchesCollection(app, filters.collection)) return false;
    if (filters.accessStatus && app.accessStatus !== filters.accessStatus) return false;
    if (filters.installStatus && app.installStatus !== filters.installStatus) return false;
    if (!search) return true;
    return [app.name, app.description, app.owner, app.myRole]
      .some((value) => normalized(value).includes(search));
  });
}
