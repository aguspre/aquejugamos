import type {
  GroupRole,
  ProposalStatus,
  RecurrenceFrequency,
  RsvpStatus,
  SessionStatus,
  UserGameStatus,
  VotingMode,
} from '../types/domain';
import { apiRequest } from './client';
import type {
  ApiDeleteProposalDelta,
  ApiGroup,
  ApiGroupStats,
  ApiLibraryItem,
  ApiPlayLog,
  ApiPoolGame,
  ApiProposalStatusDelta,
  ApiProposeGameDelta,
  ApiSessionDetail,
  ApiSessionListItem,
  ApiSessionMetadataPatch,
  ApiSessionRsvpDelta,
  ApiSessionSeriesSummary,
  ApiSessionVotesSnapshot,
  ApiUserSummary,
} from './mappers';

export interface AuthUserResponse extends ApiUserSummary {
  email: string;
  firebaseUid?: string | null;
  lastBggSyncAt: string | null;
  createdAt: string;
  isAdmin?: boolean;
}

export interface BootstrapResponse {
  user: AuthUserResponse;
  isGuest: boolean;
  guestScope: GuestScope | null;
  groups: ApiGroup[];
  sessions: ApiSessionListItem[];
  libraryCount: number;
}

export interface BackendRouteMetric {
  key: string;
  method: string;
  route: string;
  count: number;
  error4xxCount: number;
  error5xxCount: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  avgDbQueries: number;
  avgDbMs: number;
  avgPayloadBytes: number;
  totalPayloadBytes: number;
  totalWireBytes: number;
}

export interface BackendStatusMetricsResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptimeSeconds: number;
  startedAt: string;
  windowMinutes: number;
  health: {
    db: {
      ok: boolean;
      pingMs: number;
      pooled: boolean;
      hasDirectUrlConfigured: boolean;
      dbRegionHint: string | null;
      serverRegionHint: string | null;
      regionMismatchWarning: string | null;
      coldStartSuspected: boolean;
    };
    firebaseAdmin: boolean;
    corsMaxAgeSeconds: number;
    compressionEnabled: boolean;
  };
  summary: {
    totalRequests: number;
    error4xxCount: number;
    error5xxCount: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
    totalPayloadBytes: number;
    totalWireBytes: number;
    compressionSavedBytes: number;
  };
  process: {
    nodeVersion: string;
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    eventLoopLagMs: {
      mean: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
    } | null;
  };
  routes: BackendRouteMetric[];
  recentNotableRequests: {
    requestId: string;
    timestamp: string;
    method: string;
    route: string;
    statusCode: number;
    totalMs: number;
    authMs: number;
    dbMs: number;
    dbQueryCount: number;
    slowQueries: { target: string; durationMs: number }[];
    payloadBytes: number;
    wireBytes: number;
    encoding: 'br' | 'gzip' | 'identity';
    errorCode?: string;
  }[];
}

export interface InvitePreviewGroup {
  kind: 'group';
  groupId: string;
  groupName: string;
  inviteCode: string;
  membersCount?: number;
  activeSession: {
    id: string;
    title: string;
    scheduledAt: string;
    status: SessionStatus;
  } | null;
}

export interface InvitePreviewSession {
  kind: 'session';
  sessionId: string;
  sessionTitle: string;
  groupName: string;
  scheduledAt: string;
  location?: string | null;
  status: SessionStatus;
  hostName?: string;
  confirmedCount?: number;
  proposalsCount?: number;
  isRecurring?: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  seriesShareToken?: string;
}

export type InvitePreview = InvitePreviewGroup | InvitePreviewSession;

export interface GuestScope {
  kind: 'group' | 'session';
  groupId?: string | null;
  sessionId?: string | null;
  groupName: string | null;
  targetSessionId?: string | null;
}

export interface BggSyncQuota {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  nextResetAt: string | null;
  cooldownUntil: string | null;
  inProgress: boolean;
}

export interface BggSyncResponse {
  sync: {
    bggUsername: string;
    totalInBgg: number;
    metadataRefreshed: number;
    addedToLibrary: number;
    updatedInLibrary: number;
    syncedAt: string;
    quota?: BggSyncQuota;
  };
}

export interface BggSearchResult {
  bggId: number;
  name: string;
  yearPublished: number | null;
  isExpansion: boolean;
  thumbnailUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTimeMinutes: number | null;
  inLibraryStatus: UserGameStatus | null;
}

