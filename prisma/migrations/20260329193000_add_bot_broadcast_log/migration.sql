CREATE TABLE IF NOT EXISTS "BotBroadcastLog" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attemptedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "recipientsJson" TEXT NOT NULL,
    "failedJson" TEXT NOT NULL,
    "actorId" TEXT,
    "actorUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BotBroadcastLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BotBroadcastLog_createdAt_idx" ON "BotBroadcastLog"("createdAt");
CREATE INDEX IF NOT EXISTS "BotBroadcastLog_actorId_idx" ON "BotBroadcastLog"("actorId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BotBroadcastLog_actorId_fkey'
  ) THEN
    ALTER TABLE "BotBroadcastLog"
      ADD CONSTRAINT "BotBroadcastLog_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "AppUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
