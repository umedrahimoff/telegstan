-- CreateTable
CREATE TABLE "Channel" (
      "id" TEXT NOT NULL,
      "telegramId" TEXT NOT NULL,
      "username" TEXT,
      "name" TEXT,
      "type" TEXT NOT NULL DEFAULT 'channel',
      "isActive" BOOLEAN NOT NULL DEFAULT false,
      "saveAllPosts" BOOLEAN NOT NULL DEFAULT false,
      "language" TEXT,
      "lastActivityAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE "ChannelPost" (
      "id" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "messageId" INTEGER,
      "postLink" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelPost_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE "ChannelKeyword" (
      "id" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "keyword" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelKeyword_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE "Alert" (
      "id" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "postId" TEXT NOT NULL,
      "keyword" TEXT NOT NULL,
      "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE "AppUser" (
      "id" TEXT NOT NULL,
      "username" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'viewer',
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE "UserChannel" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserChannel_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE "GlobalKeyword" (
      "id" TEXT NOT NULL,
      "keyword" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalKeyword_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE "TelegramSession" (
      "id" TEXT NOT NULL,
      "sessionStr" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSession_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE "AppSettings" (
      "id" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE "NotificationLog" (
      "id" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "keyword" TEXT NOT NULL,
      "sourceChannel" TEXT NOT NULL,
      "recipient" TEXT NOT NULL,
      "success" BOOLEAN NOT NULL,
      "errorMessage" TEXT,
      "alertId" TEXT,
      "contentPreview" TEXT,
      "postLink" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
  );

-- CreateUniqueIndex
CREATE UNIQUE INDEX "Channel_telegramId_key" ON "Channel"("telegramId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "Channel_username_key" ON "Channel"("username");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "UserChannel_userId_channelId_key" ON "UserChannel"("userId", "channelId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "GlobalKeyword_keyword_key" ON "GlobalKeyword"("keyword");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "AppSettings_key_key" ON "AppSettings"("key");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_recipient_idx" ON "NotificationLog"("recipient");

-- CreateIndex
CREATE INDEX "NotificationLog_type_idx" ON "NotificationLog"("type");

-- CreateIndex
CREATE INDEX "NotificationLog_keyword_idx" ON "NotificationLog"("keyword");

-- CreateIndex
CREATE INDEX "NotificationLog_sourceChannel_idx" ON "NotificationLog"("sourceChannel");

-- AddForeignKey
ALTER TABLE "ChannelPost" ADD CONSTRAINT "ChannelPost_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelKeyword" ADD CONSTRAINT "ChannelKeyword_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChannel" ADD CONSTRAINT "UserChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChannel" ADD CONSTRAINT "UserChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