export const authApi = {
  invitePreview: (query: {
    groupCode?: string;
    sessionToken?: string;
    seriesToken?: string;
  }) =>
    apiRequest<{ preview: InvitePreview }>('/api/auth/invite-preview', {
      query,
    }),

  guestJoin: (payload: {
    displayName: string;
    groupInviteCode?: string;
    sessionInviteToken?: string;
    seriesShareToken?: string;
  }) =>
    apiRequest<{
      token: string;
      user: AuthUserResponse;
      isGuest: true;
      guestScope: GuestScope;
    }>('/api/auth/guest-join', {
      method: 'POST',
      body: payload,
    }),

  register: (payload: {
    email: string;
    password: string;
    displayName: string;
    bggUsername?: string;
  }) =>
    apiRequest<{ token: string; user: AuthUserResponse }>('/api/auth/register', {
      method: 'POST',
      body: payload,
    }),

  login: (payload: { email: string; password: string }) =>
    apiRequest<{ token: string; user: AuthUserResponse }>('/api/auth/login', {
      method: 'POST',
      body: payload,
    }),

  me: () =>
    apiRequest<{
      user: AuthUserResponse;
      isGuest?: boolean;
      guestScope?: GuestScope | null;
    }>('/api/auth/me'),

  sync: (
    payload?: {
      displayName?: string;
      avatarUrl?: string | null;
      bggUsername?: string | null;
    },
    authToken?: string,
  ) =>
    apiRequest<{ user: AuthUserResponse }>('/api/auth/sync', {
      method: 'POST',
      body: payload ?? {},
      authToken,
    }),

  bootstrap: (
    payload?: {
      displayName?: string;
      avatarUrl?: string | null;
      bggUsername?: string | null;
    },
    authToken?: string,
  ) =>
    apiRequest<BootstrapResponse>('/api/auth/bootstrap', {
      method: 'POST',
      body: payload ?? {},
      authToken,
    }),

  updateMe: (payload: {
    displayName?: string;
    avatarUrl?: string | null;
    bggUsername?: string | null;
  }) =>
    apiRequest<{ user: AuthUserResponse }>('/api/auth/me', {
      method: 'PATCH',
      body: payload,
    }),
};

export const bggApi = {
  getQuota: () => apiRequest<{ quota: BggSyncQuota }>('/api/bgg/quota'),

  sync: (payload: { bggUsername?: string; forceRefresh?: boolean }) =>
    apiRequest<BggSyncResponse>('/api/bgg/sync', {
      method: 'POST',
      body: payload,
      timeoutMs: 60_000,
    }),

  search: (query: string, exact = false) =>
    apiRequest<{ results: BggSearchResult[] }>('/api/bgg/search', {
      query: { query, exact: exact ? '1' : undefined },
    }),

  importGame: (
    bggId: number,
    payload: {
      status?: UserGameStatus;
      personalRating?: number | null;
      notes?: string | null;
    } = {},
  ) =>
    apiRequest<{ item: ApiLibraryItem }>(`/api/bgg/import/${bggId}`, {
      method: 'POST',
      body: payload,
    }),
};

export const libraryApi = {
  list: () =>
    apiRequest<{ items: ApiLibraryItem[]; total: number }>('/api/library', {
      query: { includeExpansions: 'true' },
    }),

  updateItem: (
    gameId: string,
    payload: {
      status?: UserGameStatus;
      personalRating?: number | null;
      notes?: string | null;
    },
  ) =>
    apiRequest<{ item: { gameId: string; status: UserGameStatus; notes: string | null } }>(
      `/api/library/${gameId}`,
      {
        method: 'PATCH',
        body: payload,
      },
    ),

  removeItem: (gameId: string) =>
    apiRequest<void>(`/api/library/${gameId}`, { method: 'DELETE' }),
};

