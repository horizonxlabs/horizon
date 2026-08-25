import { useEffect, useState } from "react";
import { renderCheckbox, type RenderCheckboxProps, type Renderers } from "react-data-grid";

function renderDatabaseSelectionCheckbox(props: RenderCheckboxProps) {
  return <label className="hz-db-selection-target">{renderCheckbox(props)}</label>;
}

export const databaseGridRenderers: Renderers<Record<string, unknown>, unknown> = {
  renderCheckbox: renderDatabaseSelectionCheckbox
};

export function useNarrowDatabaseTargets() {
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 760px)");
    const handleViewportChange = () => setIsNarrowViewport(media.matches);
    handleViewportChange();
    media.addEventListener("change", handleViewportChange);
    return () => media.removeEventListener("change", handleViewportChange);
  }, []);

  return isNarrowViewport;
}
