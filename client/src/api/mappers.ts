import type {
  Game,
  GameSession,
  Group,
  LibraryGameItem,
  PlayLog,
  ProposalStatus,
  RsvpStatus,
  SessionGameItem,
  SessionProposal,
  SessionStatus,
  UserGameStatus,
  UserSummary,
  VotingMode,
} from '../types/domain';
import { createTabletopArt } from '../utils/gameArt';

const AVATAR_PALETTE = [
  '#1E4D3B',
  '#C85A32',
  '#1D5B6E',
  '#A66A1D',
  '#6A4C7D',
  '#B44D6B',
  '#3B6E8C',
  '#4F6B3A',
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'JG';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function getAccentColor(seed: string): string {
  return AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length]!;
}

export interface ApiUserSummary {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl: string | null;
  bggUsername: string | null;
  lastBggSyncAt?: string | null;
}

export interface ApiMechanic {
  id: string;
  bggId: number;
  name: string;
}

export interface ApiGame {
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
  mechanics?: ApiMechanic[];
}

export interface ApiLibraryItem {
  gameId: string;
  status: UserGameStatus;
  personalRating: number | null;
  notes: string | null;
  updatedAt: string;
  game: ApiGame;
}

export interface ApiGroup {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
  gamesCount: number;
  sessionsCount: number;
  playLogsCount: number;
  members: {
    role: 'admin' | 'member';
    joinedAt: string;
    ownedGamesCount: number;
    user: ApiUserSummary;
  }[];
}

export interface ApiSessionListItem {
  id: string;
  groupId: string | null;
  groupName: string;
  title: string;
  scheduledAt: string;
  location: string | null;
  status: SessionStatus;
  votingMode: VotingMode;
  maxVotesPerUser: number;
  inviteToken: string;
  host: ApiUserSummary;
  confirmedCount: number;
  proposalsCount: number;
  acceptedProposals?: {
    id: string;
    acceptedAt: string | null;
    game: {
      id: string;
      name: string;
      thumbnailUrl: string | null;
      playingTimeMinutes?: number | null;
    };
    voteCount: number;
    score: number;
  }[];
  topProposal: {
    id: string;
    status?: ProposalStatus;
    game: {
      id: string;
      name: string;
      thumbnailUrl: string | null;
      playingTimeMinutes?: number | null;
    };
    voteCount: number;
    score: number;
  } | null;
  participants: {
    rsvp: RsvpStatus;
    respondedAt: string;
    user: ApiUserSummary;
  }[];
}

export interface ApiSessionDetail {
  id: string;
  groupId: string | null;
  groupName: string;
  title: string;
  scheduledAt: string;
  location: string | null;
  status: SessionStatus;
  votingMode: VotingMode;
  maxVotesPerUser: number;
  inviteToken: string;
  host: ApiUserSummary;
  canManageSession?: boolean;
  confirmedCount: number;
  userVotesUsed: number;
  votesRemaining: number;
  lockedVotesCount?: number;
  lockedRanks?: number[];
  participants: {
    rsvp: RsvpStatus;
    respondedAt: string;
    user: ApiUserSummary;
  }[];
  proposals: {
    id: string;
    note: string | null;
    status: ProposalStatus;
    acceptedAt: string | null;
    acceptedBy: ApiUserSummary | null;
    createdAt: string;
    game: ApiGame;
    proposedBy: ApiUserSummary;
    owners: ApiUserSummary[];
    voteCount: number;
    score: number;
    userVoted: boolean;
    userRank: number | null;
  }[];
}

export interface ApiProposalVoteSummary {
  id: string;
  status: ProposalStatus;
  voteCount: number;
  score: number;
  userVoted: boolean;
  userRank: number | null;
}

export interface ApiSessionVotesSnapshot {
  sessionId: string;
  userVotesUsed: number;
  votesRemaining: number;
  lockedVotesCount: number;
  lockedRanks: number[];
  proposals: ApiProposalVoteSummary[];
}

export interface ApiPoolGame extends ApiGame {
  owners: ApiUserSummary[];
  isProposed: boolean;
  proposalStatus?: ProposalStatus | null;
}

export interface ApiPlayLog {
  id: string;
  sessionId: string | null;
  sessionTitle: string | null;
  groupId: string | null;
  groupName: string | null;
  playedAt: string;
  durationMinutes: number | null;
  notes: string | null;
  game: {
    id: string;
    bggId: number;
    name: string;
    yearPublished: number | null;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    playingTimeMinutes: number | null;
    weight: number | null;
    bggRating: number | null;
  };
  players: {
    score: number | null;
    isWinner: boolean;
    user: ApiUserSummary;
  }[];
}

