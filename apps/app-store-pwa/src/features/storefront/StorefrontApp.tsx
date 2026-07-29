import type { StoreRoute } from "@/routes/store-route";
import { StoreProvider } from "./StoreProvider";
import { StoreShell } from "./StoreShell";
import { StoreCollectionPage } from "./pages/StoreCollectionPage";
import { StoreAppDetailPage } from "./pages/StoreAppDetailPage";
import { StoreNotFoundPage } from "./pages/StoreNotFoundPage";
import { StoreSearchPage } from "./pages/StoreSearchPage";

function StorePage({ route }: { route: StoreRoute }) {
  if (route.page === "my-apps" || route.page === "available" || route.page === "favorites" || route.page === "recent") {
    return <StoreCollectionPage page={route.page} />;
  }
  if (route.page === "search") return <StoreSearchPage />;
  if (route.page === "not-found") return <StoreNotFoundPage />;
  if (route.page === "app-detail") {
    return <StoreAppDetailPage appSlug={route.appSlug} />;
  }
  if (route.page === "tickets" || route.page === "ticket-detail") {
    return <StoreNotFoundPage title="Ticket Status" detail="No ticket yet. Ticket history is not available on this page yet." />;
  }
  if (route.page === "access-requests") {
    return <StoreNotFoundPage title="Request Access" detail="Access-request receipts are not available on this page yet." />;
  }
  return <StoreNotFoundPage title="Profile" detail="Profile preferences are not available on this page yet." />;
}

export function StorefrontApp({ route }: { route: StoreRoute }) {
  return (
    <StoreProvider>
      <StoreShell route={route}>
        <StorePage route={route} />
      </StoreShell>
    </StoreProvider>
  );
}
