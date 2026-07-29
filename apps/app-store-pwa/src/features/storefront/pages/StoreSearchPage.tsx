import { Search } from "lucide-react";
import { useState } from "react";
import { SectionCard } from "@evcp/ui";
import { filterStoreApps } from "../catalog";
import { useStorefront } from "../StoreProvider";
import { StoreAppList } from "./StoreCollectionPage";

export function StoreSearchPage() {
  const { allApps } = useStorefront();
  const [query, setQuery] = useState("");
  const apps = filterStoreApps(allApps, query, { collection: "all" });

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
      {apps.length ? <StoreAppList apps={apps} /> : (
        <SectionCard eyebrow="Platform API catalog" title="No matching apps">
          <p>Try a different application name, team, owner, or role.</p>
        </SectionCard>
      )}
    </section>
  );
}
