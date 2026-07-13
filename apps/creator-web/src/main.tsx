import { createRoot } from "react-dom/client";
import { CreatorApp } from "@/app/CreatorApp";

if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  await import("@evcp/ui/styles.css");
}

if (typeof document !== "undefined") {
  createRoot(document.getElementById("root")!).render(<CreatorApp />);
}
