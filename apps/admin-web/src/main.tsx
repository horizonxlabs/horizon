import { createRoot } from "react-dom/client";
import { AdminApp } from "@/app/AdminApp";

if (typeof window !== "undefined") {
  await import("@evcp/ui/styles.css");
}

if (typeof document !== "undefined") {
  createRoot(document.getElementById("root")!).render(<AdminApp />);
}
