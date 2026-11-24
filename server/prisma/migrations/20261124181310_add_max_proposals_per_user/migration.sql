-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "max_proposals_per_user" INTEGER;

-- CreateIndex
CREATE INDEX "session_proposals_session_id_proposed_by_idx" ON "session_proposals"("session_id", "proposed_by");
