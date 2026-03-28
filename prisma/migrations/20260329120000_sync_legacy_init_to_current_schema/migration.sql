-- Align DB with current schema.prisma (legacy 0_init drift: AppUser, Alert, keywords, Session, etc.)

-- AppUser: Telegram auth, no password
ALTER TABLE "AppUser" DROP COLUMN IF EXISTS "passwordHash";
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);
ALTER TABLE "AppUser" ALTER COLUMN "role" SET DEFAULT 'moderator';
UPDATE "AppUser" SET "role" = 'moderator' WHERE "role" IS NOT NULL AND "role" NOT IN ('admin', 'moderator');

-- ChannelKeyword: keyword -> text, isActive
ALTER TABLE "ChannelKeyword" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ChannelKeyword' AND column_name = 'keyword'
  ) THEN
    ALTER TABLE "ChannelKeyword" RENAME COLUMN "keyword" TO "text";
  END IF;
END $$;
DROP INDEX IF EXISTS "ChannelKeyword_channelId_keyword_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ChannelKeyword_channelId_text_key" ON "ChannelKeyword"("channelId", "text");

-- GlobalKeyword: keyword -> text, isActive
DROP INDEX IF EXISTS "GlobalKeyword_keyword_key";
ALTER TABLE "GlobalKeyword" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'GlobalKeyword' AND column_name = 'keyword'
  ) THEN
    ALTER TABLE "GlobalKeyword" RENAME COLUMN "keyword" TO "text";
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "GlobalKeyword_text_key" ON "GlobalKeyword"("text");

-- Alert: replace legacy shape (postId/keyword/sentAt) with current model
ALTER TABLE "Alert" DROP CONSTRAINT IF EXISTS "Alert_channelId_fkey";
DROP TABLE IF EXISTS "Alert" CASCADE;
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "channelId" TEXT,
    "content" TEXT NOT NULL,
    "translatedContent" TEXT,
    "matchedWord" TEXT NOT NULL,
    "postLink" TEXT,
    "source" TEXT NOT NULL DEFAULT 'channel',
    "globalKeywordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Alert_channelId_idx" ON "Alert"("channelId");
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TelegramSession -> Session + phoneNumber (required for Prisma model Session)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TelegramSession') THEN
    ALTER TABLE "TelegramSession" RENAME TO "Session";
  END IF;
END $$;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
UPDATE "Session" SET "phoneNumber" = COALESCE("phoneNumber", 'legacy_' || "id") WHERE "phoneNumber" IS NULL;
ALTER TABLE "Session" ALTER COLUMN "phoneNumber" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Session_phoneNumber_key" ON "Session"("phoneNumber");

-- AppSettings -> AppSetting (Prisma model AppSetting)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'AppSettings') THEN
    ALTER TABLE "AppSettings" RENAME TO "AppSetting";
  END IF;
END $$;
ALTER TABLE "AppSetting" DROP COLUMN IF EXISTS "updatedAt";

-- New tables from current schema
CREATE TABLE IF NOT EXISTS "VerificationCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "targetUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserKeyword" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserKeyword_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserKeyword_userId_keyword_key" ON "UserKeyword"("userId", "keyword");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserKeyword_userId_fkey'
  ) THEN
    ALTER TABLE "UserKeyword" ADD CONSTRAINT "UserKeyword_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "GlobalKeywordRecipient" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GlobalKeywordRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GlobalKeywordRecipient_keywordId_username_key" ON "GlobalKeywordRecipient"("keywordId", "username");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GlobalKeywordRecipient_keywordId_fkey'
  ) THEN
    ALTER TABLE "GlobalKeywordRecipient" ADD CONSTRAINT "GlobalKeywordRecipient_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "GlobalKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