export interface ApiGroupStats {
  groupId: string;
  totalPlays: number;
  totalDurationMinutes: number;
  mostPlayedGames: {
    game: {
      id: string;
      bggId: number;
      name: string;
      thumbnailUrl: string | null;
      imageUrl: string | null;
    };
    playCount: number;
    lastPlayedAt: string;
  }[];
  winLeaderboard: {
    user: ApiUserSummary;
    playedCount: number;
    winsCount: number;
    winRate: number;
  }[];
  shelfOfShame: {
    game: {
      id: string;
      bggId: number;
      name: string;
      yearPublished: number | null;
      thumbnailUrl: string | null;
      imageUrl: string | null;
      minPlayers: number | null;
      maxPlayers: number | null;
      playingTimeMinutes: number | null;
      weight: number | null;
      bggRating: number | null;
    };
    owners: ApiUserSummary[];
  }[];
}

function buildFallbackCover(name: string, isExpansion = false): string {
  const palettes = [
    { bgStart: '#1D4E45', bgEnd: '#2F6F5E', accentA: '#82C09A', accentB: '#E7B45A' },
    { bgStart: '#2C5C6E', bgEnd: '#448374', accentA: '#F2C97D', accentB: '#E07A5F' },
    { bgStart: '#7C4F28', bgEnd: '#A67238', accentA: '#F2D08B', accentB: '#3E7C85' },
    { bgStart: '#63271A', bgEnd: '#9E4528', accentA: '#E8924C', accentB: '#6FB8C9' },
  ];
  const pick = palettes[hashString(name) % palettes.length]!;
  return createTabletopArt({
    ...pick,
    ink: '#FAF8F4',
    motif: isExpansion ? 'wings' : 'hex',
    tag: isExpansion ? 'EXPANSIÓN' : 'BGG',
  });
}

export function mapUserSummary(user: ApiUserSummary): UserSummary {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? undefined,
    bggUsername: user.bggUsername ?? undefined,
    initials: getInitials(user.displayName),
    accentColor: getAccentColor(user.id || user.displayName),
  };
}

export function mapGame(game: ApiGame): Game {
  const fallback = buildFallbackCover(game.name, game.isExpansion);
  return {
    id: game.id,
    bggId: game.bggId,
    name: game.name,
    yearPublished: game.yearPublished ?? 0,
    imageUrl: game.imageUrl ?? game.thumbnailUrl ?? fallback,
    thumbnailUrl: game.thumbnailUrl ?? game.imageUrl ?? fallback,
    minPlayers: game.minPlayers ?? 1,
    maxPlayers: game.maxPlayers ?? 4,
    bestPlayers: game.bestPlayers ?? [],
    playingTimeMinutes: game.playingTimeMinutes ?? 45,
    weight: game.weight ?? 0,
    bggRating: game.bggRating ?? 0,
    isExpansion: game.isExpansion,
    baseGameBggId: game.baseGameBggId ?? undefined,
    mechanics: (game.mechanics ?? []).map((m) => m.name),
  };
}

export function mapLibraryItem(item: ApiLibraryItem): LibraryGameItem {
  return {
    ...mapGame(item.game),
    status: item.status,
    personalRating: item.personalRating ?? undefined,
    notes: item.notes ?? undefined,
  };
}

export function mapGroup(group: ApiGroup): Group & {
  gamesCount: number;
  sessionsCount: number;
  memberOwnedCounts: Record<string, number>;
} {
  const memberOwnedCounts: Record<string, number> = {};
  for (const m of group.members) {
    memberOwnedCounts[m.user.id] = m.ownedGamesCount;
  }

  return {
    id: group.id,
    name: group.name,
    inviteCode: group.inviteCode,
    createdBy: group.createdBy,
    gamesCount: group.gamesCount,
    sessionsCount: group.sessionsCount,
    memberOwnedCounts,
    members: group.members.map((m) => ({
      role: m.role,
      joinedAt: m.joinedAt,
      user: mapUserSummary(m.user),
    })),
  };
}

