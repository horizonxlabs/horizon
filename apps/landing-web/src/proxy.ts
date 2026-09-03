import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE } from "@/shared/locale";

// Redirects only the bare root to the default locale, e.g. `/` -> `/th`. Every other path
// (an unsupported locale like `/fr`, a metadata route like `/sitemap.xml`, a public asset like
// `/horizon-logo.png`) is left untouched so it can be handled by its real route — `/[lang]`'s
// own `notFound()` for an invalid locale, or Next's normal file/route resolution for everything
// else. Redirecting broadly here would 308 those non-page requests to `/th/...` and break them.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}`;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/"]
};
