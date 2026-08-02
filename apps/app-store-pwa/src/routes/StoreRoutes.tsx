import { GeneratedLeaveManagementApp } from "@/features/generated-leave-management";
import { StorefrontApp } from "@/features/storefront";
import { useBrowserPath, usePageHeadingFocus } from "@evcp/ui";
import { storeRouteFromPath } from "@/routes/store-route";

export function StoreRoutes() {
  const pathname = useBrowserPath();
  usePageHeadingFocus(pathname);
  if (pathname.startsWith("/apps/leave-management")) return <GeneratedLeaveManagementApp />;
  const route = storeRouteFromPath(pathname);
  return <StorefrontApp route={route} />;
}
