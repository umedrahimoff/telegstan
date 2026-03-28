import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_SESSION_COOKIE } from "@/lib/authCookie";

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const auth = request.cookies.get(AUTH_SESSION_COOKIE);

    if (pathname === "/" && auth?.value) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (pathname === "/login" && auth?.value) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (pathname.startsWith("/dashboard") && !auth?.value) {
        return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
}

export const config = { matcher: ["/", "/login", "/dashboard/:path*"] };
