import { navigateBrowserPath, SectionCard } from "@evcp/ui";

export function StoreNotFoundPage({ title = "Store page not found", detail }: { title?: string; detail?: string }) {
  return (
    <section className="store-page">
      <SectionCard eyebrow="Horizon Store" title={title}>
        <h1 className="sr-only">{title}</h1>
        <p>{detail ?? "This Store URL is not available."}</p>
        <button type="button" onClick={() => navigateBrowserPath("/store/")}>Return to My Apps</button>
      </SectionCard>
    </section>
  );
}
