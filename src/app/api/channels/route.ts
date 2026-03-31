import { NextResponse } from "next/server";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAction } from "@/lib/actionLog";
import { formatHumanDuration, parseTelegramFloodWaitSeconds } from "@/lib/telegramFloodWait";

const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
const apiHash = process.env.TELEGRAM_API_HASH || "";

// GET all channels (newest first) with last activity from alerts
// With page/pageSize: returns { items, total, page, pageSize }
// Without: returns full array (for dropdowns)
export async function GET(req: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const { searchParams } = new URL(req.url);
        const pageParam = searchParams.get("page");
        const pageSizeParam = searchParams.get("pageSize");
        let search = searchParams.get("search")?.trim().toLowerCase() || undefined;
        if (search?.startsWith("@")) search = search.slice(1) || undefined;
        const showOnlyActive = searchParams.get("showOnlyActive") === "true";
        const typeFilter = searchParams.get("typeFilter") || "all";
        const sortBy = searchParams.get("sortBy") || "createdAt";

        const where: { isActive?: boolean; type?: string; OR?: object[] } = {};
        if (showOnlyActive) where.isActive = true;
        if (typeFilter !== "all") where.type = typeFilter;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { username: { contains: search, mode: "insensitive" } },
            ];
        }
        const whereClause = Object.keys(where).length > 0 ? where : undefined;

        const orderByMap: Record<string, object> = {
            createdAt: { createdAt: "desc" },
            added: { createdAt: "asc" },
            posts: { channelPosts: { _count: "desc" } },
            keywords: { keywords: { _count: "desc" } },
            activity: { lastActivityAt: "desc" },
        };
        const orderBy = orderByMap[sortBy] || orderByMap.createdAt;

        const [channels, total] = pageParam
            ? await Promise.all([
                prisma.channel.findMany({
                    where: whereClause,
                    orderBy,
                    include: { _count: { select: { keywords: true, channelPosts: true } } },
                    skip: (Math.max(1, parseInt(pageParam, 10)) - 1) * Math.min(100, Math.max(1, parseInt(pageSizeParam || "20", 10))),
                    take: Math.min(100, Math.max(1, parseInt(pageSizeParam || "20", 10))),
                }),
                prisma.channel.count({ where: whereClause }),
            ])
            : [await prisma.channel.findMany({
                where: whereClause,
                orderBy,
                include: { _count: { select: { keywords: true, channelPosts: true } } },
            }), 0];

        const [byChannelId, byChannelName] = await Promise.all([
            prisma.alert.groupBy({
                by: ["channelId"],
                where: { channelId: { not: null } },
                _max: { createdAt: true },
            }),
            prisma.alert.groupBy({
                by: ["channelName"],
                _max: { createdAt: true },
            }),
        ]);
        const activityById = Object.fromEntries(
            byChannelId.map((a) => [a.channelId!, a._max.createdAt])
        );
        const activityByName = Object.fromEntries(
            byChannelName.map((a) => [a.channelName, a._max.createdAt])
        );

        const channelsWithActivity = channels.map((c) => ({
            ...c,
            lastActivityAt: c.lastActivityAt ?? activityById[c.id] ?? (c.username && activityByName[c.username]) ?? (c.name && activityByName[c.name]) ?? null,
        }));

        if (pageParam) {
            const page = Math.max(1, parseInt(pageParam, 10));
            const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam || "20", 10)));
            return NextResponse.json({ items: channelsWithActivity, total, page, pageSize });
        }
        return NextResponse.json(channelsWithActivity);
    } catch (error) {
        console.error("GET Error:", error);
        return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
    }
}

