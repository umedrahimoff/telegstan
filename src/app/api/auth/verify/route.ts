import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_SESSION_COOKIE } from "@/lib/authCookie";
import { createAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
    const limit = checkRateLimit(req, "auth:verify", 10, 5 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { error: "Too many attempts. Try again later." },
            { status: 429, headers: limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : undefined }
        );
    }
    try {
        const { code } = await req.json();
        const codeStr = typeof code === "string" ? code.trim() : String(code || "").trim();
        if (!codeStr) return NextResponse.json({ error: "Code is required" }, { status: 400 });

        const verification = await prisma.verificationCode.findFirst({
            where: {
                code: codeStr,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: "desc" },
        });

        if (!verification) {
            return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
        }

        const userId = verification.targetUserId;
        if (!userId) {
            return NextResponse.json({ error: "Invalid code" }, { status: 401 });
        }

        const user = await prisma.appUser.findUnique({
            where: { id: userId, isActive: true, canAccessAdmin: true },
        });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 401 });
        }

        await prisma.verificationCode.delete({ where: { id: verification.id } });

        const now = new Date();
        await prisma.appUser.update({
            where: { id: user.id },
            data: { lastLoginAt: now, lastActivityAt: now },
        });

        const { token, expiresAt } = await createAuthSession(user.id);
        const cookieStore = await cookies();
        cookieStore.set(AUTH_SESSION_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            expires: expiresAt,
        });

        return NextResponse.json({ success: true, redirect: "/dashboard" });
    } catch (error: any) {
        console.error("Verification Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