export function mapSessionDetail(detail: ApiSessionDetail): GameSession {
  const proposals: SessionProposal[] = detail.proposals.map((p) => ({
    id: p.id,
    game: mapGame(p.game),
    owners: p.owners.map(mapUserSummary),
    proposedBy: mapUserSummary(p.proposedBy),
    note: p.note ?? undefined,
    status: p.status ?? 'open',
    acceptedAt: p.acceptedAt ?? undefined,
    acceptedBy: p.acceptedBy ? mapUserSummary(p.acceptedBy) : undefined,
    voteCount: p.voteCount,
    score: p.score,
    userVoted: p.userVoted,
    userRank: p.userRank ?? undefined,
  }));

  return {
    id: detail.id,
    groupId: detail.groupId,
    groupName: detail.groupName,
    title: detail.title,
    scheduledAt: detail.scheduledAt,
    location: detail.location ?? 'Lugar a confirmar',
    host: mapUserSummary(detail.host),
    canManageSession: detail.canManageSession,
    status: detail.status,
    votingMode: detail.votingMode,
    maxVotesPerUser: detail.maxVotesPerUser,
    lockedVotesCount: detail.lockedVotesCount,
    lockedRanks: detail.lockedRanks,
    inviteToken: detail.inviteToken,
    participants: detail.participants.map((p) => ({
      rsvp: p.rsvp,
      user: mapUserSummary(p.user),
    })),
    proposals,
  };
}

function getPointsForVote(votingMode: VotingMode, rank: number): number {
  if (votingMode === 'ranked_top3') {
    if (rank === 1) return 3;
    if (rank === 2) return 2;
    if (rank === 3) return 1;
    return 0;
  }
  return 1;
}

export function applyVotesSnapshot(
  session: GameSession,
  snapshot: ApiSessionVotesSnapshot,
): GameSession {
  const existingById = new Map(session.proposals.map((p) => [p.id, p]));
  const updatedProposals: SessionProposal[] = [];

  for (const summary of snapshot.proposals) {
    const existing = existingById.get(summary.id);
    if (!existing) continue;
    updatedProposals.push({
      ...existing,
      status: summary.status,
      voteCount: summary.voteCount,
      score: summary.score,
      userVoted: summary.userVoted,
      userRank: summary.userRank ?? undefined,
    });
  }

  return {
    ...session,
    lockedVotesCount: snapshot.lockedVotesCount,
    lockedRanks: snapshot.lockedRanks,
    proposals: updatedProposals,
  };
}

export function applyOptimisticRsvp(
  session: GameSession,
  user: UserSummary,
  rsvp: RsvpStatus,
): GameSession {
  const exists = session.participants.some((p) => p.user.id === user.id);
  const nextParticipants = exists
    ? session.participants.map((p) =>
        p.user.id === user.id ? { ...p, rsvp } : p,
      )
    : [...session.participants, { user, rsvp }];

  return {
    ...session,
    participants: nextParticipants,
  };
}

export function applyOptimisticVote(
  session: GameSession,
  proposalId: string,
  shouldRemove: boolean,
  rank = 1,
): GameSession {
  const mode = session.votingMode;

  const nextProposals = session.proposals.map((p) => {
    if (p.status === 'accepted') return p;

    if (shouldRemove) {
      if (p.id !== proposalId || !p.userVoted) return p;
      const oldPoints = getPointsForVote(mode, p.userRank ?? 1);
      return {
        ...p,
        voteCount: Math.max(0, p.voteCount - 1),
        score: Math.max(0, p.score - oldPoints),
        userVoted: false,
        userRank: undefined,
      };
    }

    if (mode === 'ranked_top3') {
      if (p.id === proposalId) {
        const nextPoints = getPointsForVote(mode, rank);
        if (p.userVoted) {
          const oldPoints = getPointsForVote(mode, p.userRank ?? 1);
          return {
            ...p,
            score: Math.max(0, p.score - oldPoints + nextPoints),
            userVoted: true,
            userRank: rank,
          };
        }
        return {
          ...p,
          voteCount: p.voteCount + 1,
          score: p.score + nextPoints,
          userVoted: true,
          userRank: rank,
        };
      }

      if (p.userVoted && p.userRank === rank) {
        const oldPoints = getPointsForVote(mode, rank);
        return {
          ...p,
          voteCount: Math.max(0, p.voteCount - 1),
          score: Math.max(0, p.score - oldPoints),
          userVoted: false,
          userRank: undefined,
        };
      }
      return p;
    }

    if (mode === 'single_choice') {
      if (p.id === proposalId) {
        if (p.userVoted) return { ...p, userRank: 1 };
        return {
          ...p,
          voteCount: p.voteCount + 1,
          score: p.score + 1,
          userVoted: true,
          userRank: 1,
        };
      }
      if (p.userVoted) {
        return {
          ...p,
          voteCount: Math.max(0, p.voteCount - 1),
          score: Math.max(0, p.score - 1),
          userVoted: false,
          userRank: undefined,
        };
      }
      return p;
    }

    // multi_vote
    if (p.id === proposalId && !p.userVoted) {
      return {
        ...p,
        voteCount: p.voteCount + 1,
        score: p.score + 1,
        userVoted: true,
        userRank: 1,
      };
    }
    return p;
  });

  return {
    ...session,
    proposals: nextProposals,
  };
}

