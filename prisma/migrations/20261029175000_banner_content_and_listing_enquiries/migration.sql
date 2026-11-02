ALTER TABLE "Banner"
ADD COLUMN "sponsor" TEXT,
ADD COLUMN "description" TEXT;

ALTER TABLE "ContactSubmission"
ADD COLUMN "adId" TEXT;

CREATE INDEX "ContactSubmission_adId_createdAt_idx"
ON "ContactSubmission"("adId", "createdAt");

ALTER TABLE "ContactSubmission"
ADD CONSTRAINT "ContactSubmission_adId_fkey"
FOREIGN KEY ("adId") REFERENCES "Ad"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
