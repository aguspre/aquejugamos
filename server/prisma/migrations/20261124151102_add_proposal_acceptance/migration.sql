-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('open', 'accepted');

-- AlterTable
ALTER TABLE "session_proposals" ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "accepted_by" UUID,
ADD COLUMN     "status" "ProposalStatus" NOT NULL DEFAULT 'open';

-- CreateIndex
CREATE INDEX "session_proposals_session_id_status_idx" ON "session_proposals"("session_id", "status");

-- AddForeignKey
ALTER TABLE "session_proposals" ADD CONSTRAINT "session_proposals_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
