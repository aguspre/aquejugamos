import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";
import { ApiError } from "../api/client";
import {
  bggApi,
  groupsApi,
  libraryApi,
  playLogsApi,
  sessionsApi,
  type BggSearchResult,
  type BggSyncResponse,
} from "../api/endpoints";
import {
  applyOptimisticVote,
  applyVotesSnapshot,
  getInitials,
  mapGroup,
  mapLibraryItem,
  mapPlayLog,
  mapPoolGame,
  mapSessionDetail,
  mapSessionListItem,
  mapUserSummary,
  type ApiGroupStats,
} from "../api/mappers";
import type {
  Game,
  GameSession,
  Group,
  LibraryGameItem,
  PlayLog,
  PlayLogPlayer,
  ProposalStatus,
  RsvpStatus,
  SessionGameItem,
  UserGameStatus,
  UserSummary,
  VotingMode,
} from "../types/domain";
import { useAuth } from "./AuthContext";

export interface EnrichedGroup extends Group {
  gamesCount: number;
  sessionsCount: number;
  memberOwnedCounts: Record<string, number>;
}

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
  isBootstrapping: boolean;
  users: UserSummary[];
  groups: EnrichedGroup[];
  activeGroupId: string | null;
  activeGroup: EnrichedGroup | null;
  activeGroupStats: ApiGroupStats | null;
  setActiveGroupId: (groupId: string) => void;
  allGames: Game[];
  library: LibraryGameItem[];
  sessions: GameSession[];
  playLogs: PlayLog[];
  lastBggSyncLabel: string;
  refreshAll: () => Promise<void>;
  // Group actions
  createGroup: (name: string) => Promise<EnrichedGroup>;
  joinGroupByCode: (
    inviteCode: string,
  ) => Promise<{ group: EnrichedGroup; alreadyMember: boolean }>;
  regenerateInviteCode: (groupId: string) => Promise<string>;
  toggleMemberRole: (groupId: string, userId: string) => Promise<void>;
  removeGroupMember: (groupId: string, userId: string) => Promise<void>;
  getUserOwnedGameCount: (userId: string) => number;
  getGroupGameCount: (groupId: string) => number;
  // Library & BGG actions
  syncWithBgg: (
    bggUsername?: string,
    forceRefresh?: boolean,
  ) => Promise<BggSyncResponse["sync"]>;
  searchBgg: (query: string) => Promise<BggSearchResult[]>;
  importBggGame: (
    bggId: number,
    status?: UserGameStatus,
  ) => Promise<LibraryGameItem>;
  updateLibraryItem: (
    gameId: string,
    patch: Partial<
      Pick<LibraryGameItem, "status" | "personalRating" | "notes">
    >,
  ) => Promise<void>;
  removeLibraryItem: (gameId: string) => Promise<void>;
  // Session actions
  createSession: (input: CreateSessionInput) => Promise<GameSession>;
  joinSessionByToken: (
    inviteToken: string,
    rsvp?: RsvpStatus,
  ) => Promise<GameSession>;
  loadSessionDetail: (sessionId: string) => Promise<GameSession>;
  loadSessionPool: (sessionId: string) => Promise<SessionGameItem[]>;
  updateRsvp: (
    sessionId: string,
    userId: string,
    rsvp: RsvpStatus,
  ) => Promise<GameSession>;
  proposeGame: (
    sessionId: string,
    game: Game,
    note?: string,
  ) => Promise<GameSession>;
  removeProposal: (
    sessionId: string,
    proposalId: string,
  ) => Promise<GameSession>;
  updateProposalStatus: (
    sessionId: string,
    proposalId: string,
    status: ProposalStatus,
  ) => Promise<GameSession>;
  toggleVote: (
    sessionId: string,
    proposalId: string,
    rank?: number,
    currentSession?: GameSession,
    onOptimistic?: (optimisticSession: GameSession) => void,
  ) => Promise<GameSession>;
  toggleSessionLock: (sessionId: string) => Promise<GameSession>;
  // Play log actions
  addPlayLog: (input: CreatePlayLogInput) => Promise<PlayLog>;
  deletePlayLog: (playLogId: string) => Promise<void>;
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

const ACTIVE_GROUP_STORAGE_KEY = "aquejugamos_active_group";

const GUEST_USER: UserSummary = {
  id: "",
  displayName: "Invitado",
  initials: "IN",
  accentColor: "#1E4D3B",
};

