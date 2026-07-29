import { AdminConsole } from "@/features/admin-console";
import { PublishGovernancePage } from "@/features/publish-governance/PublishGovernancePage";

/** The application composition root deliberately owns no screen state or feature implementation. */
export function AdminApp() {
  return <AdminConsole publishingPage={<PublishGovernancePage />} />;
}
