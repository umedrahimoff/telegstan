import { cookies } from "next/headers";
import { AUTH_SESSION_COOKIE } from "./authCookie";
import { prisma } from "./prisma";

export async function getCurrentUser(): Promise<{ id: string; username: string; role: string } | null> {
    const cookieStore = await cookies();
    const userId = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
    if (!userId) return null;

    const user = await prisma.appUser.findUnique({
        where: { id: userId, isActive: true, canAccessAdmin: true },
    });
    return user ? { id: user.id, username: user.username, role: user.role } : null;
}

export async function requireAdmin(): Promise<{ id: string; username: string; role: string } | null> {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") return null;
    return user;
}
