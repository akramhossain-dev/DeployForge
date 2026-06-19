CREATE TABLE "RefreshTokenReplay" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshTokenReplay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshTokenReplay_tokenHash_key" ON "RefreshTokenReplay"("tokenHash");
CREATE INDEX "RefreshTokenReplay_userId_idx" ON "RefreshTokenReplay"("userId");
CREATE INDEX "RefreshTokenReplay_sessionId_idx" ON "RefreshTokenReplay"("sessionId");
CREATE INDEX "RefreshTokenReplay_expiresAt_idx" ON "RefreshTokenReplay"("expiresAt");
CREATE INDEX "RefreshTokenReplay_createdAt_idx" ON "RefreshTokenReplay"("createdAt");
