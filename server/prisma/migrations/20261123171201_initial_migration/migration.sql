-- CreateEnum
CREATE TYPE "UserGameStatus" AS ENUM ('owned', 'wishlist', 'want_to_play', 'previously_owned');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('planning', 'voting', 'locked', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "VotingMode" AS ENUM ('single_choice', 'multi_vote', 'ranked_top3');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('going', 'maybe', 'not_going');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bgg_username" TEXT,
    "last_bgg_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "bgg_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "year_published" INTEGER,
    "image_url" TEXT,
    "thumbnail_url" TEXT,
    "min_players" INTEGER,
    "max_players" INTEGER,
    "best_players" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "playing_time_minutes" INTEGER,
    "weight" DECIMAL(3,2),
    "bgg_rating" DECIMAL(4,2),
    "is_expansion" BOOLEAN NOT NULL DEFAULT false,
    "base_game_bgg_id" INTEGER,
    "bgg_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mechanics" (
    "id" UUID NOT NULL,
    "bgg_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "mechanics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_mechanics" (
    "game_id" UUID NOT NULL,
    "mechanic_id" UUID NOT NULL,

    CONSTRAINT "game_mechanics_pkey" PRIMARY KEY ("game_id","mechanic_id")
);

-- CreateTable
CREATE TABLE "user_games" (
    "user_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "status" "UserGameStatus" NOT NULL DEFAULT 'owned',
    "personal_rating" DECIMAL(4,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_games_pkey" PRIMARY KEY ("user_id","game_id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "invite_code" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "group_id" UUID,
    "host_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'planning',
    "voting_mode" "VotingMode" NOT NULL DEFAULT 'multi_vote',
    "max_votes_per_user" INTEGER NOT NULL DEFAULT 3,
    "invite_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rsvp" "RsvpStatus" NOT NULL DEFAULT 'going',
    "responded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("session_id","user_id")
);

-- CreateTable
CREATE TABLE "session_proposals" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "proposed_by" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_votes" (
    "proposal_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_votes_pkey" PRIMARY KEY ("proposal_id","user_id")
);

-- CreateTable
CREATE TABLE "play_logs" (
    "id" UUID NOT NULL,
    "session_id" UUID,
    "group_id" UUID,
    "game_id" UUID NOT NULL,
    "played_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_minutes" INTEGER,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "play_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_log_players" (
    "play_log_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "score" INTEGER,
    "is_winner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "play_log_players_pkey" PRIMARY KEY ("play_log_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_bgg_username_idx" ON "users"("bgg_username");

-- CreateIndex
CREATE UNIQUE INDEX "games_bgg_id_key" ON "games"("bgg_id");

-- CreateIndex
CREATE INDEX "games_name_idx" ON "games"("name");

-- CreateIndex
CREATE INDEX "games_is_expansion_min_players_max_players_idx" ON "games"("is_expansion", "min_players", "max_players");

-- CreateIndex
CREATE INDEX "games_playing_time_minutes_idx" ON "games"("playing_time_minutes");

-- CreateIndex
CREATE INDEX "games_weight_idx" ON "games"("weight");

-- CreateIndex
CREATE INDEX "games_base_game_bgg_id_idx" ON "games"("base_game_bgg_id");

-- CreateIndex
CREATE UNIQUE INDEX "mechanics_bgg_id_key" ON "mechanics"("bgg_id");

-- CreateIndex
CREATE UNIQUE INDEX "mechanics_name_key" ON "mechanics"("name");

-- CreateIndex
CREATE INDEX "game_mechanics_mechanic_id_idx" ON "game_mechanics"("mechanic_id");

-- CreateIndex
CREATE INDEX "user_games_user_id_status_idx" ON "user_games"("user_id", "status");

-- CreateIndex
CREATE INDEX "user_games_game_id_idx" ON "user_games"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_invite_code_key" ON "groups"("invite_code");

-- CreateIndex
CREATE INDEX "groups_created_by_idx" ON "groups"("created_by");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_invite_token_key" ON "sessions"("invite_token");

-- CreateIndex
CREATE INDEX "sessions_group_id_scheduled_at_idx" ON "sessions"("group_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "sessions_host_id_idx" ON "sessions"("host_id");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "session_participants_session_id_rsvp_idx" ON "session_participants"("session_id", "rsvp");

-- CreateIndex
CREATE INDEX "session_participants_user_id_idx" ON "session_participants"("user_id");

-- CreateIndex
CREATE INDEX "session_proposals_session_id_idx" ON "session_proposals"("session_id");

-- CreateIndex
CREATE INDEX "session_proposals_game_id_idx" ON "session_proposals"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_proposals_session_id_game_id_key" ON "session_proposals"("session_id", "game_id");

-- CreateIndex
CREATE INDEX "session_votes_user_id_idx" ON "session_votes"("user_id");

-- CreateIndex
CREATE INDEX "play_logs_group_id_played_at_idx" ON "play_logs"("group_id", "played_at");

-- CreateIndex
CREATE INDEX "play_logs_session_id_idx" ON "play_logs"("session_id");

-- CreateIndex
CREATE INDEX "play_logs_game_id_idx" ON "play_logs"("game_id");

-- CreateIndex
CREATE INDEX "play_logs_created_by_idx" ON "play_logs"("created_by");

-- CreateIndex
CREATE INDEX "play_log_players_user_id_is_winner_idx" ON "play_log_players"("user_id", "is_winner");

-- AddForeignKey
ALTER TABLE "game_mechanics" ADD CONSTRAINT "game_mechanics_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_mechanics" ADD CONSTRAINT "game_mechanics_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "mechanics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_proposals" ADD CONSTRAINT "session_proposals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_proposals" ADD CONSTRAINT "session_proposals_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_proposals" ADD CONSTRAINT "session_proposals_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_votes" ADD CONSTRAINT "session_votes_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "session_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_votes" ADD CONSTRAINT "session_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_logs" ADD CONSTRAINT "play_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_logs" ADD CONSTRAINT "play_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_logs" ADD CONSTRAINT "play_logs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_logs" ADD CONSTRAINT "play_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_log_players" ADD CONSTRAINT "play_log_players_play_log_id_fkey" FOREIGN KEY ("play_log_id") REFERENCES "play_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_log_players" ADD CONSTRAINT "play_log_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
