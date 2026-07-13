import { AdminConsole } from "@/features/admin-console";

/** The application composition root deliberately owns no screen state or feature implementation. */
export function AdminApp() {
  return <AdminConsole />;
}
