import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { navigateBrowserPath } from "@evcp/ui";
import { filterStoreApps, type StoreCatalogCollection, type StoreCatalogFilters } from "../catalog";
import { StorePageHeader } from "../StorePageHeader";
import { useStorefront } from "../StoreProvider";
import { StoreStatePanel } from "../StoreStatePanel";
import { parseStoreSearchQuery } from "../store-navigation";
import { useStoreLocationSearch } from "../use-store-location-search";
import { StoreAppList } from "./StoreCollectionPage";

export function StoreSearchPage() {
  const { allApps } = useStorefront();
  const locationSearch = useStoreLocationSearch();
  const [query, setQuery] = useState(() => parseStoreSearchQuery(locationSearch));
  const [collection, setCollection] = useState<StoreCatalogCollection>("all");
  const [accessStatus, setAccessStatus] = useState<StoreCatalogFilters["accessStatus"] | "all">(
    "all"
  );
  const apps = filterStoreApps(allApps, query, {
    collection,
    ...(accessStatus === "all" ? {} : { accessStatus })
  });

  useEffect(() => {
    setQuery(parseStoreSearchQuery(locationSearch));
  }, [locationSearch]);

  const clearFilters = () => {
    setQuery("");
    setCollection("all");
    setAccessStatus("all");
    navigateBrowserPath("/store/search");
  };

  return (
    <section className="store-page">
      <StorePageHeader
        eyebrow="Catalog"
        title="Search"
        description="Find applications by name, owner, team, or role."
        count={apps.length}
      />
      <label className="store-search-panel">
        <Search aria-hidden="true" />
        <span className="sr-only">Search apps</span>
        <input
          name="query"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search apps, teams or role..."
        />
      </label>
      <div className="store-search-layout">
        <aside className="store-filter-rail" aria-label="App filters">
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
        </aside>
        <section className="store-search-results" aria-live="polite">
          <div className="store-results-summary">
            <strong>
              {apps.length} {apps.length === 1 ? "result" : "results"}
            </strong>
            {query || collection !== "all" || accessStatus !== "all" ? (
              <button type="button" className="secondary-button" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
          {apps.length ? (
            <StoreAppList apps={apps} />
          ) : (
            <StoreStatePanel
              eyebrow="Catalog"
              title="No matching apps"
              action={
                <button type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              }
            >
              <p>Try a different application name, owner, team, role, or access status.</p>
            </StoreStatePanel>
          )}
        </section>
      </div>
    </section>
  );
}
