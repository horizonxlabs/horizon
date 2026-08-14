import "@fontsource-variable/anuphan";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppErrorBoundary } from "@/components/error-boundary";
import { DevErrorRelay } from "@/components/dev-error-relay";

export const metadata = { title: "Generated App" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-slate-50 text-slate-900">
        <DevErrorRelay />
        <AppErrorBoundary>{children}</AppErrorBoundary>
      </body>
    </html>
  );
}
