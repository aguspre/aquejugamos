-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('weekly', 'biweekly', 'monthly');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "series_id" UUID;

-- CreateTable
CREATE TABLE "session_series" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "frequency" "RecurrenceFrequency" NOT NULL DEFAULT 'weekly',
    "voting_mode" "VotingMode" NOT NULL DEFAULT 'multi_vote',
    "max_votes_per_user" INTEGER NOT NULL DEFAULT 3,
    "max_proposals_per_user" INTEGER,
    "share_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_series_share_token_key" ON "session_series"("share_token");

-- CreateIndex
CREATE INDEX "session_series_group_id_is_active_idx" ON "session_series"("group_id", "is_active");

-- CreateIndex
CREATE INDEX "session_series_host_id_idx" ON "session_series"("host_id");

-- CreateIndex
CREATE INDEX "sessions_series_id_scheduled_at_idx" ON "sessions"("series_id", "scheduled_at");

-- AddForeignKey
ALTER TABLE "session_series" ADD CONSTRAINT "session_series_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_series" ADD CONSTRAINT "session_series_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "session_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
