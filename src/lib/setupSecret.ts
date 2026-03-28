export function getTelegramSetupSecret(): string | undefined {
    const s = process.env.TGSTN_SETUP_SECRET?.trim();
    return s || undefined;
}

export function verifyTelegramSetupSecret(provided: string | null | undefined): boolean {
    const expected = getTelegramSetupSecret();
    if (!expected || provided == null) return false;
    return provided === expected;
}
