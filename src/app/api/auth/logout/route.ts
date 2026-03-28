import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_SESSION_COOKIE } from "@/lib/authCookie";

export async function POST() {
    try {
        const cookieStore = await cookies();
        cookieStore.set(AUTH_SESSION_COOKIE, "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 0,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Logout failed" }, { status: 500 });
    }
}
