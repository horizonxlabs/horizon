import { Input } from "@evcp/ui";
import { useEffect, useState } from "react";
import type { ProviderModelCatalogDto } from "@evcp/api-client";
import { filterModels, type CatalogModel } from "../lib/model-catalog";

type Props = {
  baseUrl: string;
  value: string[];
  onChange: (models: string[]) => void;
  loadCatalog: (baseUrl: string) => Promise<ProviderModelCatalogDto>;
  onUnavailable: () => void;
};

export function ModelCatalogPicker({ baseUrl, value, onChange, loadCatalog, onUnavailable }: Props) {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    loadCatalog(baseUrl)
      .then((catalog) => {
        if (!active) return;
        setModels(catalog.models);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
        onUnavailable();
      });
    return () => {
      active = false;
    };
  }, [baseUrl, loadCatalog, onUnavailable]);

  if (status === "loading") return <p className="text-sm text-muted">Loading model catalog…</p>;
  if (status === "error")
    return <p className="text-sm text-muted">Catalog unavailable — enter model ids manually below.</p>;

  const filtered = filterModels(models, query);
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((m) => m !== id) : [...value, id]);

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className="inline-flex items-center gap-1 rounded-control border border-border bg-surface-muted px-2 py-1 text-xs text-body"
            >
              {id} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search models…" />
      <ul className="max-h-48 overflow-auto rounded-control border border-border">
        {filtered.map((model) => {
          const selected = value.includes(model.id);
          return (
            <li key={model.id}>
              <button
                type="button"
                onClick={() => toggle(model.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm text-body ${selected ? "bg-surface-muted" : ""}`}
              >
                <span className="truncate">{model.name}</span>
                {selected && (
                  <span className="text-primary" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted">No models match.</li>}
      </ul>
    </div>
  );
}
