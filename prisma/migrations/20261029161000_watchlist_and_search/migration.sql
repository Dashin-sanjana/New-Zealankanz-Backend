CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- This migration adds indexes; review table size and lock impact before production use.

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Watchlist_adId_idx" ON "Watchlist"("adId");

-- CreateIndex
CREATE INDEX "Watchlist_userId_createdAt_idx" ON "Watchlist"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_adId_key" ON "Watchlist"("userId", "adId");

-- CreateIndex
CREATE INDEX "Ad_status_categoryId_locationId_createdAt_id_idx" ON "Ad"("status", "categoryId", "locationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Ad_status_categoryId_createdAt_id_idx" ON "Ad"("status", "categoryId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Ad_status_locationId_createdAt_id_idx" ON "Ad"("status", "locationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Ad_status_price_createdAt_id_idx" ON "Ad"("status", "price", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Ad_status_createdAt_id_idx" ON "Ad"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Ad_title_trgm_idx" ON "Ad" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Ad_description_trgm_idx" ON "Ad" USING GIN ("description" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
