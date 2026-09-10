import { NextRequest, NextResponse } from "next/server";
import { readSessionUser, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    // The one deliberately public route: Meta downloads media from here at publish time
    // and has no session cookie to send. See app/api/public-assets/[...path]/route.ts's
    // own comment for why this exemption exists and what breaks without it (Meta silently
    // receiving this app's login page instead of the asset it asked for).
    pathname.startsWith("/api/public-assets/") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = readSessionUser(token);

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
