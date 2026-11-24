import type { VotingMode } from '@prisma/client';

export interface VoteRecord {
  userId: string;
  rank: number;
}

export interface ScoredProposalBase {
  id: string;
  createdAt: Date;
  voteCount: number;
  score: number;
  userVoted: boolean;
  userRank: number | null;
}

export function getPointsForVote(votingMode: VotingMode, rank: number): number {
  if (votingMode === 'ranked_top3') {
    if (rank === 1) return 3;
    if (rank === 2) return 2;
    if (rank === 3) return 1;
    return 0;
  }
  return 1;
}

export function scoreProposalVotes(
  votes: VoteRecord[],
  votingMode: VotingMode,
  viewerUserId: string,
): {
  voteCount: number;
  score: number;
  userVoted: boolean;
  userRank: number | null;
} {
  let score = 0;
  let userVoted = false;
  let userRank: number | null = null;

  for (const vote of votes) {
    score += getPointsForVote(votingMode, vote.rank);
    if (vote.userId === viewerUserId) {
      userVoted = true;
      userRank = vote.rank;
    }
  }

  return {
    voteCount: votes.length,
    score,
    userVoted,
    userRank,
  };
}

export function sortScoredProposals<T extends ScoredProposalBase>(proposals: T[]): T[] {
  return [...proposals].sort(
    (a, b) =>
      b.score - a.score ||
      b.voteCount - a.voteCount ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export interface OwnerSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bggUsername: string | null;
}

export interface PoolGameInput {
  id: string;
  bggId: number;
  name: string;
  yearPublished: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  bestPlayers: number[];
  playingTimeMinutes: number | null;
  weight: number | null;
  bggRating: number | null;
  isExpansion: boolean;
  baseGameBggId: number | null;
  mechanics: { id: string; bggId: number; name: string }[];
}

export interface OwnedGameRow {
  user: OwnerSummary;
  game: PoolGameInput;
}

export interface CombinedPoolItem extends PoolGameInput {
  owners: OwnerSummary[];
  isProposed: boolean;
}

export function aggregateCombinedPool(
  rows: OwnedGameRow[],
  proposedGameIds: Set<string>,
  options: {
    confirmedCount: number;
    onlyCompatible?: boolean;
    includeExpansions?: boolean;
  },
): CombinedPoolItem[] {
  const { confirmedCount, onlyCompatible = true, includeExpansions = false } = options;

  const grouped = new Map<
    string,
    { game: PoolGameInput; ownersById: Map<string, OwnerSummary> }
  >();

  for (const row of rows) {
    if (!includeExpansions && row.game.isExpansion) {
      continue;
    }

    if (onlyCompatible && confirmedCount > 0) {
      const min = row.game.minPlayers;
      const max = row.game.maxPlayers;
      if (min === null || max === null || min > confirmedCount || max < confirmedCount) {
        continue;
      }
    }

    const existing = grouped.get(row.game.id);
    if (!existing) {
      grouped.set(row.game.id, {
        game: row.game,
        ownersById: new Map([[row.user.id, row.user]]),
      });
    } else {
      existing.ownersById.set(row.user.id, row.user);
    }
  }

  return Array.from(grouped.values())
    .map(({ game, ownersById }) => ({
      ...game,
      owners: Array.from(ownersById.values()).sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'es'),
      ),
      isProposed: proposedGameIds.has(game.id),
    }))
    .sort((a, b) => {
      const aBest = a.bestPlayers.includes(confirmedCount) ? 1 : 0;
      const bBest = b.bestPlayers.includes(confirmedCount) ? 1 : 0;
      if (aBest !== bBest) return bBest - aBest;
      return (b.bggRating ?? 0) - (a.bggRating ?? 0) || a.name.localeCompare(b.name, 'es');
    });
}