export function mapSessionListItem(item: ApiSessionListItem): GameSession {
  const mappedHost = mapUserSummary(item.host);
  const toSummaryProposal = (
    raw: {
      id: string;
      status: ProposalStatus;
      acceptedAt?: string | null;
      game: {
        id: string;
        name: string;
        thumbnailUrl: string | null;
        playingTimeMinutes?: number | null;
      };
      voteCount: number;
      score: number;
    },
  ): SessionProposal => ({
    id: raw.id,
    game: {
      id: raw.game.id,
      bggId: 0,
      name: raw.game.name,
      yearPublished: 0,
      imageUrl: raw.game.thumbnailUrl ?? buildFallbackCover(raw.game.name),
      thumbnailUrl: raw.game.thumbnailUrl ?? buildFallbackCover(raw.game.name),
      minPlayers: 1,
      maxPlayers: 4,
      bestPlayers: [],
      playingTimeMinutes: raw.game.playingTimeMinutes ?? 45,
      weight: 0,
      bggRating: 0,
      isExpansion: false,
      mechanics: [],
    },
    owners: [],
    proposedBy: mappedHost,
    status: raw.status,
    acceptedAt: raw.acceptedAt ?? undefined,
    voteCount: raw.voteCount,
    score: raw.score,
    userVoted: false,
  });

  const summaryProposals: SessionProposal[] = (item.acceptedProposals ?? []).map((p) =>
    toSummaryProposal({
      ...p,
      status: 'accepted',
    }),
  );

  if (
    item.topProposal &&
    !summaryProposals.some((p) => p.id === item.topProposal!.id)
  ) {
    summaryProposals.push(
      toSummaryProposal({
        ...item.topProposal,
        status: item.topProposal.status ?? 'open',
      }),
    );
  }

  return {
    id: item.id,
    groupId: item.groupId,
    groupName: item.groupName,
    title: item.title,
    scheduledAt: item.scheduledAt,
    location: item.location ?? 'Lugar a confirmar',
    host: mappedHost,
    status: item.status,
    votingMode: item.votingMode,
    maxVotesPerUser: item.maxVotesPerUser,
    inviteToken: item.inviteToken,
    participants: item.participants.map((p) => ({
      rsvp: p.rsvp,
      user: mapUserSummary(p.user),
    })),
    proposals: summaryProposals,
  };
}

export function mapPoolGame(item: ApiPoolGame): SessionGameItem {
  return {
    ...mapGame(item),
    owners: item.owners.map(mapUserSummary),
    isProposed: item.isProposed,
    proposalStatus: item.proposalStatus ?? (item.isProposed ? 'open' : null),
  };
}

export function mapPlayLog(log: ApiPlayLog): PlayLog {
  const fallback = buildFallbackCover(log.game.name);
  return {
    id: log.id,
    sessionId: log.sessionId ?? undefined,
    sessionTitle: log.sessionTitle ?? undefined,
    groupId: log.groupId,
    playedAt: log.playedAt,
    durationMinutes: log.durationMinutes ?? log.game.playingTimeMinutes ?? 45,
    notes: log.notes ?? undefined,
    game: {
      id: log.game.id,
      bggId: log.game.bggId,
      name: log.game.name,
      yearPublished: log.game.yearPublished ?? 0,
      imageUrl: log.game.imageUrl ?? log.game.thumbnailUrl ?? fallback,
      thumbnailUrl: log.game.thumbnailUrl ?? log.game.imageUrl ?? fallback,
      minPlayers: 1,
      maxPlayers: 4,
      bestPlayers: [],
      playingTimeMinutes: log.game.playingTimeMinutes ?? 45,
      weight: log.game.weight ?? 0,
      bggRating: log.game.bggRating ?? 0,
      isExpansion: false,
      mechanics: [],
    },
    players: log.players.map((p) => ({
      score: p.score ?? undefined,
      isWinner: p.isWinner,
      user: mapUserSummary(p.user),
    })),
  };
}
