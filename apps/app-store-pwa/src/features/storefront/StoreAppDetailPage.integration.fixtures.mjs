import React from "react";
import { useStorefront } from "./StoreProvider.tsx";

export function InstallationEvidenceProbe({ pendingInstall }) {
  const { actionStates, refreshHome, runAppAction } = useStorefront();
  const evidence = (slug, action) => actionStates[`${action}:${slug}`];
  const alpha = evidence("alpha", "uninstall");
  const beta = evidence("beta", "install");
  const gamma = evidence("gamma", "install");
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "button",
      {
        type: "button",
        onClick: () =>
          runAppAction(
            " Alpha ",
            "uninstall",
            async () => ({
              id: "alpha-install",
              appSlug: "alpha",
              status: "disabled",
              installedAt: "2026-07-29"
            }),
            "Alpha removed."
          )
      },
      "Remove alpha"
    ),
    React.createElement(
      "button",
      {
        type: "button",
        onClick: () =>
          runAppAction(
            "beta",
            "install",
            async () => ({
              id: "beta-install",
              appSlug: "beta",
              status: "active",
              installedAt: "2026-07-29"
            }),
            "Beta installed."
          )
      },
      "Install beta"
    ),
    React.createElement(
      "button",
      {
        type: "button",
        onClick: () => runAppAction("gamma", "install", () => pendingInstall.promise, "Gamma installed.")
      },
      "Install gamma"
    ),
    React.createElement(
      "button",
      { type: "button", onClick: () => refreshHome() },
      "Refresh evidence"
    ),
    React.createElement(
      "output",
      null,
      `${alpha?.installationStatus ?? "none"}|${beta?.installationStatus ?? "none"}|${gamma?.pending ? "pending" : "idle"}`
    )
  );
}
