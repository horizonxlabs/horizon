import { GeneratedLeaveManagementApp } from "@/features/generated-leave-management";
import { StorefrontApp } from "@/features/storefront";

export function StoreRoutes() {
  return window.location.pathname.startsWith("/apps/leave-management")
    ? <GeneratedLeaveManagementApp />
    : <StorefrontApp />;
}
