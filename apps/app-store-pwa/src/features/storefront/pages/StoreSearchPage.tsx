import { Search } from "lucide-react";
import { useState } from "react";
import { SectionCard } from "@evcp/ui";
import { filterStoreApps, type StoreCatalogCollection, type StoreCatalogFilters } from "../catalog";
import { useStorefront } from "../StoreProvider";
import { StoreAppList } from "./StoreCollectionPage";

export function StoreSearchPage() {
  const { allApps } = useStorefront();
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<StoreCatalogCollection>("all");
  const [accessStatus, setAccessStatus] = useState<StoreCatalogFilters["accessStatus"] | "all">(
    "all"
  );
  const apps = filterStoreApps(allApps, query, {
    collection,
    ...(accessStatus === "all" ? {} : { accessStatus })
  });

  return (
    <section className="store-page">
      <div className="store-page-heading">
        <div>
          <span className="eyebrow">Platform API catalog</span>
          <h1>Search apps</h1>
        </div>
      </div>
      <label className="store-search-panel">
        <Search size={18} />
        <span className="sr-only">Search apps</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search apps, teams or role..."
        />
      </label>
      <div className="store-search-filters" aria-label="App filters">
        <label>
          <span>Collection</span>
          <select
            name="collection"
            value={collection}
            onChange={(event) => setCollection(event.target.value as StoreCatalogCollection)}
          >
            <option value="all">All apps</option>
            <option value="my-apps">My Apps</option>
            <option value="available">Available Apps</option>
          </select>
        </label>
        <label>
          <span>Access status</span>
          <select
            name="accessStatus"
            value={accessStatus}
            onChange={(event) =>
              setAccessStatus(event.target.value as StoreCatalogFilters["accessStatus"] | "all")
            }
          >
            <option value="all">All access statuses</option>
            <option value="active">Active</option>
            <option value="available">Available</option>
            <option value="pending">Pending</option>
          </select>
        </label>
      </div>
      {apps.length ? (
        <StoreAppList apps={apps} />
      ) : (
        <SectionCard eyebrow="Platform API catalog" title="No matching apps">
          <p>Try a different application name, team, owner, or role.</p>
        </SectionCard>
      )}
    </section>
  );
}
