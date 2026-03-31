-- AppUser: fields for bot linkage
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "telegramUserId" TEXT;
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "botLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "AppUser_telegramUserId_key" ON "AppUser"("telegramUserId");

-- Requests from Telegram bot users (subscribe flow)
CREATE TABLE IF NOT EXISTS "BotSubscriptionRequest" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "chatId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    CONSTRAINT "BotSubscriptionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BotSubscriptionRequest_status_requestedAt_idx"
    ON "BotSubscriptionRequest"("status", "requestedAt");
CREATE INDEX IF NOT EXISTS "BotSubscriptionRequest_telegramUsername_idx"
    ON "BotSubscriptionRequest"("telegramUsername");
CREATE UNIQUE INDEX IF NOT EXISTS "BotSubscriptionRequest_telegramUserId_status_key"
    ON "BotSubscriptionRequest"("telegramUserId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BotSubscriptionRequest_reviewedByUserId_fkey'
  ) THEN
    ALTER TABLE "BotSubscriptionRequest"
      ADD CONSTRAINT "BotSubscriptionRequest_reviewedByUserId_fkey"
      FOREIGN KEY ("reviewedByUserId") REFERENCES "AppUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