export const groupsApi = {
  list: () => apiRequest<{ groups: ApiGroup[] }>('/api/groups'),

  create: (name: string) =>
    apiRequest<{ group: ApiGroup }>('/api/groups', {
      method: 'POST',
      body: { name },
    }),

  join: (inviteCode: string) =>
    apiRequest<{ group: ApiGroup; alreadyMember: boolean }>('/api/groups/join', {
      method: 'POST',
      body: { inviteCode },
    }),

  regenerateCode: (groupId: string) =>
    apiRequest<{ inviteCode: string }>(`/api/groups/${groupId}/regenerate-code`, {
      method: 'POST',
    }),

  updateMemberRole: (groupId: string, userId: string, role: GroupRole) =>
    apiRequest<{ group: ApiGroup }>(`/api/groups/${groupId}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
    }),

  removeMember: (groupId: string, userId: string) =>
    apiRequest<{ groupDeleted: boolean; group?: ApiGroup }>(
      `/api/groups/${groupId}/members/${userId}`,
      {
        method: 'DELETE',
      },
    ),
};

export const statusApi = {
  getHealth: () =>
    apiRequest<{
      status: 'ok' | 'degraded' | 'down';
      timestamp: string;
    }>('/api/health'),

  getMetrics: (fresh = false) =>
    apiRequest<BackendStatusMetricsResponse>('/api/status/metrics', {
      query: fresh ? { fresh: '1' } : undefined,
    }),
};

export const sessionsApi = {
  list: (query?: { groupId?: string; status?: SessionStatus }) =>
    apiRequest<{ sessions: ApiSessionListItem[] }>('/api/sessions', { query }),

  getDetail: (sessionId: string) =>
    apiRequest<{ session: ApiSessionDetail }>(`/api/sessions/${sessionId}`),

  create: (payload: {
    groupId?: string | null;
    title: string;
    scheduledAt: string;
    location?: string | null;
    votingMode: VotingMode;
    maxVotesPerUser: number;
    maxProposalsPerUser?: number | null;
    recurrenceFrequency?: RecurrenceFrequency | null;
  }) =>
    apiRequest<{ session: ApiSessionDetail }>('/api/sessions', {
      method: 'POST',
      body: payload,
    }),

  update: (
    sessionId: string,
    payload: {
      title?: string;
      scheduledAt?: string;
      location?: string | null;
      maxProposalsPerUser?: number | null;
    },
  ) =>
    apiRequest<{ sessionPatch: ApiSessionMetadataPatch }>(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      body: payload,
    }),

  remove: (sessionId: string) =>
    apiRequest<void>(`/api/sessions/${sessionId}`, {
      method: 'DELETE',
    }),

  joinByToken: (inviteToken: string, rsvp: RsvpStatus = 'going') =>
    apiRequest<{ session: ApiSessionDetail }>('/api/sessions/join', {
      method: 'POST',
      body: { inviteToken, rsvp },
    }),

  joinSeries: (shareToken: string, rsvp: RsvpStatus = 'going') =>
    apiRequest<{ session: ApiSessionDetail }>('/api/sessions/series/join', {
      method: 'POST',
      body: { shareToken, rsvp },
    }),

  advanceSeries: (seriesId: string) =>
    apiRequest<{ session: ApiSessionDetail }>(
      `/api/sessions/series/${seriesId}/advance`,
      {
        method: 'POST',
      },
    ),

  updateSeries: (
    seriesId: string,
    payload: { frequency?: RecurrenceFrequency; isActive?: boolean },
  ) =>
    apiRequest<{
      series: ApiSessionSeriesSummary;
      activeSessionId: string | null;
    }>(`/api/sessions/series/${seriesId}`, {
      method: 'PATCH',
      body: payload,
    }),

  updateRsvp: (sessionId: string, rsvp: RsvpStatus) =>
    apiRequest<{ rsvpDelta: ApiSessionRsvpDelta }>(`/api/sessions/${sessionId}/rsvp`, {
      method: 'PATCH',
      body: { rsvp },
    }),

  updateStatus: (sessionId: string, status: SessionStatus) =>
    apiRequest<{ sessionPatch: { id: string; status: SessionStatus } }>(
      `/api/sessions/${sessionId}/status`,
      {
        method: 'PATCH',
        body: { status },
      },
    ),

  getPool: (
    sessionId: string,
    query: { onlyCompatible?: boolean; includeExpansions?: boolean } = {},
  ) =>
    apiRequest<{
      confirmedCount: number;
      onlyCompatible: boolean;
      includeExpansions: boolean;
      total: number;
      items: ApiPoolGame[];
    }>(`/api/sessions/${sessionId}/pool`, {
      query: {
        onlyCompatible:
          query.onlyCompatible !== undefined ? String(query.onlyCompatible) : undefined,
        includeExpansions:
          query.includeExpansions !== undefined
            ? String(query.includeExpansions)
            : undefined,
      },
    }),

  propose: (sessionId: string, gameId: string, note?: string) =>
    apiRequest<ApiProposeGameDelta>(`/api/sessions/${sessionId}/proposals`, {
      method: 'POST',
      body: { gameId, note: note?.trim() || null },
    }),

  updateProposalStatus: (
    sessionId: string,
    proposalId: string,
    status: ProposalStatus,
  ) =>
    apiRequest<ApiProposalStatusDelta>(
      `/api/sessions/${sessionId}/proposals/${proposalId}/status`,
      {
        method: 'PATCH',
        body: { status },
      },
    ),

  removeProposal: (sessionId: string, proposalId: string) =>
    apiRequest<ApiDeleteProposalDelta>(
      `/api/sessions/${sessionId}/proposals/${proposalId}`,
      { method: 'DELETE' },
    ),

  castVote: (sessionId: string, proposalId: string, rank = 1) =>
    apiRequest<{ votes: ApiSessionVotesSnapshot }>(
      `/api/sessions/${sessionId}/proposals/${proposalId}/vote`,
      {
        method: 'POST',
        body: { rank },
      },
    ),

  removeVote: (sessionId: string, proposalId: string) =>
    apiRequest<{ votes: ApiSessionVotesSnapshot }>(
      `/api/sessions/${sessionId}/proposals/${proposalId}/vote`,
      { method: 'DELETE' },
    ),
};

export const playLogsApi = {
  list: (query?: { groupId?: string; sessionId?: string }) =>
    apiRequest<{ playLogs: ApiPlayLog[] }>('/api/play-logs', { query }),

  create: (payload: {
    sessionId?: string | null;
    groupId?: string | null;
    gameId: string;
    playedAt?: string;
    durationMinutes?: number | null;
    notes?: string | null;
    players: { userId: string; score?: number | null; isWinner?: boolean }[];
  }) =>
    apiRequest<{ playLog: ApiPlayLog }>('/api/play-logs', {
      method: 'POST',
      body: payload,
    }),

  remove: (playLogId: string) =>
    apiRequest<void>(`/api/play-logs/${playLogId}`, { method: 'DELETE' }),

  getGroupStats: (groupId: string) =>
    apiRequest<{ stats: ApiGroupStats }>(`/api/play-logs/stats/${groupId}`),
};
