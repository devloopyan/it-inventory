import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveSafeRedirectPath, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

const PUBLIC_FILE_PATTERN = /\.[^/]+$/;

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_FILE_PATTERN.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/logout") {
    return NextResponse.next();
  }

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (pathname === "/login") {
    if (!session) {
      return NextResponse.next();
    }

    const destination = new URL(resolveSafeRedirectPath(request.nextUrl.searchParams.get("next")), request.url);
    return NextResponse.redirect(destination);
  }

  if (session) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  const nextPath = `${pathname}${search}`;

  if (nextPath && nextPath !== "/login") {
    loginUrl.searchParams.set("next", nextPath);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
