import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
  applyOptimisticRsvp,
  applyOptimisticVote,
  applyProposalCreatedDelta,
  applyProposalDeletedDelta,
  applyProposalStatusDelta,
  applyRsvpDelta,
  applySessionMetadataPatch,
  applySessionStatusPatch,
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
  RecurrenceFrequency,
  RsvpStatus,
  SessionGameItem,
  SessionSeriesSummary,
  UserGameStatus,
  UserSummary,
  VotingMode,
} from "../types/domain";
import { useAuth } from "./AuthContext";

export interface EnrichedGroup extends Group {
  gamesCount: number;
  sessionsCount: number;
  playLogsCount: number;
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
  maxProposalsPerUser?: number | null;
  recurrenceFrequency?: RecurrenceFrequency | null;
}

export interface UpdateSessionInput {
  title?: string;
  scheduledAt?: string;
  location?: string | null;
  maxProposalsPerUser?: number | null;
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
  isLibraryLoaded: boolean;
  isLibraryLoading: boolean;
  libraryError: string | null;
  isPlayLogsLoaded: boolean;
  isPlayLogsLoading: boolean;
  playLogsError: string | null;
  isGroupStatsLoading: boolean;
  groupStatsError: string | null;
  users: UserSummary[];
  groups: EnrichedGroup[];
  activeGroupId: string | null;
  activeGroup: EnrichedGroup | null;
  activeGroupStats: ApiGroupStats | null;
  setActiveGroupId: (groupId: string) => void;
  allGames: Game[];
  library: LibraryGameItem[];
  libraryCount: number;
  sessions: GameSession[];
  playLogs: PlayLog[];
  lastBggSyncLabel: string;
  refreshAll: () => Promise<void>;
  ensureLibraryLoaded: (force?: boolean) => Promise<void>;
  ensurePlayLogsLoaded: (force?: boolean) => Promise<void>;
  ensureGroupStatsLoaded: (
    groupId: string | null,
    force?: boolean,
  ) => Promise<void>;
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
  updateSession: (
    sessionId: string,
    input: UpdateSessionInput,
  ) => Promise<GameSession>;
  cancelSession: (sessionId: string) => Promise<GameSession>;
  reopenSession: (sessionId: string) => Promise<GameSession>;
  deleteSession: (sessionId: string) => Promise<void>;
  joinSessionByToken: (
    inviteToken: string,
    rsvp?: RsvpStatus,
  ) => Promise<GameSession>;
  joinSeriesByShareToken: (
    shareToken: string,
    rsvp?: RsvpStatus,
  ) => Promise<GameSession>;
  advanceSeries: (seriesId: string) => Promise<GameSession>;
  updateSeries: (
    seriesId: string,
    payload: { frequency?: RecurrenceFrequency; isActive?: boolean },
  ) => Promise<{
    series: SessionSeriesSummary;
    activeSessionId: string | null;
  }>;
  loadSessionDetail: (sessionId: string) => Promise<GameSession>;
  loadSessionPool: (sessionId: string) => Promise<SessionGameItem[]>;
  updateRsvp: (
    sessionId: string,
    userId: string,
    rsvp: RsvpStatus,
    currentSession?: GameSession,
    onOptimistic?: (optimisticSession: GameSession) => void,
  ) => Promise<GameSession>;
  proposeGame: (
    sessionId: string,
    game: Game,
    note?: string,
  ) => Promise<GameSession>;
  removeProposal: (
    sessionId: string,
    proposalId: string,
  ) => Promise<{ session: GameSession; refundedVotesCount: number }>;
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

function mergeSessionListPreservingDetails(
  prev: GameSession[],
  incomingList: GameSession[],
  rawCountsById: Map<string, number>,
): GameSession[] {
  const prevById = new Map(prev.map((s) => [s.id, s]));
  return incomingList.map((item) => {
    const existing = prevById.get(item.id);
    if (!existing?.isDetailLoaded) {
      return item;
    }
    const expectedProposalsCount = rawCountsById.get(item.id);
    const prevGoingKey = existing.participants
      .filter((p) => p.rsvp === "going")
      .map((p) => p.user.id)
      .sort()
      .join(",");
    const nextGoingKey = item.participants
      .filter((p) => p.rsvp === "going")
      .map((p) => p.user.id)
      .sort()
      .join(",");

    if (
      expectedProposalsCount !== undefined &&
      expectedProposalsCount === existing.proposals.length &&
      existing.status === item.status &&
      prevGoingKey === nextGoingKey
    ) {
      const nextMaxProposals = item.maxProposalsPerUser ?? null;
      const nextProposalsRemaining =
        nextMaxProposals !== null && existing.userProposalsCount !== undefined
          ? Math.max(0, nextMaxProposals - existing.userProposalsCount)
          : null;

      return {
        ...existing,
        title: item.title,
        scheduledAt: item.scheduledAt,
        location: item.location,
        maxVotesPerUser: item.maxVotesPerUser,
        maxProposalsPerUser: nextMaxProposals,
        proposalsRemaining: nextProposalsRemaining,
        canManageSession: item.canManageSession,
        series: item.series,
        participants: item.participants,
      };
    }
    return item;
  });
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const {
    firebaseUser,
    backendUser,
    initialBootstrap,
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
  const [isLibraryLoaded, setIsLibraryLoaded] = useState(false);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [isPlayLogsLoaded, setIsPlayLogsLoaded] = useState(false);
  const [isPlayLogsLoading, setIsPlayLogsLoading] = useState(false);
  const [playLogsError, setPlayLogsError] = useState<string | null>(null);
  const [isGroupStatsLoading, setIsGroupStatsLoading] = useState(false);
  const [groupStatsError, setGroupStatsError] = useState<string | null>(null);
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
  const [libraryCount, setLibraryCount] = useState(0);
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

  const sessionsRef = useRef<GameSession[]>(sessions);
  sessionsRef.current = sessions;
  const libraryRef = useRef<LibraryGameItem[]>(library);
  libraryRef.current = library;

  const authEpochRef = useRef(0);
  const activeGroupIdRef = useRef<string | null>(null);
  const appliedBootstrapVersionRef = useRef(0);
  const libraryLoadedRef = useRef(false);
  const librarySeqRef = useRef(0);
  const libraryInFlightRef = useRef<Promise<void> | null>(null);
  const playLogsLoadedRef = useRef(false);
  const playLogsSeqRef = useRef(0);
  const playLogsInFlightRef = useRef<Promise<void> | null>(null);
  const statsCacheByGroupRef = useRef(new Map<string, ApiGroupStats>());
  const statsSeqByGroupRef = useRef(new Map<string, number>());
  const statsInFlightByGroupRef = useRef(new Map<string, Promise<void>>());

  const commitSessions = useCallback(
    (updater: (prev: GameSession[]) => GameSession[]) => {
      const next = updater(sessionsRef.current);
      sessionsRef.current = next;
      setSessions(next);
    },
    [],
  );

  const commitLibrary = useCallback(
    (updater: (prev: LibraryGameItem[]) => LibraryGameItem[]) => {
      const next = updater(libraryRef.current);
      libraryRef.current = next;
      setLibrary(next);
    },
    [],
  );

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
      const isConnecting =
        backendSyncStatus === "idle" || backendSyncStatus === "syncing";
      throw new ApiError(
        503,
        "BACKEND_NOT_SYNCED",
        isConnecting
          ? "Todavía estamos cargando tu cuenta. Esperá un momento y volvé a intentar."
          : "No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.",
      );
    }
  }, [isAuthenticated, backendUser, backendSyncStatus, openAuthModal]);

  const ensureSessionAccess = useCallback(() => {
    if (isRegisteredReady || isInvitedGuestReady) {
      return;
    }
    if (!isAuthenticated && !isGuestSession) {
      openAuthModal("signin");
      throw new ApiError(401, "AUTH_REQUIRED", "Iniciá sesión para continuar.");
    }
    const isConnecting =
      backendSyncStatus === "idle" || backendSyncStatus === "syncing";
    throw new ApiError(
      503,
      "BACKEND_NOT_SYNCED",
      isConnecting
        ? "Todavía estamos conectando tu perfil. Esperá un momento y volvé a intentar."
        : "No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.",
    );
  }, [
    isRegisteredReady,
    isInvitedGuestReady,
    isAuthenticated,
    isGuestSession,
    backendSyncStatus,
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

  activeGroupIdRef.current = activeGroup?.id ?? null;

  // Keep activeGroupStats synced with cache if already fetched for that group
  useEffect(() => {
    const gid = activeGroup?.id ?? null;
    setGroupStatsError(null);
    if (!gid) {
      setActiveGroupStats(null);
      setIsGroupStatsLoading(false);
      return;
    }
    setActiveGroupStats(statsCacheByGroupRef.current.get(gid) ?? null);
    setIsGroupStatsLoading(statsInFlightByGroupRef.current.has(gid));
  }, [activeGroup?.id]);

  const ensureLibraryLoaded = useCallback(
    async (force = false): Promise<void> => {
      if (!isRegisteredReady) return;
      if (!force && libraryLoadedRef.current) return;
      if (!force && libraryInFlightRef.current) {
        return libraryInFlightRef.current;
      }

      const epoch = authEpochRef.current;
      const seq = ++librarySeqRef.current;
      let task!: Promise<void>;
      task = (async () => {
        setIsLibraryLoading(true);
        setLibraryError(null);
        try {
          const res = await libraryApi.list();
          if (authEpochRef.current !== epoch || librarySeqRef.current !== seq) {
            return;
          }
          const mapped = res.items.map(mapLibraryItem);
          libraryRef.current = mapped;
          setLibrary(mapped);
          setLibraryCount(mapped.length);
          libraryLoadedRef.current = true;
          setIsLibraryLoaded(true);
        } catch (err) {
          if (authEpochRef.current !== epoch || librarySeqRef.current !== seq) {
            return;
          }
          setLibraryError(
            err instanceof ApiError
              ? err.message
              : "No pudimos cargar tu ludoteca. Intentá nuevamente.",
          );
        } finally {
          if (librarySeqRef.current === seq) {
            libraryInFlightRef.current = null;
            if (authEpochRef.current === epoch) {
              setIsLibraryLoading(false);
            }
          }
        }
      })();

      libraryInFlightRef.current = task;
      return task;
    },
    [isRegisteredReady],
  );

  const ensurePlayLogsLoaded = useCallback(
    async (force = false): Promise<void> => {
      if (!isRegisteredReady) return;
      if (!force && playLogsLoadedRef.current) return;
      if (!force && playLogsInFlightRef.current) {
        return playLogsInFlightRef.current;
      }

      const epoch = authEpochRef.current;
      const seq = ++playLogsSeqRef.current;
      let task!: Promise<void>;
      task = (async () => {
        setIsPlayLogsLoading(true);
        setPlayLogsError(null);
        try {
          const res = await playLogsApi.list();
          if (
            authEpochRef.current !== epoch ||
            playLogsSeqRef.current !== seq
          ) {
            return;
          }
          setPlayLogs(res.playLogs.map(mapPlayLog));
          playLogsLoadedRef.current = true;
          setIsPlayLogsLoaded(true);
        } catch (err) {
          if (
            authEpochRef.current !== epoch ||
            playLogsSeqRef.current !== seq
          ) {
            return;
          }
          setPlayLogsError(
            err instanceof ApiError
              ? err.message
              : "No pudimos cargar el historial de partidas.",
          );
        } finally {
          if (playLogsSeqRef.current === seq) {
            playLogsInFlightRef.current = null;
            if (authEpochRef.current === epoch) {
              setIsPlayLogsLoading(false);
            }
          }
        }
      })();

      playLogsInFlightRef.current = task;
      return task;
    },
    [isRegisteredReady],
  );

  const ensureGroupStatsLoaded = useCallback(
    async (groupId: string | null, force = false): Promise<void> => {
      if (!isRegisteredReady || !groupId) {
        setActiveGroupStats(null);
        setGroupStatsError(null);
        setIsGroupStatsLoading(false);
        return;
      }

      if (!force && statsCacheByGroupRef.current.has(groupId)) {
        if (activeGroupIdRef.current === groupId) {
          setActiveGroupStats(statsCacheByGroupRef.current.get(groupId)!);
          setGroupStatsError(null);
          setIsGroupStatsLoading(false);
        }
        return;
      }

      const existingTask = statsInFlightByGroupRef.current.get(groupId);
      if (!force && existingTask) {
        if (activeGroupIdRef.current === groupId) {
          setIsGroupStatsLoading(true);
          setGroupStatsError(null);
        }
        return existingTask;
      }

      const epoch = authEpochRef.current;
      const seq = (statsSeqByGroupRef.current.get(groupId) ?? 0) + 1;
      statsSeqByGroupRef.current.set(groupId, seq);

      const task = (async () => {
        if (activeGroupIdRef.current === groupId) {
          setIsGroupStatsLoading(true);
          setGroupStatsError(null);
        }
        try {
          const { stats } = await playLogsApi.getGroupStats(groupId);
          if (
            authEpochRef.current !== epoch ||
            statsSeqByGroupRef.current.get(groupId) !== seq
          ) {
            return;
          }
          statsCacheByGroupRef.current.set(groupId, stats);
          if (activeGroupIdRef.current === groupId) {
            setActiveGroupStats(stats);
            setGroupStatsError(null);
          }
        } catch (err) {
          if (
            authEpochRef.current !== epoch ||
            statsSeqByGroupRef.current.get(groupId) !== seq
          ) {
            return;
          }
          if (activeGroupIdRef.current === groupId) {
            setActiveGroupStats(null);
            setGroupStatsError(
              err instanceof ApiError
                ? err.message
                : "No pudimos cargar las estadísticas del grupo.",
            );
          }
        } finally {
          if (
            authEpochRef.current === epoch &&
            statsSeqByGroupRef.current.get(groupId) === seq
          ) {
            statsInFlightByGroupRef.current.delete(groupId);
            if (activeGroupIdRef.current === groupId) {
              setIsGroupStatsLoading(false);
            }
          }
        }
      })();

      statsInFlightByGroupRef.current.set(groupId, task);
      return task;
    },
    [isRegisteredReady],
  );

  const refreshAll = useCallback(async () => {
    if (!isRegisteredReady && !isInvitedGuestReady) {
      setGroups([]);
      commitLibrary(() => []);
      setLibraryCount(0);
      commitSessions(() => []);
      setPlayLogs([]);
      setActiveGroupStats(null);
      libraryLoadedRef.current = false;
      setIsLibraryLoaded(false);
      playLogsLoadedRef.current = false;
      setIsPlayLogsLoaded(false);
      statsCacheByGroupRef.current.clear();
      setIsBootstrapping(false);
      return;
    }

    const epoch = authEpochRef.current;
    setIsBootstrapping(true);
    try {
      if (isInvitedGuestReady && !isRegisteredReady) {
        const sessionsRes = await sessionsApi.list();
        if (authEpochRef.current !== epoch) return;
        const countsMap = new Map(
          sessionsRes.sessions.map((s) => [s.id, s.proposalsCount]),
        );
        const mappedList = sessionsRes.sessions.map(mapSessionListItem);
        setGroups([]);
        commitLibrary(() => []);
        setLibraryCount(0);
        setPlayLogs([]);
        setActiveGroupStats(null);
        commitSessions((prev) =>
          mergeSessionListPreservingDetails(prev, mappedList, countsMap),
        );
        return;
      }

      const bootstrapped = await refreshBackendSync();
      void bootstrapped;
    } catch {
      // Mantenemos el estado actual si falla una recarga en segundo plano
    } finally {
      if (authEpochRef.current === epoch) {
        setIsBootstrapping(false);
      }
    }
  }, [
    isRegisteredReady,
    isInvitedGuestReady,
    refreshBackendSync,
    commitLibrary,
    commitSessions,
  ]);

  const authIdentityKey = isRegisteredReady
    ? `user:${backendUser?.id ?? ""}`
    : isInvitedGuestReady
      ? "guest"
      : "anon";
  const prevAuthIdentityRef = useRef(authIdentityKey);

  // CRITICAL: Run identity-transition invalidation inside useLayoutEffect so it
  // executes BEFORE any child component's passive useEffect (e.g. LibraryPage,
  // HistoryPage, SessionRoomPage) fires ensureLibraryLoaded / ensurePlayLogsLoaded.
  // Also only invalidate/reset when leaving a non-"anon" session (sign-out,
  // guest -> registered, or user A -> user B), never on initial "anon" -> "user" load.
  useLayoutEffect(() => {
    if (authLoading) return;
    if (prevAuthIdentityRef.current === authIdentityKey) return;

    const prevIdentity = prevAuthIdentityRef.current;
    prevAuthIdentityRef.current = authIdentityKey;

    if (prevIdentity !== "anon") {
      authEpochRef.current += 1;
      appliedBootstrapVersionRef.current = 0;
      libraryLoadedRef.current = false;
      setIsLibraryLoaded(false);
      librarySeqRef.current += 1;
      libraryInFlightRef.current = null;
      playLogsLoadedRef.current = false;
      setIsPlayLogsLoaded(false);
      playLogsSeqRef.current += 1;
      playLogsInFlightRef.current = null;
      statsCacheByGroupRef.current.clear();
      statsInFlightByGroupRef.current.clear();
      setIsLibraryLoading(false);
      setIsPlayLogsLoading(false);
      setIsGroupStatsLoading(false);
      setLibraryError(null);
      setPlayLogsError(null);
      setGroupStatsError(null);
      setGroups([]);
      commitLibrary(() => []);
      setLibraryCount(0);
      commitSessions(() => []);
      setPlayLogs([]);
      setActiveGroupStats(null);
    }
  }, [authLoading, authIdentityKey, commitLibrary, commitSessions]);

  // Hydrate immediately from AuthContext's single /api/auth/bootstrap response (0 extra network calls!)
  useEffect(() => {
    if (authLoading) return;

    if (
      isAuthenticated &&
      (backendSyncStatus === "idle" || backendSyncStatus === "syncing")
    ) {
      setIsBootstrapping(true);
      return;
    }

    if (!isRegisteredReady && !isInvitedGuestReady) {
      setIsBootstrapping(false);
      return;
    }

    if (
      initialBootstrap &&
      initialBootstrap.version !== appliedBootstrapVersionRef.current
    ) {
      appliedBootstrapVersionRef.current = initialBootstrap.version;
      const mappedGroups = initialBootstrap.groups.map(mapGroup);
      const countsMap = new Map(
        initialBootstrap.sessions.map((s) => [s.id, s.proposalsCount]),
      );
      const mappedSessions = initialBootstrap.sessions.map(mapSessionListItem);

      setGroups(mappedGroups);
      setLibraryCount(initialBootstrap.libraryCount);
      commitSessions((prev) =>
        mergeSessionListPreservingDetails(prev, mappedSessions, countsMap),
      );
      setActiveGroupIdState((prev) => {
        if (prev && mappedGroups.some((g) => g.id === prev)) {
          return prev;
        }
        return mappedGroups[0]?.id ?? null;
      });
      setIsBootstrapping(false);
      return;
    }

    // Guest session joined dynamically via /api/auth/guest-join (without initialBootstrap)
    if (isInvitedGuestReady && !isRegisteredReady && !initialBootstrap) {
      void refreshAll();
      return;
    }

    setIsBootstrapping(false);
  }, [
    authLoading,
    authIdentityKey,
    isAuthenticated,
    isRegisteredReady,
    isInvitedGuestReady,
    backendSyncStatus,
    initialBootstrap,
    refreshAll,
    commitLibrary,
    commitSessions,
  ]);

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
      if (userId && userId === currentUser.id && libraryLoadedRef.current) {
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
  // Group actions
  // =========================================================================

  const createGroup = useCallback(
    async (name: string): Promise<EnrichedGroup> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const { group } = await groupsApi.create(name.trim());
      const mapped = mapGroup(group);
      if (authEpochRef.current !== epoch) return mapped;
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
      const epoch = authEpochRef.current;
      const { group, alreadyMember } = await groupsApi.join(rawCode.trim());
      const mapped = mapGroup(group);
      if (authEpochRef.current !== epoch) {
        return { group: mapped, alreadyMember };
      }
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
      const epoch = authEpochRef.current;
      const { inviteCode } = await groupsApi.regenerateCode(groupId);
      if (authEpochRef.current !== epoch) return inviteCode;
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
      const epoch = authEpochRef.current;
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
      if (authEpochRef.current !== epoch) return;
      const mapped = mapGroup(group);
      setGroups((prev) => prev.map((g) => (g.id === groupId ? mapped : g)));
    },
    [ensureRegistered, groups],
  );

  const removeGroupMember = useCallback(
    async (groupId: string, userId: string): Promise<void> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const { groupDeleted, group } = await groupsApi.removeMember(
        groupId,
        userId,
      );
      if (authEpochRef.current !== epoch) return;
      statsCacheByGroupRef.current.delete(groupId);

      if (groupDeleted || userId === currentUser.id) {
        setGroups((prev) => {
          const remaining = prev.filter((g) => g.id !== groupId);
          if (activeGroupId === groupId) {
            setActiveGroupIdState(remaining[0]?.id ?? null);
          }
          return remaining;
        });
      } else if (group) {
        const mapped = mapGroup(group);
        setGroups((prev) => prev.map((g) => (g.id === groupId ? mapped : g)));
      }
    },
    [ensureRegistered, currentUser.id, activeGroupId],
  );

  // =========================================================================
  // Library & BGG actions
  // =========================================================================

  const syncWithBgg = useCallback(
    async (
      bggUsername?: string,
      forceRefresh = false,
    ): Promise<BggSyncResponse["sync"]> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const { sync } = await bggApi.sync({ bggUsername, forceRefresh });
      if (authEpochRef.current !== epoch) return sync;
      statsCacheByGroupRef.current.clear();
      await Promise.all([ensureLibraryLoaded(true), refreshBackendSync()]);
      return sync;
    },
    [ensureRegistered, ensureLibraryLoaded, refreshBackendSync],
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
      const epoch = authEpochRef.current;
      const { item } = await bggApi.importGame(bggId, { status });
      const mapped = mapLibraryItem(item);
      if (authEpochRef.current !== epoch) return mapped;
      statsCacheByGroupRef.current.clear();

      const exists = libraryRef.current.some((i) => i.id === mapped.id);
      commitLibrary((prev) =>
        prev.some((i) => i.id === mapped.id)
          ? prev.map((i) => (i.id === mapped.id ? mapped : i))
          : [mapped, ...prev],
      );
      if (!exists) {
        setLibraryCount((c) => c + 1);
      }
      return mapped;
    },
    [ensureRegistered, commitLibrary],
  );

  const updateLibraryItem = useCallback(
    async (
      gameId: string,
      patch: Partial<
        Pick<LibraryGameItem, "status" | "personalRating" | "notes">
      >,
    ): Promise<void> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      let previousItem: LibraryGameItem | undefined;
      commitLibrary((prev) =>
        prev.map((item) => {
          if (item.id === gameId) {
            previousItem = item;
            return { ...item, ...patch };
          }
          return item;
        }),
      );
      try {
        await libraryApi.updateItem(gameId, {
          status: patch.status,
          personalRating: patch.personalRating,
          notes: patch.notes,
        });
        if (authEpochRef.current === epoch && patch.status !== undefined) {
          statsCacheByGroupRef.current.clear();
        }
      } catch (err) {
        if (authEpochRef.current === epoch && previousItem) {
          const rollback = previousItem;
          commitLibrary((prev) =>
            prev.map((item) => (item.id === gameId ? rollback : item)),
          );
        }
        throw err;
      }
    },
    [ensureRegistered, commitLibrary],
  );

  const removeLibraryItem = useCallback(
    async (gameId: string): Promise<void> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const removedItem = libraryRef.current.find((item) => item.id === gameId);
      await libraryApi.removeItem(gameId);
      if (authEpochRef.current !== epoch) return;
      commitLibrary((prev) => prev.filter((item) => item.id !== gameId));
      setLibraryCount((c) => Math.max(0, c - 1));
      statsCacheByGroupRef.current.clear();

      if (
        removedItem &&
        removedItem.status === "owned" &&
        !removedItem.isExpansion
      ) {
        setGroups((prev) =>
          prev.map((g) => {
            if (!(currentUser.id in g.memberOwnedCounts)) return g;
            const prevUserOwned = g.memberOwnedCounts[currentUser.id] ?? 0;
            return {
              ...g,
              memberOwnedCounts: {
                ...g.memberOwnedCounts,
                [currentUser.id]: Math.max(0, prevUserOwned - 1),
              },
            };
          }),
        );
      }
    },
    [ensureRegistered, currentUser.id, commitLibrary],
  );

  // =========================================================================
  // Session actions (Delta-first updates)
  // =========================================================================

  const upsertSession = useCallback(
    (updated: GameSession) => {
      commitSessions((prev) => {
        const exists = prev.some((s) => s.id === updated.id);
        return exists
          ? prev.map((s) => (s.id === updated.id ? updated : s))
          : [updated, ...prev];
      });
    },
    [commitSessions],
  );

  const createSession = useCallback(
    async (input: CreateSessionInput): Promise<GameSession> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const { session } = await sessionsApi.create({
        groupId: input.groupId,
        title: input.title,
        scheduledAt: input.scheduledAt,
        location: input.location || null,
        votingMode: input.votingMode,
        maxVotesPerUser: input.maxVotesPerUser,
        maxProposalsPerUser: input.maxProposalsPerUser ?? null,
        recurrenceFrequency: input.recurrenceFrequency ?? null,
      });
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
      return mapped;
    },
    [ensureRegistered, upsertSession],
  );

  const updateSession = useCallback(
    async (
      sessionId: string,
      input: UpdateSessionInput,
    ): Promise<GameSession> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const snapshotBefore = sessionsRef.current.find(
        (s) => s.id === sessionId,
      );
      const { sessionPatch } = await sessionsApi.update(sessionId, input);
      if (authEpochRef.current !== epoch) {
        if (snapshotBefore) {
          return applySessionMetadataPatch(snapshotBefore, sessionPatch);
        }
        throw new ApiError(
          401,
          "SESSION_CHANGED",
          "La sesión de usuario cambió.",
        );
      }
      const existing =
        sessionsRef.current.find((s) => s.id === sessionId) ?? snapshotBefore;
      if (existing) {
        const patched = applySessionMetadataPatch(existing, sessionPatch);
        upsertSession(patched);
        return patched;
      }
      const { session } = await sessionsApi.getDetail(sessionId);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
      return mapped;
    },
    [ensureRegistered, upsertSession],
  );

  const cancelSession = useCallback(
    async (sessionId: string): Promise<GameSession> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const snapshotBefore = sessionsRef.current.find(
        (s) => s.id === sessionId,
      );
      const { sessionPatch } = await sessionsApi.updateStatus(
        sessionId,
        "cancelled",
      );
      if (authEpochRef.current !== epoch) {
        if (snapshotBefore) {
          return applySessionStatusPatch(snapshotBefore, sessionPatch);
        }
        throw new ApiError(
          401,
          "SESSION_CHANGED",
          "La sesión de usuario cambió.",
        );
      }
      const existing =
        sessionsRef.current.find((s) => s.id === sessionId) ?? snapshotBefore;
      if (existing) {
        const patched = applySessionStatusPatch(existing, sessionPatch);
        upsertSession(patched);
        return patched;
      }
      const { session } = await sessionsApi.getDetail(sessionId);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
      return mapped;
    },
    [ensureRegistered, upsertSession],
  );

  const reopenSession = useCallback(
    async (sessionId: string): Promise<GameSession> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const snapshotBefore = sessionsRef.current.find(
        (s) => s.id === sessionId,
      );
      const { sessionPatch } = await sessionsApi.updateStatus(
        sessionId,
        "voting",
      );
      if (authEpochRef.current !== epoch) {
        if (snapshotBefore) {
          return applySessionStatusPatch(snapshotBefore, sessionPatch);
        }
        throw new ApiError(
          401,
          "SESSION_CHANGED",
          "La sesión de usuario cambió.",
        );
      }
      const existing =
        sessionsRef.current.find((s) => s.id === sessionId) ?? snapshotBefore;
      if (existing) {
        const patched = applySessionStatusPatch(existing, sessionPatch);
        upsertSession(patched);
        return patched;
      }
      const { session } = await sessionsApi.getDetail(sessionId);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
      return mapped;
    },
    [ensureRegistered, upsertSession],
  );

  const deleteSession = useCallback(
    async (sessionId: string): Promise<void> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      await sessionsApi.remove(sessionId);
      if (authEpochRef.current !== epoch) return;
      commitSessions((prev) => prev.filter((s) => s.id !== sessionId));
    },
    [ensureRegistered, commitSessions],
  );

  const joinSessionByToken = useCallback(
    async (
      inviteToken: string,
      rsvp: RsvpStatus = "going",
    ): Promise<GameSession> => {
      ensureSessionAccess();
      const epoch = authEpochRef.current;
      const { session } = await sessionsApi.joinByToken(inviteToken, rsvp);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
      return mapped;
    },
    [ensureSessionAccess, upsertSession],
  );

  const joinSeriesByShareToken = useCallback(
    async (
      shareToken: string,
      rsvp: RsvpStatus = "going",
    ): Promise<GameSession> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const { session } = await sessionsApi.joinSeries(shareToken, rsvp);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
      return mapped;
    },
    [ensureRegistered, upsertSession],
  );

  const advanceSeries = useCallback(
    async (seriesId: string): Promise<GameSession> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const { session } = await sessionsApi.advanceSeries(seriesId);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current !== epoch) return mapped;
      commitSessions((prev) => {
        const archived = prev.map((s) =>
          s.series?.id === seriesId &&
          s.id !== mapped.id &&
          (s.status === "planning" ||
            s.status === "voting" ||
            s.status === "locked")
            ? { ...s, status: "completed" as const }
            : s,
        );
        const exists = archived.some((s) => s.id === mapped.id);
        return exists
          ? archived.map((s) => (s.id === mapped.id ? mapped : s))
          : [mapped, ...archived];
      });
      return mapped;
    },
    [ensureRegistered, commitSessions],
  );

  const updateSeries = useCallback(
    async (
      seriesId: string,
      payload: { frequency?: RecurrenceFrequency; isActive?: boolean },
    ): Promise<{
      series: SessionSeriesSummary;
      activeSessionId: string | null;
    }> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const result = await sessionsApi.updateSeries(seriesId, payload);
      if (authEpochRef.current !== epoch) return result;
      commitSessions((prev) =>
        prev.map((s) => {
          if (s.series?.id !== seriesId) return s;
          const isStaleActive =
            result.activeSessionId !== null &&
            s.id !== result.activeSessionId &&
            (s.status === "planning" ||
              s.status === "voting" ||
              s.status === "locked");
          return {
            ...s,
            series: result.series,
            ...(isStaleActive ? { status: "completed" as const } : {}),
          };
        }),
      );
      return result;
    },
    [ensureRegistered, commitSessions],
  );

  const loadSessionDetail = useCallback(
    async (sessionId: string): Promise<GameSession> => {
      ensureSessionAccess();
      const epoch = authEpochRef.current;
      const { session } = await sessionsApi.getDetail(sessionId);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
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
      currentSession?: GameSession,
      onOptimistic?: (optimisticSession: GameSession) => void,
    ): Promise<GameSession> => {
      ensureSessionAccess();
      const epoch = authEpochRef.current;
      const targetSession =
        currentSession ?? sessionsRef.current.find((s) => s.id === sessionId);

      if (targetSession) {
        const optimistic = applyOptimisticRsvp(
          targetSession,
          currentUser,
          rsvp,
        );
        upsertSession(optimistic);
        onOptimistic?.(optimistic);
      }

      try {
        const { rsvpDelta } = await sessionsApi.updateRsvp(sessionId, rsvp);
        if (authEpochRef.current !== epoch) {
          if (targetSession) {
            return applyRsvpDelta(targetSession, rsvpDelta);
          }
          throw new ApiError(
            401,
            "SESSION_CHANGED",
            "La sesión de usuario cambió.",
          );
        }
        const latestBase =
          sessionsRef.current.find((s) => s.id === sessionId) ?? targetSession;
        if (latestBase) {
          const merged = applyRsvpDelta(latestBase, rsvpDelta);
          upsertSession(merged);
          return merged;
        }
        const { session } = await sessionsApi.getDetail(sessionId);
        const mapped = mapSessionDetail(session);
        if (authEpochRef.current === epoch) {
          upsertSession(mapped);
        }
        return mapped;
      } catch (err) {
        if (authEpochRef.current === epoch && targetSession) {
          upsertSession(targetSession);
        }
        throw err;
      }
    },
    [ensureSessionAccess, currentUser, upsertSession],
  );

  const proposeGame = useCallback(
    async (
      sessionId: string,
      game: Game,
      note?: string,
    ): Promise<GameSession> => {
      ensureSessionAccess();
      const epoch = authEpochRef.current;
      const snapshotBefore = sessionsRef.current.find(
        (s) => s.id === sessionId,
      );
      const delta = await sessionsApi.propose(sessionId, game.id, note);
      if (authEpochRef.current !== epoch) {
        if (snapshotBefore) {
          return applyProposalCreatedDelta(snapshotBefore, delta);
        }
        throw new ApiError(
          401,
          "SESSION_CHANGED",
          "La sesión de usuario cambió.",
        );
      }
      const existing =
        sessionsRef.current.find((s) => s.id === sessionId) ?? snapshotBefore;
      if (existing) {
        const merged = applyProposalCreatedDelta(existing, delta);
        upsertSession(merged);
        return merged;
      }
      const { session } = await sessionsApi.getDetail(sessionId);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
      return mapped;
    },
    [ensureSessionAccess, upsertSession],
  );

  const removeProposal = useCallback(
    async (
      sessionId: string,
      proposalId: string,
    ): Promise<{ session: GameSession; refundedVotesCount: number }> => {
      ensureSessionAccess();
      const epoch = authEpochRef.current;
      const snapshotBefore = sessionsRef.current.find(
        (s) => s.id === sessionId,
      );
      const delta = await sessionsApi.removeProposal(sessionId, proposalId);
      if (authEpochRef.current !== epoch) {
        if (snapshotBefore) {
          return {
            session: applyProposalDeletedDelta(snapshotBefore, delta),
            refundedVotesCount: delta.refundedVotesCount ?? 0,
          };
        }
        throw new ApiError(
          401,
          "SESSION_CHANGED",
          "La sesión de usuario cambió.",
        );
      }
      const existing =
        sessionsRef.current.find((s) => s.id === sessionId) ?? snapshotBefore;
      if (existing) {
        const merged = applyProposalDeletedDelta(existing, delta);
        upsertSession(merged);
        return {
          session: merged,
          refundedVotesCount: delta.refundedVotesCount ?? 0,
        };
      }
      const { session } = await sessionsApi.getDetail(sessionId);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
      return {
        session: mapped,
        refundedVotesCount: delta.refundedVotesCount ?? 0,
      };
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
      const epoch = authEpochRef.current;
      const snapshotBefore = sessionsRef.current.find(
        (s) => s.id === sessionId,
      );
      const delta = await sessionsApi.updateProposalStatus(
        sessionId,
        proposalId,
        status,
      );
      if (authEpochRef.current !== epoch) {
        if (snapshotBefore) {
          return applyProposalStatusDelta(snapshotBefore, delta);
        }
        throw new ApiError(
          401,
          "SESSION_CHANGED",
          "La sesión de usuario cambió.",
        );
      }
      const existing =
        sessionsRef.current.find((s) => s.id === sessionId) ?? snapshotBefore;
      if (existing) {
        const merged = applyProposalStatusDelta(existing, delta);
        upsertSession(merged);
        return merged;
      }
      const { session } = await sessionsApi.getDetail(sessionId);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
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
      const epoch = authEpochRef.current;
      const targetSession =
        currentSession ?? sessionsRef.current.find((s) => s.id === sessionId);
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

        if (authEpochRef.current !== epoch) {
          if (targetSession) {
            return applyVotesSnapshot(targetSession, votes);
          }
          throw new ApiError(
            401,
            "SESSION_CHANGED",
            "La sesión de usuario cambió.",
          );
        }

        const latestBase =
          sessionsRef.current.find((s) => s.id === sessionId) ?? targetSession;
        if (latestBase) {
          const merged = applyVotesSnapshot(latestBase, votes);
          upsertSession(merged);
          return merged;
        }

        const { session: detail } = await sessionsApi.getDetail(sessionId);
        const mapped = mapSessionDetail(detail);
        if (authEpochRef.current === epoch) {
          upsertSession(mapped);
        }
        return mapped;
      } catch (err) {
        if (authEpochRef.current === epoch && targetSession) {
          upsertSession(targetSession);
        }
        throw err;
      }
    },
    [ensureSessionAccess, upsertSession],
  );

  const toggleSessionLock = useCallback(
    async (sessionId: string): Promise<GameSession> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const current = sessionsRef.current.find((s) => s.id === sessionId);
      const nextStatus = current?.status === "locked" ? "voting" : "locked";

      const { sessionPatch } = await sessionsApi.updateStatus(
        sessionId,
        nextStatus,
      );
      if (authEpochRef.current !== epoch) {
        if (current) {
          return applySessionStatusPatch(current, sessionPatch);
        }
        throw new ApiError(
          401,
          "SESSION_CHANGED",
          "La sesión de usuario cambió.",
        );
      }
      const existing =
        sessionsRef.current.find((s) => s.id === sessionId) ?? current;
      if (existing) {
        const patched = applySessionStatusPatch(existing, sessionPatch);
        upsertSession(patched);
        return patched;
      }
      const { session } = await sessionsApi.getDetail(sessionId);
      const mapped = mapSessionDetail(session);
      if (authEpochRef.current === epoch) {
        upsertSession(mapped);
      }
      return mapped;
    },
    [ensureRegistered, upsertSession],
  );

  // =========================================================================
  // Play log actions
  // =========================================================================

  const addPlayLog = useCallback(
    async (input: CreatePlayLogInput): Promise<PlayLog> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
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
      if (authEpochRef.current !== epoch) return mapped;
      setPlayLogs((prev) => [mapped, ...prev]);

      if (resolvedGroupId) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === resolvedGroupId
              ? { ...g, playLogsCount: g.playLogsCount + 1 }
              : g,
          ),
        );
        statsCacheByGroupRef.current.delete(resolvedGroupId);
        if (activeGroupIdRef.current === resolvedGroupId) {
          void ensureGroupStatsLoaded(resolvedGroupId, true);
        }
      }
      return mapped;
    },
    [ensureRegistered, activeGroup, ensureGroupStatsLoaded],
  );

  const deletePlayLog = useCallback(
    async (playLogId: string): Promise<void> => {
      ensureRegistered();
      const epoch = authEpochRef.current;
      const targetLog = playLogs.find((l) => l.id === playLogId);
      await playLogsApi.remove(playLogId);
      if (authEpochRef.current !== epoch) return;
      setPlayLogs((prev) => prev.filter((l) => l.id !== playLogId));

      const gid = targetLog ? targetLog.groupId : (activeGroup?.id ?? null);
      if (gid) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === gid
              ? { ...g, playLogsCount: Math.max(0, g.playLogsCount - 1) }
              : g,
          ),
        );
        statsCacheByGroupRef.current.delete(gid);
        if (activeGroupIdRef.current === gid) {
          void ensureGroupStatsLoaded(gid, true);
        }
      }
    },
    [ensureRegistered, playLogs, activeGroup, ensureGroupStatsLoaded],
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
        isLibraryLoaded,
        isLibraryLoading,
        libraryError,
        isPlayLogsLoaded,
        isPlayLogsLoading,
        playLogsError,
        isGroupStatsLoading,
        groupStatsError,
        users,
        groups,
        activeGroupId: activeGroup?.id ?? null,
        activeGroup,
        activeGroupStats,
        setActiveGroupId,
        allGames,
        library,
        libraryCount,
        sessions,
        playLogs,
        lastBggSyncLabel,
        refreshAll,
        ensureLibraryLoaded,
        ensurePlayLogsLoaded,
        ensureGroupStatsLoaded,
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
        updateSession,
        cancelSession,
        reopenSession,
        deleteSession,
        joinSessionByToken,
        joinSeriesByShareToken,
        advanceSeries,
        updateSeries,
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