const AppStateContext: Context<AppStateContextValue | null> =
  (import.meta.hot?.data?.AppStateContext as
    | Context<AppStateContextValue | null>
    | undefined) ?? createContext<AppStateContextValue | null>(null);

if (import.meta.hot) {
  import.meta.hot.data.AppStateContext = AppStateContext;
}

function formatRelativeSync(isoDate: string | null | undefined): string {
  if (!isoDate) return "Nunca sincronizada";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Sincronizada";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Recién ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays} ${diffDays === 1 ? "día" : "días"}`;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const {
    firebaseUser,
    backendUser,
    isAuthenticated,
    isGuestSession,
    loading: authLoading,
    backendSyncStatus,
    openAuthModal,
    refreshBackendSync,
  } = useAuth();

  const isRegisteredReady = isAuthenticated && backendUser !== null;
  const isInvitedGuestReady = isGuestSession && backendUser !== null;

  const currentUser = useMemo<UserSummary>(() => {
    if (backendUser) {
      return {
        ...mapUserSummary(backendUser),
        avatarUrl: backendUser.avatarUrl ?? firebaseUser?.photoURL ?? undefined,
      };
    }
    if (firebaseUser) {
      const displayName =
        firebaseUser.displayName?.trim() ||
        firebaseUser.email?.split("@")[0] ||
        "Jugador";
      return {
        id: firebaseUser.uid,
        displayName,
        avatarUrl: firebaseUser.photoURL ?? undefined,
        initials: getInitials(displayName),
        accentColor: "#1E4D3B",
      };
    }
    return GUEST_USER;
  }, [backendUser, firebaseUser]);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [groups, setGroups] = useState<EnrichedGroup[]>([]);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [activeGroupStats, setActiveGroupStats] =
    useState<ApiGroupStats | null>(null);
  const [library, setLibrary] = useState<LibraryGameItem[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [playLogs, setPlayLogs] = useState<PlayLog[]>([]);
  const [logPlayModalPrefill, setLogPlayModalPrefill] = useState<{
    open: boolean;
    gameId?: string;
    sessionId?: string;
    sessionTitle?: string;
    groupId?: string | null;
    playerIds?: string[];
  }>({ open: false });

  const ensureRegistered = useCallback(() => {
    if (!isAuthenticated) {
      openAuthModal("signin");
      throw new ApiError(
        403,
        "GUEST_ACTION_FORBIDDEN",
        "Iniciá sesión o creá tu cuenta para realizar esta acción.",
      );
    }
    if (!backendUser) {
      throw new ApiError(
        503,
        "BACKEND_NOT_SYNCED",
        "El servidor todavía no sincronizó tu cuenta. Revisá la conexión con el backend.",
      );
    }
  }, [isAuthenticated, backendUser, openAuthModal]);

  const ensureSessionAccess = useCallback(() => {
    if (isRegisteredReady || isInvitedGuestReady) {
      return;
    }
    if (!isAuthenticated && !isGuestSession) {
      openAuthModal("signin");
      throw new ApiError(401, "AUTH_REQUIRED", "Iniciá sesión para continuar.");
    }
    throw new ApiError(
      503,
      "BACKEND_NOT_SYNCED",
      "El servidor todavía no sincronizó tu perfil. Revisá la conexión con el backend.",
    );
  }, [
    isRegisteredReady,
    isInvitedGuestReady,
    isAuthenticated,
    isGuestSession,
    openAuthModal,
  ]);

  const setActiveGroupId = useCallback((groupId: string) => {
    setActiveGroupIdState(groupId);
    try {
      localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, groupId);
    } catch {
      // ignore storage errors
    }
  }, []);

  const activeGroup = useMemo(() => {
    if (groups.length === 0) return null;
    return groups.find((g) => g.id === activeGroupId) ?? groups[0]!;
  }, [groups, activeGroupId]);

  const refreshGroupStats = useCallback(
    async (groupId: string | null) => {
      if (!isRegisteredReady || !groupId) {
        setActiveGroupStats(null);
        return;
      }
      try {
        const { stats } = await playLogsApi.getGroupStats(groupId);
        setActiveGroupStats(stats);
      } catch {
        setActiveGroupStats(null);
      }
    },
    [isRegisteredReady],
  );

  const refreshAll = useCallback(async () => {
    if (!isRegisteredReady && !isInvitedGuestReady) {
      setGroups([]);
      setLibrary([]);
      setSessions([]);
      setPlayLogs([]);
      setActiveGroupStats(null);
      setIsBootstrapping(false);
      return;
    }

    setIsBootstrapping(true);
    try {
      if (isInvitedGuestReady && !isRegisteredReady) {
        const sessionsRes = await sessionsApi.list();
        setGroups([]);
        setLibrary([]);
        setPlayLogs([]);
        setActiveGroupStats(null);
        setSessions(sessionsRes.sessions.map(mapSessionListItem));
        return;
      }

      const [groupsRes, libraryRes, sessionsRes, logsRes] = await Promise.all([
        groupsApi.list(),
        libraryApi.list(),
        sessionsApi.list(),
        playLogsApi.list(),
      ]);

      const mappedGroups = groupsRes.groups.map(mapGroup);
      setGroups(mappedGroups);
      setLibrary(libraryRes.items.map(mapLibraryItem));
      setSessions(sessionsRes.sessions.map(mapSessionListItem));
      setPlayLogs(logsRes.playLogs.map(mapPlayLog));

      setActiveGroupIdState((prev) => {
        if (prev && mappedGroups.some((g) => g.id === prev)) {
          return prev;
        }
        return mappedGroups[0]?.id ?? null;
      });
    } finally {
      setIsBootstrapping(false);
    }
  }, [isRegisteredReady, isInvitedGuestReady]);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated && backendSyncStatus === "syncing") {
      setIsBootstrapping(true);
      return;
    }
    void refreshAll();
  }, [
    authLoading,
    isAuthenticated,
    isGuestSession,
    backendSyncStatus,
    refreshAll,
  ]);

  useEffect(() => {
    void refreshGroupStats(activeGroup?.id ?? null);
  }, [activeGroup?.id, refreshGroupStats]);

  const users = useMemo<UserSummary[]>(() => {
    const map = new Map<string, UserSummary>();
    if (currentUser.id) {
      map.set(currentUser.id, currentUser);
    }
    for (const group of groups) {
      for (const m of group.members) {
        map.set(m.user.id, m.user);
      }
    }
    return Array.from(map.values());
  }, [currentUser, groups]);

  const allGames = useMemo<Game[]>(() => {
    const map = new Map<string, Game>();
    for (const item of library) {
      map.set(item.id, item);
    }
    for (const session of sessions) {
      for (const proposal of session.proposals) {
        if (!map.has(proposal.game.id)) {
          map.set(proposal.game.id, proposal.game);
        }
      }
    }
    for (const log of playLogs) {
      if (!map.has(log.game.id)) {
        map.set(log.game.id, log.game);
      }
    }
    return Array.from(map.values());
  }, [library, sessions, playLogs]);

  const lastBggSyncLabel = formatRelativeSync(backendUser?.lastBggSyncAt);

  const getUserOwnedGameCount = useCallback(
    (userId: string): number => {
      for (const group of groups) {
        if (userId in group.memberOwnedCounts) {
          return group.memberOwnedCounts[userId] ?? 0;
        }
      }
      if (userId && userId === currentUser.id) {
        return library.filter((g) => g.status === "owned" && !g.isExpansion)
          .length;
      }
      return 0;
    },
    [groups, currentUser.id, library],
  );

  const getGroupGameCount = useCallback(
    (groupId: string): number => {
      return groups.find((g) => g.id === groupId)?.gamesCount ?? 0;
    },
    [groups],
  );

  // =========================================================================
  // Group actions (100% real API)
  // =========================================================================

  const createGroup = useCallback(
    async (name: string): Promise<EnrichedGroup> => {
      ensureRegistered();
      const { group } = await groupsApi.create(name.trim());
      const mapped = mapGroup(group);
      setGroups((prev) => [mapped, ...prev]);
      setActiveGroupId(mapped.id);
      return mapped;
    },
    [ensureRegistered, setActiveGroupId],
  );

  const joinGroupByCode = useCallback(
    async (
      rawCode: string,
    ): Promise<{ group: EnrichedGroup; alreadyMember: boolean }> => {
      ensureRegistered();
      const { group, alreadyMember } = await groupsApi.join(rawCode.trim());
      const mapped = mapGroup(group);
      setGroups((prev) => {
        const exists = prev.some((g) => g.id === mapped.id);
        return exists
          ? prev.map((g) => (g.id === mapped.id ? mapped : g))
          : [mapped, ...prev];
      });
      setActiveGroupId(mapped.id);
      return { group: mapped, alreadyMember };
    },
    [ensureRegistered, setActiveGroupId],
  );

  const regenerateInviteCode = useCallback(
    async (groupId: string): Promise<string> => {
      ensureRegistered();
      const { inviteCode } = await groupsApi.regenerateCode(groupId);
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, inviteCode } : g)),
      );
      return inviteCode;
    },
    [ensureRegistered],
  );

  const toggleMemberRole = useCallback(
    async (groupId: string, userId: string): Promise<void> => {
      ensureRegistered();
      const targetGroup = groups.find((g) => g.id === groupId);
      const targetMember = targetGroup?.members.find(
        (m) => m.user.id === userId,
      );
      if (!targetMember) return;
      const nextRole = targetMember.role === "admin" ? "member" : "admin";

      const { group } = await groupsApi.updateMemberRole(
        groupId,
        userId,
        nextRole,
      );
      const mapped = mapGroup(group);
      setGroups((prev) => prev.map((g) => (g.id === groupId ? mapped : g)));
    },
    [ensureRegistered, groups],
  );

  const removeGroupMember = useCallback(
    async (groupId: string, userId: string): Promise<void> => {
      ensureRegistered();
      const { groupDeleted } = await groupsApi.removeMember(groupId, userId);
      if (groupDeleted || userId === currentUser.id) {
        setGroups((prev) => {
          const remaining = prev.filter((g) => g.id !== groupId);
          if (activeGroupId === groupId) {
            setActiveGroupIdState(remaining[0]?.id ?? null);
          }
          return remaining;
        });
      } else {
        const { groups: refreshed } = await groupsApi.list();
        setGroups(refreshed.map(mapGroup));
      }
    },
    [ensureRegistered, currentUser.id, activeGroupId],
  );

  // =========================================================================
  // Library & BGG actions (100% real API)
  // =========================================================================

  const syncWithBgg = useCallback(
    async (
      bggUsername?: string,
      forceRefresh = false,
    ): Promise<BggSyncResponse["sync"]> => {
      ensureRegistered();
      const { sync } = await bggApi.sync({ bggUsername, forceRefresh });
      const [libraryRes, groupsRes] = await Promise.all([
        libraryApi.list(),
        groupsApi.list(),
        refreshBackendSync(),
      ]);
      setLibrary(libraryRes.items.map(mapLibraryItem));
      setGroups(groupsRes.groups.map(mapGroup));
      return sync;
    },
    [ensureRegistered, refreshBackendSync],
  );

  const searchBgg = useCallback(
    async (query: string): Promise<BggSearchResult[]> => {
      ensureRegistered();
      const { results } = await bggApi.search(query);
      return results;
    },
    [ensureRegistered],
  );

  const importBggGame = useCallback(
    async (
      bggId: number,
      status: UserGameStatus = "owned",
    ): Promise<LibraryGameItem> => {
      ensureRegistered();
      const { item } = await bggApi.importGame(bggId, { status });
      const mapped = mapLibraryItem(item);
      setLibrary((prev) => {
        const exists = prev.some((i) => i.id === mapped.id);
        return exists
          ? prev.map((i) => (i.id === mapped.id ? mapped : i))
          : [mapped, ...prev];
      });
      return mapped;
    },
    [ensureRegistered],
  );

  const updateLibraryItem = useCallback(
    async (
      gameId: string,
      patch: Partial<
        Pick<LibraryGameItem, "status" | "personalRating" | "notes">
      >,
    ): Promise<void> => {
      ensureRegistered();
      await libraryApi.updateItem(gameId, {
        status: patch.status,
        personalRating: patch.personalRating ?? null,
        notes: patch.notes ?? null,
      });
      setLibrary((prev) =>
        prev.map((item) => (item.id === gameId ? { ...item, ...patch } : item)),
      );
    },
    [ensureRegistered],
  );

  const removeLibraryItem = useCallback(
    async (gameId: string): Promise<void> => {
      ensureRegistered();
      await libraryApi.removeItem(gameId);
      setLibrary((prev) => prev.filter((item) => item.id !== gameId));
    },
    [ensureRegistered],
  );

  // =========================================================================
  // Session actions (100% real API)
  // =========================================================================

  const upsertSession = useCallback((updated: GameSession) => {
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === updated.id);
      return exists
        ? prev.map((s) => (s.id === updated.id ? updated : s))
        : [updated, ...prev];
    });
  }, []);

  const createSession = useCallback(
    async (input: CreateSessionInput): Promise<GameSession> => {
      ensureRegistered();
      const { session } = await sessionsApi.create({
        groupId: input.groupId,
        title: input.title,
        scheduledAt: input.scheduledAt,
        location: input.location || null,
        votingMode: input.votingMode,
        maxVotesPerUser: input.maxVotesPerUser,
      });
      const mapped = mapSessionDetail(session);
      upsertSession(mapped);
      return mapped;
    },
    [ensureRegistered, upsertSession],
  );

  const joinSessionByToken = useCallback(
    async (
      inviteToken: string,
      rsvp: RsvpStatus = "going",
    ): Promise<GameSession> => {
      ensureSessionAccess();
      const { session } = await sessionsApi.joinByToken(inviteToken, rsvp);
      const mapped = mapSessionDetail(session);
      upsertSession(mapped);
      return mapped;
    },
    [ensureSessionAccess, upsertSession],
  );

  const loadSessionDetail = useCallback(
    async (sessionId: string): Promise<GameSession> => {
      ensureSessionAccess();
      const { session } = await sessionsApi.getDetail(sessionId);
      const mapped = mapSessionDetail(session);
      upsertSession(mapped);
      return mapped;
    },
    [ensureSessionAccess, upsertSession],
  );

  const loadSessionPool = useCallback(
    async (sessionId: string): Promise<SessionGameItem[]> => {
      ensureSessionAccess();
      const { items } = await sessionsApi.getPool(sessionId, {
        onlyCompatible: false,
        includeExpansions: true,
      });
      return items.map(mapPoolGame);
    },
    [ensureSessionAccess],
  );

  const updateRsvp = useCallback(
    async (
      sessionId: string,
      _userId: string,
      rsvp: RsvpStatus,
    ): Promise<GameSession> => {
      ensureSessionAccess();
      const { session } = await sessionsApi.updateRsvp(sessionId, rsvp);
      const mapped = mapSessionDetail(session);
      upsertSession(mapped);
      return mapped;
    },
    [ensureSessionAccess, upsertSession],
  );

  const proposeGame = useCallback(
    async (
      sessionId: string,
      game: Game,
      note?: string,
    ): Promise<GameSession> => {
      ensureSessionAccess();
      const { session } = await sessionsApi.propose(sessionId, game.id, note);
      const mapped = mapSessionDetail(session);
      upsertSession(mapped);
      return mapped;
    },
    [ensureSessionAccess, upsertSession],
  );

  const removeProposal = useCallback(
    async (sessionId: string, proposalId: string): Promise<GameSession> => {
      ensureSessionAccess();
      const { session } = await sessionsApi.removeProposal(
        sessionId,
        proposalId,
      );
      const mapped = mapSessionDetail(session);
      upsertSession(mapped);
      return mapped;
    },
    [ensureSessionAccess, upsertSession],
  );

  const updateProposalStatus = useCallback(
    async (
      sessionId: string,
      proposalId: string,
      status: ProposalStatus,
    ): Promise<GameSession> => {
      ensureRegistered();
      const { session } = await sessionsApi.updateProposalStatus(
        sessionId,
        proposalId,
        status,
      );
      const mapped = mapSessionDetail(session);
      upsertSession(mapped);
      return mapped;
    },
    [ensureRegistered, upsertSession],
  );

  const toggleVote = useCallback(
    async (
      sessionId: string,
      proposalId: string,
      requestedRank?: number,
      currentSession?: GameSession,
      onOptimistic?: (optimisticSession: GameSession) => void,
    ): Promise<GameSession> => {
      ensureSessionAccess();
      const targetSession =
        currentSession ?? sessions.find((s) => s.id === sessionId);
      const targetProposal = targetSession?.proposals.find(
        (p) => p.id === proposalId,
      );

      const isRanked = targetSession?.votingMode === "ranked_top3";
      const rank = requestedRank ?? 1;
      const shouldRemove = isRanked
        ? Boolean(
            targetProposal?.userVoted && targetProposal?.userRank === rank,
          )
        : Boolean(targetProposal?.userVoted);

      if (targetSession) {
        const optimistic = applyOptimisticVote(
          targetSession,
          proposalId,
          shouldRemove,
          rank,
        );
        upsertSession(optimistic);
        onOptimistic?.(optimistic);
      }

      try {
        const { votes } = shouldRemove
          ? await sessionsApi.removeVote(sessionId, proposalId)
          : await sessionsApi.castVote(sessionId, proposalId, rank);

        if (targetSession) {
          const merged = applyVotesSnapshot(targetSession, votes);
          upsertSession(merged);
          return merged;
        }

        const { session: detail } = await sessionsApi.getDetail(sessionId);
        const mapped = mapSessionDetail(detail);
        upsertSession(mapped);
        return mapped;
      } catch (err) {
        if (targetSession) {
          upsertSession(targetSession);
        }
        throw err;
      }
    },
    [ensureSessionAccess, sessions, upsertSession],
  );

  const toggleSessionLock = useCallback(
    async (sessionId: string): Promise<GameSession> => {
      ensureRegistered();
      const current = sessions.find((s) => s.id === sessionId);
      const nextStatus = current?.status === "locked" ? "voting" : "locked";

      const { session } = await sessionsApi.updateStatus(sessionId, nextStatus);
      const mapped = mapSessionDetail(session);
      upsertSession(mapped);
      return mapped;
    },
    [ensureRegistered, sessions, upsertSession],
  );

  // =========================================================================
  // Play log actions (100% real API)
  // =========================================================================

  const addPlayLog = useCallback(
    async (input: CreatePlayLogInput): Promise<PlayLog> => {
      ensureRegistered();
      const resolvedGroupId =
        input.groupId !== undefined ? input.groupId : (activeGroup?.id ?? null);
      const { playLog } = await playLogsApi.create({
        sessionId: input.sessionId ?? null,
        groupId: resolvedGroupId,
        gameId: input.gameId,
        playedAt: input.playedAt,
        durationMinutes: input.durationMinutes,
        notes: input.notes?.trim() || null,
        players: input.players.map((p) => ({
          userId: p.user.id,
          score: p.score ?? null,
          isWinner: p.isWinner,
        })),
      });
      const mapped = mapPlayLog(playLog);
      setPlayLogs((prev) => [mapped, ...prev]);
      if (resolvedGroupId) {
        void refreshGroupStats(resolvedGroupId);
      }
      return mapped;
    },
    [ensureRegistered, activeGroup, refreshGroupStats],
  );

  const deletePlayLog = useCallback(
    async (playLogId: string): Promise<void> => {
      ensureRegistered();
      await playLogsApi.remove(playLogId);
      setPlayLogs((prev) => prev.filter((l) => l.id !== playLogId));
      if (activeGroup?.id) {
        void refreshGroupStats(activeGroup.id);
      }
    },
    [ensureRegistered, activeGroup, refreshGroupStats],
  );

  const openLogPlayModal: AppStateContextValue["openLogPlayModal"] =
    useCallback(
      (prefill) => {
        if (!isAuthenticated) {
          openAuthModal("signin");
          return;
        }
        setLogPlayModalPrefill({ open: true, ...prefill });
      },
      [isAuthenticated, openAuthModal],
    );

  const closeLogPlayModal = useCallback(() => {
    setLogPlayModalPrefill({ open: false });
  }, []);

  return (
    <AppStateContext.Provider
      value={{
        currentUser,
        isBootstrapping,
        users,
        groups,
        activeGroupId: activeGroup?.id ?? null,
        activeGroup,
        activeGroupStats,
        setActiveGroupId,
        allGames,
        library,
        sessions,
        playLogs,
        lastBggSyncLabel,
        refreshAll,
        createGroup,
        joinGroupByCode,
        regenerateInviteCode,
        toggleMemberRole,
        removeGroupMember,
        getUserOwnedGameCount,
        getGroupGameCount,
        syncWithBgg,
        searchBgg,
        importBggGame,
        updateLibraryItem,
        removeLibraryItem,
        createSession,
        joinSessionByToken,
        loadSessionDetail,
        loadSessionPool,
        updateRsvp,
        proposeGame,
        removeProposal,
        updateProposalStatus,
        toggleVote,
        toggleSessionLock,
        addPlayLog,
        deletePlayLog,
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
    throw new Error("useAppState debe usarse dentro de AppStateProvider");
  }
  return ctx;
}
