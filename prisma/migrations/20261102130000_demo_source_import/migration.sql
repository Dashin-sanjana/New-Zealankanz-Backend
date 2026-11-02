ALTER TABLE "User" ADD COLUMN "systemAccount" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Ad"
  ALTER COLUMN "locationId" DROP NOT NULL,
  ADD COLUMN "demoContent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sourceSystem" TEXT,
  ADD COLUMN "sourceRecordId" TEXT,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "priceCurrency" TEXT,
  ADD COLUMN "priceLabel" TEXT,
  ADD COLUMN "priceType" TEXT;

CREATE UNIQUE INDEX "Ad_sourceSystem_sourceRecordId_key" ON "Ad"("sourceSystem", "sourceRecordId");
CREATE INDEX "Ad_demoContent_status_createdAt_idx" ON "Ad"("demoContent", "status", "createdAt");

ALTER TABLE "Ad" DROP CONSTRAINT "Ad_locationId_fkey";
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
