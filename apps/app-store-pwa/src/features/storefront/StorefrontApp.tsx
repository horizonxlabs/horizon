import type { StoreRoute } from "@/routes/store-route";
import { StoreProvider } from "./StoreProvider";
import { StoreShell } from "./StoreShell";
import { StoreCollectionPage } from "./pages/StoreCollectionPage";
import { StoreAppDetailPage } from "./pages/StoreAppDetailPage";
import { StoreAccessRequestsPage } from "./pages/StoreAccessRequestsPage";
import { StoreNotFoundPage } from "./pages/StoreNotFoundPage";
import { StoreProfilePage } from "./pages/StoreProfilePage";
import { StoreSearchPage } from "./pages/StoreSearchPage";
import { StoreTicketDetailPage } from "./pages/StoreTicketDetailPage";
import { StoreTicketsPage } from "./pages/StoreTicketsPage";

function StorePage({ route }: { route: StoreRoute }) {
  if (route.page === "my-apps" || route.page === "available" || route.page === "favorites" || route.page === "recent") {
    return <StoreCollectionPage page={route.page} />;
  }
  if (route.page === "search") return <StoreSearchPage />;
  if (route.page === "not-found") return <StoreNotFoundPage />;
  if (route.page === "app-detail") {
    return <StoreAppDetailPage appSlug={route.appSlug} />;
  }
  if (route.page === "tickets") return <StoreTicketsPage />;
  if (route.page === "ticket-detail") return <StoreTicketDetailPage ticketId={route.ticketId} />;
  if (route.page === "access-requests") return <StoreAccessRequestsPage />;
  return <StoreProfilePage />;
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
