-- Extend bot subscription request with registration fields
ALTER TABLE "BotSubscriptionRequest" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "BotSubscriptionRequest" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "BotSubscriptionRequest" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "BotSubscriptionRequest" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "BotSubscriptionRequest" ADD COLUMN IF NOT EXISTS "email" TEXT;

-- Stateful registration wizard for new bot users
CREATE TABLE IF NOT EXISTS "BotRegistrationState" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "chatId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BotRegistrationState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BotRegistrationState_telegramUserId_key" ON "BotRegistrationState"("telegramUserId");

-- Channel suggestions from bot users
CREATE TABLE IF NOT EXISTS "BotChannelSuggestion" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "chatId" TEXT NOT NULL,
    "channelInput" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    CONSTRAINT "BotChannelSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BotChannelSuggestion_status_createdAt_idx" ON "BotChannelSuggestion"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BotChannelSuggestion_reviewedByUserId_fkey'
  ) THEN
    ALTER TABLE "BotChannelSuggestion"
      ADD CONSTRAINT "BotChannelSuggestion_reviewedByUserId_fkey"
      FOREIGN KEY ("reviewedByUserId") REFERENCES "AppUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
