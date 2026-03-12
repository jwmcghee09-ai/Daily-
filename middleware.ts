import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/spectre-dashboard-v3.html") {
    return NextResponse.redirect(new URL(`/dashboard${search}`, request.url));
  }

  if (pathname === "/spectre-settings-v3.html") {
    return NextResponse.redirect(new URL(`/settings${search}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/spectre-dashboard-v3.html", "/spectre-settings-v3.html"],
};
