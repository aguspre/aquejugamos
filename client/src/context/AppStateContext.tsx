import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  CURRENT_USER,
  DEMO_JOINABLE_GROUP,
  MOCK_GAMES,
  MOCK_GROUPS,
  MOCK_OWNERSHIP_BY_GAME,
  MOCK_PERSONAL_LIBRARY,
  MOCK_PLAY_LOGS,
  MOCK_SESSIONS,
  MOCK_USERS,
} from '../data/mockData';
import type {
  Game,
  GameSession,
  Group,
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
  groupId: string | null;
  groupName: string;
  votingMode: VotingMode;
  maxVotesPerUser: number;
}

export interface CreatePlayLogInput {
  sessionId?: string;
  sessionTitle?: string;
  groupId?: string | null;
  gameId: string;
  playedAt: string;
  durationMinutes: number;
  notes?: string;
  players: PlayLogPlayer[];
}

interface AppStateContextValue {
  currentUser: UserSummary;
  users: UserSummary[];
  groups: Group[];
  activeGroupId: string;
  activeGroup: Group;
  setActiveGroupId: (groupId: string) => void;
  allGames: Game[];
  library: LibraryGameItem[];
  sessions: GameSession[];
  playLogs: PlayLog[];
  lastBggSyncLabel: string;
  ownershipByGame: Record<string, UserSummary[]>;
  // Group actions
  createGroup: (name: string) => Group;
  joinGroupByCode: (inviteCode: string) => { group: Group; alreadyMember: boolean };
  regenerateInviteCode: (groupId: string) => string;
  toggleMemberRole: (groupId: string, userId: string) => void;
  removeGroupMember: (groupId: string, userId: string) => void;
  getUserOwnedGameCount: (userId: string) => number;
  getGroupGameCount: (groupId: string) => number;
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
    groupId?: string | null;
    playerIds?: string[];
  }) => void;
  logPlayModalPrefill: {
    open: boolean;
    gameId?: string;
    sessionId?: string;
    sessionTitle?: string;
    groupId?: string | null;
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

function generateInviteCode(groupName: string): string {
  const prefix = groupName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 7);
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix || 'MESA'}-${suffix}`;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<Group[]>(MOCK_GROUPS);
  const [activeGroupId, setActiveGroupId] = useState<string>(MOCK_GROUPS[0]!.id);
  const [library, setLibrary] = useState<LibraryGameItem[]>(MOCK_PERSONAL_LIBRARY);
  const [sessions, setSessions] = useState<GameSession[]>(MOCK_SESSIONS);
  const [playLogs, setPlayLogs] = useState<PlayLog[]>(MOCK_PLAY_LOGS);
  const [lastBggSyncLabel, setLastBggSyncLabel] = useState<string>('Hace 2 horas');
  const [logPlayModalPrefill, setLogPlayModalPrefill] = useState<{
    open: boolean;
    gameId?: string;
    sessionId?: string;
    sessionTitle?: string;
    groupId?: string | null;
    playerIds?: string[];
  }>({ open: false });

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) ?? groups[0]!,
    [groups, activeGroupId],
  );

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

  const getUserOwnedGameCount = (userId: string): number => {
    let count = 0;
    for (const game of MOCK_GAMES) {
      if (game.isExpansion) continue;
      if (ownershipByGame[game.id]?.some((o) => o.id === userId)) {
        count += 1;
      }
    }
    return count;
  };

  const getGroupGameCount = (groupId: string): number => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return 0;
    const memberIds = new Set(group.members.map((m) => m.user.id));
    let count = 0;
    for (const game of MOCK_GAMES) {
      if (game.isExpansion) continue;
      if (ownershipByGame[game.id]?.some((o) => memberIds.has(o.id))) {
        count += 1;
      }
    }
    return count;
  };

  const createGroup = (name: string): Group => {
    const trimmed = name.trim();
    const created: Group = {
      id: `grp-${Date.now().toString(36)}`,
      name: trimmed,
      inviteCode: generateInviteCode(trimmed),
      createdBy: CURRENT_USER.id,
      members: [
        {
          user: CURRENT_USER,
          role: 'admin',
          joinedAt: new Date().toISOString(),
        },
      ],
    };
    setGroups((prev) => [created, ...prev]);
    setActiveGroupId(created.id);
    return created;
  };

  const joinGroupByCode = (
    rawCode: string,
  ): { group: Group; alreadyMember: boolean } => {
    const normalized = rawCode.trim().toUpperCase();

    const existing = groups.find((g) => g.inviteCode.toUpperCase() === normalized);
    if (existing) {
      const isMember = existing.members.some((m) => m.user.id === CURRENT_USER.id);
      if (!isMember) {
        const updated: Group = {
          ...existing,
          members: [
            ...existing.members,
            { user: CURRENT_USER, role: 'member', joinedAt: new Date().toISOString() },
          ],
        };
        setGroups((prev) => prev.map((g) => (g.id === existing.id ? updated : g)));
        setActiveGroupId(updated.id);
        return { group: updated, alreadyMember: false };
      }
      setActiveGroupId(existing.id);
      return { group: existing, alreadyMember: true };
    }

    // Demo joinable group or simulated group for any code entered
    const joined: Group =
      normalized === DEMO_JOINABLE_GROUP.inviteCode
        ? {
            ...DEMO_JOINABLE_GROUP,
            members: [
              ...DEMO_JOINABLE_GROUP.members,
              { user: CURRENT_USER, role: 'member', joinedAt: new Date().toISOString() },
            ],
          }
        : {
            id: `grp-join-${Date.now().toString(36)}`,
            name: `Mesa ${normalized}`,
            inviteCode: normalized,
            createdBy: MOCK_USERS[1]!.id,
            members: [
              {
                user: MOCK_USERS[1]!,
                role: 'admin',
                joinedAt: '2026-09-10T18:00:00-03:00',
              },
              {
                user: CURRENT_USER,
                role: 'member',
                joinedAt: new Date().toISOString(),
              },
            ],
          };

    setGroups((prev) => [joined, ...prev]);
    setActiveGroupId(joined.id);
    return { group: joined, alreadyMember: false };
  };

  const regenerateInviteCode = (groupId: string): string => {
    let nextCode = '';
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        nextCode = generateInviteCode(group.name);
        return { ...group, inviteCode: nextCode };
      }),
    );
    return nextCode;
  };

  const toggleMemberRole = (groupId: string, userId: string) => {
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          members: group.members.map((m) =>
            m.user.id === userId
              ? { ...m, role: m.role === 'admin' ? 'member' : 'admin' }
              : m,
          ),
        };
      }),
    );
  };

  const removeGroupMember = (groupId: string, userId: string) => {
    setGroups((prev) => {
      const next = prev
        .map((group) => {
          if (group.id !== groupId) return group;
          const remaining = group.members.filter((m) => m.user.id !== userId);
          return { ...group, members: remaining };
        })
        .filter((g) => g.members.some((m) => m.user.id === CURRENT_USER.id));

      if (next.length > 0 && !next.some((g) => g.id === activeGroupId)) {
        setActiveGroupId(next[0]!.id);
      }
      return next.length > 0 ? next : prev;
    });
  };

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

    const targetGroup = input.groupId
      ? groups.find((g) => g.id === input.groupId)
      : undefined;

    const invitedUsers = targetGroup
      ? targetGroup.members.map((m) => m.user)
      : [CURRENT_USER];

    const newSession: GameSession = {
      id,
      groupId: input.groupId,
      groupName: targetGroup?.name ?? input.groupName,
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
      participants: invitedUsers.map((user) => ({
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

        if (session.votingMode === 'ranked_top3') {
          const rank = requestedRank ?? 1;
          const isRemovingSameRank = target.userVoted && target.userRank === rank;

          return {
            ...session,
            proposals: session.proposals.map((p) => {
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
      groupId: input.groupId !== undefined ? input.groupId : activeGroup.id,
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
        groups,
        activeGroupId: activeGroup.id,
        activeGroup,
        setActiveGroupId,
        allGames: MOCK_GAMES,
        library,
        sessions,
        playLogs,
        lastBggSyncLabel,
        ownershipByGame,
        createGroup,
        joinGroupByCode,
        regenerateInviteCode,
        toggleMemberRole,
        removeGroupMember,
        getUserOwnedGameCount,
        getGroupGameCount,
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
