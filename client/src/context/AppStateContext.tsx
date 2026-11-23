import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  CURRENT_USER,
  MOCK_GAMES,
  MOCK_OWNERSHIP_BY_GAME,
  MOCK_PERSONAL_LIBRARY,
  MOCK_PLAY_LOGS,
  MOCK_SESSIONS,
  MOCK_USERS,
} from '../data/mockData';
import type {
  Game,
  GameSession,
  LibraryGameItem,
  PlayLog,
  PlayLogPlayer,
  RsvpStatus,
  SessionGameItem,
  UserGameStatus,
  UserSummary,
  VotingMode,
} from '../types/domain';

export interface CreateSessionInput {
  title: string;
  scheduledAt: string;
  location: string;
  groupName: string;
  votingMode: VotingMode;
  maxVotesPerUser: number;
}

export interface CreatePlayLogInput {
  sessionId?: string;
  sessionTitle?: string;
  gameId: string;
  playedAt: string;
  durationMinutes: number;
  notes?: string;
  players: PlayLogPlayer[];
}

interface AppStateContextValue {
  currentUser: UserSummary;
  users: UserSummary[];
  allGames: Game[];
  library: LibraryGameItem[];
  sessions: GameSession[];
  playLogs: PlayLog[];
  lastBggSyncLabel: string;
  ownershipByGame: Record<string, UserSummary[]>;
  // Library actions
  syncWithBgg: () => Promise<{ added: number; updated: number }>;
  updateLibraryItem: (
    gameId: string,
    patch: Partial<Pick<LibraryGameItem, 'status' | 'personalRating' | 'notes'>>,
  ) => void;
  addGameToLibrary: (game: Game, status?: UserGameStatus) => void;
  // Session actions
  createSession: (input: CreateSessionInput) => GameSession;
  updateRsvp: (sessionId: string, userId: string, rsvp: RsvpStatus) => void;
  proposeGame: (sessionId: string, game: Game, note?: string) => void;
  removeProposal: (sessionId: string, proposalId: string) => void;
  toggleVote: (sessionId: string, proposalId: string, rank?: number) => void;
  toggleSessionLock: (sessionId: string) => void;
  getSessionPool: (sessionId: string) => SessionGameItem[];
  // Play log actions
  addPlayLog: (input: CreatePlayLogInput) => PlayLog;
  // Global LogPlayModal trigger
  openLogPlayModal: (prefill?: {
    gameId?: string;
    sessionId?: string;
    sessionTitle?: string;
    playerIds?: string[];
  }) => void;
  logPlayModalPrefill: {
    open: boolean;
    gameId?: string;
    sessionId?: string;
    sessionTitle?: string;
    playerIds?: string[];
  };
  closeLogPlayModal: () => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

const RANK_POINTS: Record<number, number> = {
  1: 3,
  2: 2,
  3: 1,
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<LibraryGameItem[]>(MOCK_PERSONAL_LIBRARY);
  const [sessions, setSessions] = useState<GameSession[]>(MOCK_SESSIONS);
  const [playLogs, setPlayLogs] = useState<PlayLog[]>(MOCK_PLAY_LOGS);
  const [lastBggSyncLabel, setLastBggSyncLabel] = useState<string>('Hace 2 horas');
  const [logPlayModalPrefill, setLogPlayModalPrefill] = useState<{
    open: boolean;
    gameId?: string;
    sessionId?: string;
    sessionTitle?: string;
    playerIds?: string[];
  }>({ open: false });

  // Derive live ownership map incorporating Agustín's live library status
  const ownershipByGame = useMemo(() => {
    const map: Record<string, UserSummary[]> = {};
    for (const game of MOCK_GAMES) {
      const baseOwners = (MOCK_OWNERSHIP_BY_GAME[game.id] ?? []).filter(
        (u) => u.id !== CURRENT_USER.id,
      );
      const myEntry = library.find((item) => item.id === game.id);
      if (myEntry?.status === 'owned') {
        map[game.id] = [CURRENT_USER, ...baseOwners];
      } else {
        map[game.id] = baseOwners;
      }
    }
    return map;
  }, [library]);

  const syncWithBgg = async (): Promise<{ added: number; updated: number }> => {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setLastBggSyncLabel('Recién ahora');
    return { added: 0, updated: library.filter((g) => g.status === 'owned').length };
  };

  const updateLibraryItem = (
    gameId: string,
    patch: Partial<Pick<LibraryGameItem, 'status' | 'personalRating' | 'notes'>>,
  ) => {
    setLibrary((prev) =>
      prev.map((item) => (item.id === gameId ? { ...item, ...patch } : item)),
    );
  };

  const addGameToLibrary = (game: Game, status: UserGameStatus = 'owned') => {
    setLibrary((prev) => {
      const existing = prev.find((item) => item.id === game.id);
      if (existing) {
        return prev.map((item) => (item.id === game.id ? { ...item, status } : item));
      }
      return [{ ...game, status }, ...prev];
    });
  };

  const createSession = (input: CreateSessionInput): GameSession => {
    const id = `session-${Date.now().toString(36)}`;
    const slug = input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 14);
    const newSession: GameSession = {
      id,
      groupName: input.groupName,
      title: input.title,
      scheduledAt: input.scheduledAt,
      location: input.location,
      host: CURRENT_USER,
      status: 'voting',
      votingMode: input.votingMode,
      maxVotesPerUser:
        input.votingMode === 'single_choice'
          ? 1
          : input.votingMode === 'ranked_top3'
            ? 3
            : input.maxVotesPerUser,
      inviteToken: `${slug || 'juntada'}-${Math.floor(100 + Math.random() * 900)}`,
      participants: MOCK_USERS.map((user) => ({
        user,
        rsvp: user.id === CURRENT_USER.id ? 'going' : 'maybe',
      })),
      proposals: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    return newSession;
  };

  const updateRsvp = (sessionId: string, userId: string, rsvp: RsvpStatus) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          participants: session.participants.map((p) =>
            p.user.id === userId ? { ...p, rsvp } : p,
          ),
        };
      }),
    );
  };

  const proposeGame = (sessionId: string, game: Game, note?: string) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        if (session.proposals.some((p) => p.game.id === game.id)) return session;

        const goingIds = new Set(
          session.participants
            .filter((p) => p.rsvp === 'going')
            .map((p) => p.user.id),
        );
        const owners = (ownershipByGame[game.id] ?? []).filter((o) =>
          goingIds.has(o.id),
        );

        const newProposal = {
          id: `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          game,
          owners: owners.length > 0 ? owners : ownershipByGame[game.id] ?? [CURRENT_USER],
          proposedBy: CURRENT_USER,
          note: note?.trim() || undefined,
          voteCount: 0,
          score: 0,
          userVoted: false,
        };

        return {
          ...session,
          proposals: [...session.proposals, newProposal],
        };
      }),
    );
  };

  const removeProposal = (sessionId: string, proposalId: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              proposals: session.proposals.filter((p) => p.id !== proposalId),
            }
          : session,
      ),
    );
  };

  const toggleVote = (sessionId: string, proposalId: string, requestedRank?: number) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId || session.status === 'locked') return session;

        const target = session.proposals.find((p) => p.id === proposalId);
        if (!target) return session;

        // Mode 1: Ranked Top 3
        if (session.votingMode === 'ranked_top3') {
          const rank = requestedRank ?? 1;
          const isRemovingSameRank = target.userVoted && target.userRank === rank;

          return {
            ...session,
            proposals: session.proposals.map((p) => {
              // Remove previous points if this proposal held the requested rank or if it's the target
              let nextVoted = p.userVoted;
              let nextRank = p.userRank;
              let deltaVotes = 0;
              let deltaScore = 0;

              if (p.id === proposalId) {
                if (p.userVoted && p.userRank) {
                  deltaVotes -= 1;
                  deltaScore -= RANK_POINTS[p.userRank] ?? 1;
                }
                if (isRemovingSameRank) {
                  nextVoted = false;
                  nextRank = undefined;
                } else {
                  nextVoted = true;
                  nextRank = rank;
                  deltaVotes += 1;
                  deltaScore += RANK_POINTS[rank] ?? 1;
                }
              } else if (!isRemovingSameRank && p.userVoted && p.userRank === rank) {
                // Free up this rank from the other proposal
                nextVoted = false;
                nextRank = undefined;
                deltaVotes -= 1;
                deltaScore -= RANK_POINTS[rank] ?? 1;
              }

              return {
                ...p,
                userVoted: nextVoted,
                userRank: nextRank,
                voteCount: Math.max(0, p.voteCount + deltaVotes),
                score: Math.max(0, p.score + deltaScore),
              };
            }),
          };
        }

        // Mode 2: Single choice (swap vote automatically)
        if (session.votingMode === 'single_choice') {
          const alreadyVoted = target.userVoted;
          return {
            ...session,
            proposals: session.proposals.map((p) => {
              if (p.id === proposalId) {
                return {
                  ...p,
                  userVoted: !alreadyVoted,
                  voteCount: Math.max(0, p.voteCount + (alreadyVoted ? -1 : 1)),
                  score: Math.max(0, p.score + (alreadyVoted ? -1 : 1)),
                };
              }
              if (!alreadyVoted && p.userVoted) {
                return {
                  ...p,
                  userVoted: false,
                  voteCount: Math.max(0, p.voteCount - 1),
                  score: Math.max(0, p.score - 1),
                };
              }
              return p;
            }),
          };
        }

        // Mode 3: Multi-vote with maxVotesPerUser cap
        const currentVotes = session.proposals.filter((p) => p.userVoted).length;
        if (!target.userVoted && currentVotes >= session.maxVotesPerUser) {
          return session;
        }

        return {
          ...session,
          proposals: session.proposals.map((p) => {
            if (p.id !== proposalId) return p;
            const nextVoted = !p.userVoted;
            const delta = nextVoted ? 1 : -1;
            return {
              ...p,
              userVoted: nextVoted,
              voteCount: Math.max(0, p.voteCount + delta),
              score: Math.max(0, p.score + delta),
            };
          }),
        };
      }),
    );
  };

  const toggleSessionLock = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          status: session.status === 'locked' ? 'voting' : 'locked',
        };
      }),
    );
  };

  const getSessionPool = (sessionId: string): SessionGameItem[] => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return [];

    const goingIds = new Set(
      session.participants.filter((p) => p.rsvp === 'going').map((p) => p.user.id),
    );
    const proposedGameIds = new Set(session.proposals.map((p) => p.game.id));

    return MOCK_GAMES.map((game) => {
      const goingOwners = (ownershipByGame[game.id] ?? []).filter((owner) =>
        goingIds.has(owner.id),
      );
      return {
        ...game,
        owners: goingOwners,
        isProposed: proposedGameIds.has(game.id),
      };
    }).filter((item) => item.owners.length > 0);
  };

  const addPlayLog = (input: CreatePlayLogInput): PlayLog => {
    const game = MOCK_GAMES.find((g) => g.id === input.gameId) ?? MOCK_GAMES[0]!;
    const newLog: PlayLog = {
      id: `log-${Date.now().toString(36)}`,
      sessionId: input.sessionId,
      sessionTitle: input.sessionTitle,
      game,
      playedAt: input.playedAt,
      durationMinutes: input.durationMinutes,
      notes: input.notes?.trim() || undefined,
      players: input.players,
    };
    setPlayLogs((prev) => [newLog, ...prev]);
    return newLog;
  };

  const openLogPlayModal: AppStateContextValue['openLogPlayModal'] = (prefill) => {
    setLogPlayModalPrefill({ open: true, ...prefill });
  };

  const closeLogPlayModal = () => {
    setLogPlayModalPrefill({ open: false });
  };

  return (
    <AppStateContext.Provider
      value={{
        currentUser: CURRENT_USER,
        users: MOCK_USERS,
        allGames: MOCK_GAMES,
        library,
        sessions,
        playLogs,
        lastBggSyncLabel,
        ownershipByGame,
        syncWithBgg,
        updateLibraryItem,
        addGameToLibrary,
        createSession,
        updateRsvp,
        proposeGame,
        removeProposal,
        toggleVote,
        toggleSessionLock,
        getSessionPool,
        addPlayLog,
        openLogPlayModal,
        logPlayModalPrefill,
        closeLogPlayModal,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState debe usarse dentro de AppStateProvider');
  }
  return ctx;
}
