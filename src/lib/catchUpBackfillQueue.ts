/** AppSetting key — очередь догоняющего backfill на Railway-воркере */
export const CATCH_UP_BACKFILL_KEY = "catch_up_backfill_queue";

export type CatchUpBackfillQueue = {
    channelIds: string[];
    dateFrom: string;
    dateTo: string;
    index: number;
    gapMs: number;
    sendNotifications: boolean;
    saveAll: boolean;
    nextEligibleAt: string;
    startedAt: string;
};

/** Равномерно распределить паузы между каналами в пределах totalMinutes (минимум minMs, максимум maxMs). */
export function computeGapBetweenChannelsMs(channelCount: number, totalMinutes = 10, minMs = 8000, maxMs = 120_000): number {
    const n = Math.max(1, channelCount);
    const budget = totalMinutes * 60_000;
    return Math.min(maxMs, Math.max(minMs, Math.floor(budget / n)));
}
