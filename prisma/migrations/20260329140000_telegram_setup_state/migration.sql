CREATE TABLE "TelegramSetupState" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "qrUrl" TEXT,
    "hint" TEXT,
    "error" TEXT,
    "submittedPassword" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramSetupState_pkey" PRIMARY KEY ("id")
);
