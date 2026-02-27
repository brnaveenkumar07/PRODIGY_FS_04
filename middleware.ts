import { NextRequest, NextResponse } from "next/server";

import { extractAuthTokenFromCookieHeader, verifyAuthToken } from "@/lib/auth";

const AUTH_PAGES = ["/login", "/register"];
const PROTECTED_API_PREFIXES = [
  "/api/rooms",
  "/api/messages",
  "/api/users",
  "/api/upload",
];

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const token = extractAuthTokenFromCookieHeader(req.headers.get("cookie"));
  const authPayload = token ? await verifyAuthToken(token) : null;

  const isProtectedChatPath = pathname.startsWith("/chat");
  const isProtectedApiPath = PROTECTED_API_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isAuthPage = AUTH_PAGES.some((page) => pathname === page);

  if ((isProtectedChatPath || isProtectedApiPath) && !authPayload) {
    if (isProtectedApiPath) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && authPayload) {
    return NextResponse.redirect(new URL("/chat", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/chat/:path*",
    "/login",
    "/register",
    "/api/rooms/:path*",
    "/api/messages/:path*",
    "/api/users/:path*",
    "/api/upload/:path*",
  ],
};
