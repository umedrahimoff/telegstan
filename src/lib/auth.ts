import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { AUTH_SESSION_COOKIE } from "./authCookie";
import { prisma } from "./prisma";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function generateSessionToken(): string {
    return randomBytes(32).toString("base64url");
}

function hashSessionToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export async function createAuthSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await prisma.authSession.create({
        data: { token: tokenHash, userId, expiresAt },
    });
    return { token, expiresAt };
}

export async function revokeAuthSession(rawToken: string): Promise<void> {
    if (!rawToken) return;
    const tokenHash = hashSessionToken(rawToken);
    await prisma.authSession.updateMany({
        where: { token: tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
    });
}

export async function getCurrentUser(): Promise<{ id: string; username: string; role: string } | null> {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
    if (!rawToken) return null;

    const tokenHash = hashSessionToken(rawToken);
    const session = await prisma.authSession.findUnique({
        where: { token: tokenHash },
        include: { user: true },
    });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (!session.user.isActive || !session.user.canAccessAdmin) return null;

    return { id: session.user.id, username: session.user.username, role: session.user.role };
}

export async function requireAdmin(): Promise<{ id: string; username: string; role: string } | null> {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") return null;
    return user;
}