// POST: Add new channel OR Toggle status of existing
export async function POST(req: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const body = await req.json();
        console.log("POST Body:", body);

        // ── Case 1: Toggle status of existing channel ──────────────────────────
        if (body.id && body.isActive !== undefined) {
            const channel = await prisma.channel.update({
                where: { id: body.id },
                data: { isActive: !!body.isActive },
            });
            await logAction({ action: "channel_toggle", actorId: user.id, actorUsername: user.username, targetType: "channel", targetId: body.id, details: `${channel.name || channel.username} → ${body.isActive ? "active" : "inactive"}` });
            return NextResponse.json(channel);
        }

        // ── Case 2: Add new channel by username/link ───────────────────────────
        if (body.username) {
            const cleanInput = body.username.trim();
            const cleanUsername = cleanInput
                .replace(/^@/, "")
                .replace(/^https?:\/\/t\.me\//, "")
                .split("/")[0]
                .split("?")[0]
                .trim();

            if (!cleanUsername) {
                return NextResponse.json({ error: "Invalid username or link" }, { status: 400 });
            }

            console.log("Resolving + Joining channel:", cleanUsername);

            // Get active Telegram session
            const sessionEntry = await prisma.session.findFirst({ where: { isActive: true } });
            if (!sessionEntry) {
                return NextResponse.json({ error: "No active Telegram session found." }, { status: 401 });
            }

            const client = new TelegramClient(
                new StringSession(sessionEntry.sessionStr),
                apiId,
                apiHash,
                { connectionRetries: 2 }
            );

            try {
                await client.connect();
                console.log("TG Connected");

                // 1. Resolve the entity (get channel info)
                let entity: any;
                try {
                    entity = await client.getEntity(cleanUsername);
                    console.log("Entity resolved:", entity.id?.toString(), entity.title);
                } catch (err: unknown) {
                    await client.disconnect();
                    const floodSec = parseTelegramFloodWaitSeconds(err);
                    if (floodSec !== null) {
                        return NextResponse.json(
                            {
                                error: `Telegram rate limit: too many username lookups (contacts.ResolveUsername). Try again in ~${formatHumanDuration(floodSec)}. If the chat is already in this account’s dialogs, use Sync instead of adding by @username.`,
                                retryAfterSeconds: floodSec,
                            },
                            { status: 429 }
                        );
                    }
                    const msg = err instanceof Error ? err.message : String(err);
                    return NextResponse.json({ error: `Channel not found: ${msg}` }, { status: 404 });
                }

                const telegramId = entity.id.toString();
                const name = entity.title || entity.firstName || cleanUsername;
                const finalUsername = entity.username || cleanUsername;
                const channelType = (entity as any).broadcast ? "channel" : "group";

                // 2. Check if already exists in DB — by telegramId or username
                const existing = await prisma.channel.findFirst({
                    where: {
                        OR: [
                            { telegramId },
                            ...(finalUsername ? [{ username: finalUsername }] : []),
                        ],
                    },
                });
                if (existing) {
                    const updated = await prisma.channel.update({
                        where: { id: existing.id },
                        data: { isActive: true, name, username: finalUsername, telegramId, type: channelType },
                    });
                    await logAction({ action: "channel_add", actorId: user.id, actorUsername: user.username, targetType: "channel", targetId: existing.id, details: `${name} (@${finalUsername})` });
                    await client.disconnect();
                    return NextResponse.json(updated);
                }

                // 3. Join the channel so the account can receive its messages
                //    and so it appears in getDialogs() during sync
                let joinError: string | null = null;
                try {
                    await client.invoke(
                        new Api.channels.JoinChannel({ channel: cleanUsername })
                    );
                    console.log("✅ Joined channel:", cleanUsername);
                } catch (err: any) {
                    // For private groups/channels JoinChannel may fail — that's OK,
                    // we still save it. The monitor worker handles private chats too.
                    joinError = err.message;
                    console.warn("⚠️ Could not join (likely private/supergroup):", err.message);
                }

                // 4. Save to DB
                try {
                    const channel = await prisma.channel.create({
                        data: {
                            telegramId,
                            username: finalUsername,
                            name,
                            type: channelType,
                            isActive: true,
                        },
                    });
                    await logAction({ action: "channel_add", actorId: user.id, actorUsername: user.username, targetType: "channel", targetId: channel.id, details: `${name} (@${finalUsername})` });
                    await client.disconnect();
                    return NextResponse.json({
                        ...channel,
                        ...(joinError ? { _warning: `Joined with warning: ${joinError}` } : {}),
                    });
                } catch (createErr: any) {
                    await client.disconnect();
                    if (createErr?.code === "P2002") {
                        return NextResponse.json(
                            { error: "This channel is already in your list" },
                            { status: 409 }
                        );
                    }
                    throw createErr;
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error("TG error:", msg);
                try {
                    await client.disconnect();
                } catch {
                    /* ignore */
                }
                const floodSec = parseTelegramFloodWaitSeconds(err);
                if (floodSec !== null) {
                    return NextResponse.json(
                        {
                            error: `Telegram rate limit. Try again in ~${formatHumanDuration(floodSec)}.`,
                            retryAfterSeconds: floodSec,
                        },
                        { status: 429 }
                    );
                }
                return NextResponse.json({ error: msg || "Telegram error" }, { status: 500 });
            }
        }

        return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    } catch (error: any) {
        console.error("API POST Error:", error);
        return NextResponse.json({ error: error.message || "Operation failed" }, { status: 500 });
    }
}

// DELETE: Remove channel from monitoring list and leave it in Telegram
export async function DELETE(req: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

        const channel = await prisma.channel.findUnique({ where: { id } });
        if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

        // Try to leave the channel in Telegram as well
        if (channel.username && !channel.telegramId.startsWith("pending_")) {
            try {
                const sessionEntry = await prisma.session.findFirst({ where: { isActive: true } });
                if (sessionEntry) {
                    const client = new TelegramClient(
                        new StringSession(sessionEntry.sessionStr),
                        apiId,
                        apiHash,
                        { connectionRetries: 1 }
                    );
                    await client.connect();
                    await client.invoke(
                        new Api.channels.LeaveChannel({ channel: channel.username })
                    );
                    await client.disconnect();
                    console.log("✅ Left channel:", channel.username);
                }
            } catch (err: any) {
                // Not critical — just log it
                console.warn("⚠️ Could not leave channel in TG:", err.message);
            }
        }

        await prisma.channel.delete({ where: { id } });
        await logAction({ action: "channel_remove", actorId: user.id, actorUsername: user.username, targetType: "channel", targetId: id, details: `${channel.name || channel.username} (@${channel.username || ""})` });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("DELETE error:", error);
        return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 });
    }
}
