import type {
  GroupRole,
  RsvpStatus,
  SessionStatus,
  UserGameStatus,
  VotingMode,
} from '../types/domain';
import { apiRequest } from './client';
import type {
  ApiGroup,
  ApiGroupStats,
  ApiLibraryItem,
  ApiPlayLog,
  ApiPoolGame,
  ApiSessionDetail,
  ApiSessionListItem,
  ApiUserSummary,
} from './mappers';

export interface AuthUserResponse extends ApiUserSummary {
  email: string;
  firebaseUid?: string | null;
  lastBggSyncAt: string | null;
  createdAt: string;
}

export interface BggSyncResponse {
  sync: {
    bggUsername: string;
    totalInBgg: number;
    metadataRefreshed: number;
    addedToLibrary: number;
    updatedInLibrary: number;
    syncedAt: string;
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

  me: () => apiRequest<{ user: AuthUserResponse }>('/api/auth/me'),

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
  sync: (payload: { bggUsername?: string; forceRefresh?: boolean }) =>
    apiRequest<BggSyncResponse>('/api/bgg/sync', {
      method: 'POST',
      body: payload,
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
    apiRequest<{ groupDeleted: boolean }>(`/api/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
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
  }) =>
    apiRequest<{ session: ApiSessionDetail }>('/api/sessions', {
      method: 'POST',
      body: payload,
    }),

  joinByToken: (inviteToken: string, rsvp: RsvpStatus = 'going') =>
    apiRequest<{ session: ApiSessionDetail }>('/api/sessions/join', {
      method: 'POST',
      body: { inviteToken, rsvp },
    }),

  updateRsvp: (sessionId: string, rsvp: RsvpStatus) =>
    apiRequest<{ session: ApiSessionDetail }>(`/api/sessions/${sessionId}/rsvp`, {
      method: 'PATCH',
      body: { rsvp },
    }),

  updateStatus: (sessionId: string, status: SessionStatus) =>
    apiRequest<{ session: ApiSessionDetail }>(`/api/sessions/${sessionId}/status`, {
      method: 'PATCH',
      body: { status },
    }),

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
    apiRequest<{ session: ApiSessionDetail }>(`/api/sessions/${sessionId}/proposals`, {
      method: 'POST',
      body: { gameId, note: note?.trim() || null },
    }),

  removeProposal: (sessionId: string, proposalId: string) =>
    apiRequest<{ session: ApiSessionDetail }>(
      `/api/sessions/${sessionId}/proposals/${proposalId}`,
      { method: 'DELETE' },
    ),

  castVote: (sessionId: string, proposalId: string, rank = 1) =>
    apiRequest<{ session: ApiSessionDetail }>(
      `/api/sessions/${sessionId}/proposals/${proposalId}/vote`,
      {
        method: 'POST',
        body: { rank },
      },
    ),

  removeVote: (sessionId: string, proposalId: string) =>
    apiRequest<{ session: ApiSessionDetail }>(
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
