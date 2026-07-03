import { appStoreItems, mockUsers } from "@evcp/mock-data";
import { AppCard } from "@evcp/ui";
import { createRoot } from "react-dom/client";
import "@evcp/ui/styles.css";

function StoreApp() {
  const myApps = appStoreItems.filter((app) => app.accessStatus === "active");
  const availableApps = appStoreItems.filter((app) => app.accessStatus === "available");

  return (
    <main className="store-shell">
      <header className="store-header">
        <h1>App Store</h1>
        <span>{mockUsers.endUser.name}</span>
      </header>
      <label>
        Search apps
        <input placeholder="Search apps..." />
      </label>
      <section>
        <h2>My Apps</h2>
        {myApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </section>
      <section>
        <h2>Available Apps</h2>
        {availableApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StoreApp />);
