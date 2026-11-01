-- AlterTable
ALTER TABLE "users" ADD COLUMN     "demoOwnerId" TEXT,
ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "users_isAnonymous_createdAt_idx" ON "users"("isAnonymous", "createdAt");

-- CreateIndex
CREATE INDEX "users_demoOwnerId_idx" ON "users"("demoOwnerId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_demoOwnerId_fkey" FOREIGN KEY ("demoOwnerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
