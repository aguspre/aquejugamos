import { GroupRole, RecurrenceFrequency, RsvpStatus, SessionStatus, VotingMode } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeNextOccurrenceDate,
  isOccurrencePastRollover,
  SERIES_ROLLOVER_GRACE_MS,
} from '../sessions.recurrence.js';
import { createSessionSchema, updateSeriesSchema } from '../sessions.schemas.js';

const queryRawMock = vi.fn();
const groupMemberFindUniqueMock = vi.fn();
const groupMemberFindManyMock = vi.fn();
const sessionFindManyMock = vi.fn();
const sessionFindFirstMock = vi.fn();
const sessionFindUniqueMock = vi.fn();
const sessionUpdateManyMock = vi.fn();
const sessionCreateMock = vi.fn();
const sessionSeriesFindUniqueMock = vi.fn();
const sessionSeriesUpdateMock = vi.fn();
const participantUpsertMock = vi.fn();
const userGameFindManyMock = vi.fn();

const txMock = {
  $queryRaw: (...args: unknown[]) => queryRawMock(...args),
  groupMember: {
    findUnique: (...args: unknown[]) => groupMemberFindUniqueMock(...args),
    findMany: (...args: unknown[]) => groupMemberFindManyMock(...args),
  },
  session: {
    findMany: (...args: unknown[]) => sessionFindManyMock(...args),
    findFirst: (...args: unknown[]) => sessionFindFirstMock(...args),
    updateMany: (...args: unknown[]) => sessionUpdateManyMock(...args),
    create: (...args: unknown[]) => sessionCreateMock(...args),
  },
  sessionSeries: {
    update: (...args: unknown[]) => sessionSeriesUpdateMock(...args),
  },
};

vi.mock('../../../config/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof txMock) => Promise<unknown>)(txMock);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    session: {
      findUnique: (...args: unknown[]) => sessionFindUniqueMock(...args),
      findMany: (...args: unknown[]) => sessionFindManyMock(...args),
    },
    sessionSeries: {
      findUnique: (...args: unknown[]) => sessionSeriesFindUniqueMock(...args),
    },
    sessionParticipant: {
      upsert: (...args: unknown[]) => participantUpsertMock(...args),
    },
    groupMember: {
      findUnique: (...args: unknown[]) => groupMemberFindUniqueMock(...args),
    },
    userGame: {
      findMany: (...args: unknown[]) => userGameFindManyMock(...args),
    },
  },
}));

import {
  advanceSeriesToNextOccurrence,
  ensureActiveSeriesSession,
  updateSessionSeries,
} from '../sessions.service.js';

const SERIES_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const HOST_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const OLD_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const NEW_SESSION_ID = '66666666-6666-4666-8666-666666666666';

describe('Session recurrence helpers', () => {
  it('avanza semanalmente exactamente 7 días manteniendo la hora UTC', () => {
    const anchor = new Date('2026-11-26T21:00:00.000Z');
    const now = new Date('2026-11-27T10:00:00.000Z');
    const next = computeNextOccurrenceDate(anchor, 'weekly', now);
    expect(next.toISOString()).toBe('2026-12-03T21:00:00.000Z');
  });

  it('salta múltiples semanas si la serie estuvo inactiva varias fechas', () => {
    const anchor = new Date('2026-11-05T21:00:00.000Z');
    const now = new Date('2026-11-27T10:00:00.000Z');
    const next = computeNextOccurrenceDate(anchor, 'weekly', now);
    expect(next.toISOString()).toBe('2026-12-03T21:00:00.000Z');
  });

  it('avanza quincenalmente de a 14 días', () => {
    const anchor = new Date('2026-11-26T21:00:00.000Z');
    const now = new Date('2026-11-27T10:00:00.000Z');
    const next = computeNextOccurrenceDate(anchor, 'biweekly', now);
    expect(next.toISOString()).toBe('2026-12-10T21:00:00.000Z');
  });

  it('avanza mensualmente respetando fin de mes (31 ene -> 28 feb -> 31 mar)', () => {
    const anchor = new Date('2026-01-31T21:00:00.000Z');
    const feb = computeNextOccurrenceDate(anchor, 'monthly', new Date('2026-02-01T00:00:00.000Z'));
    expect(feb.toISOString()).toBe('2026-02-28T21:00:00.000Z');

    const mar = computeNextOccurrenceDate(anchor, 'monthly', new Date('2026-03-01T00:00:00.000Z'));
    expect(mar.toISOString()).toBe('2026-03-31T21:00:00.000Z');
  });

  it('permite avanzar manualmente antes de que pase la fecha actual (salta al próximo ciclo)', () => {
    const anchor = new Date('2026-11-26T21:00:00.000Z');
    const now = new Date('2026-11-24T15:00:00.000Z');
    const next = computeNextOccurrenceDate(anchor, 'weekly', now);
    expect(next.toISOString()).toBe('2026-12-03T21:00:00.000Z');
  });

  it('respeta la ventana de gracia de 6 horas antes de archivar automáticamente', () => {
    const scheduled = new Date('2026-11-26T21:00:00.000Z');
    const duringGameNight = new Date(scheduled.getTime() + SERIES_ROLLOVER_GRACE_MS - 60_000);
    const afterGrace = new Date(scheduled.getTime() + SERIES_ROLLOVER_GRACE_MS);

    expect(isOccurrencePastRollover(scheduled, duringGameNight)).toBe(false);
    expect(isOccurrencePastRollover(scheduled, afterGrace)).toBe(true);
  });

  it('valida que las juntadas recurrentes pertenezcan a un grupo en createSessionSchema', () => {
    const base = {
      title: 'Jueves de siluetas',
      scheduledAt: '2026-11-26T21:00:00.000Z',
    };
    expect(
      createSessionSchema.safeParse({
        ...base,
        groupId: null,
        recurrenceFrequency: 'weekly',
      }).success,
    ).toBe(false);
    expect(
      createSessionSchema.safeParse({
        ...base,
        groupId: GROUP_ID,
        recurrenceFrequency: 'weekly',
      }).success,
    ).toBe(true);
    expect(updateSeriesSchema.safeParse({}).success).toBe(false);
    expect(updateSeriesSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe('ensureActiveSeriesSession & series management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('archiva ocurrencias vencidas y crea automáticamente la próxima fecha cuando la serie está activa', async () => {
    const now = new Date('2026-11-27T12:00:00.000Z');
    const expiredDate = new Date('2026-11-26T21:00:00.000Z');

    queryRawMock.mockResolvedValueOnce([
      {
        id: SERIES_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        title: 'Jueves de siluetas',
        location: 'Depto',
        frequency: RecurrenceFrequency.weekly,
        voting_mode: VotingMode.multi_vote,
        max_votes_per_user: 3,
        max_proposals_per_user: 2,
        share_token: 'series-tok-1',
        is_active: true,
      },
    ]);
    sessionFindManyMock.mockResolvedValueOnce([
      { id: OLD_SESSION_ID, scheduledAt: expiredDate },
    ]);
    sessionUpdateManyMock.mockResolvedValueOnce({ count: 1 });
    sessionFindFirstMock.mockResolvedValueOnce({
      id: OLD_SESSION_ID,
      scheduledAt: expiredDate,
    });
    groupMemberFindManyMock.mockResolvedValueOnce([
      { userId: HOST_ID, role: GroupRole.admin },
      { userId: MEMBER_ID, role: GroupRole.member },
    ]);
    sessionCreateMock.mockResolvedValueOnce({ id: NEW_SESSION_ID });

    const res = await ensureActiveSeriesSession(SERIES_ID, now);

    expect(sessionUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: [OLD_SESSION_ID] },
        status: { in: [SessionStatus.planning, SessionStatus.voting, SessionStatus.locked] },
      },
      data: { status: SessionStatus.completed },
    });
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: GROUP_ID,
          seriesId: SERIES_ID,
          hostId: HOST_ID,
          scheduledAt: new Date('2026-12-03T21:00:00.000Z'),
          maxProposalsPerUser: 2,
        }),
      }),
    );
    expect(res).toMatchObject({
      activeSessionId: NEW_SESSION_ID,
      createdNew: true,
    });
  });

  it('no crea nueva ocurrencia si la serie está pausada (isActive = false)', async () => {
    const now = new Date('2026-11-27T12:00:00.000Z');
    const expiredDate = new Date('2026-11-26T21:00:00.000Z');

    queryRawMock.mockResolvedValueOnce([
      {
        id: SERIES_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        title: 'Jueves de siluetas',
        location: null,
        frequency: RecurrenceFrequency.weekly,
        voting_mode: VotingMode.multi_vote,
        max_votes_per_user: 3,
        max_proposals_per_user: null,
        share_token: 'series-tok-1',
        is_active: false,
      },
    ]);
    sessionFindManyMock.mockResolvedValueOnce([
      { id: OLD_SESSION_ID, scheduledAt: expiredDate },
    ]);
    sessionUpdateManyMock.mockResolvedValueOnce({ count: 1 });
    sessionFindFirstMock.mockResolvedValueOnce({
      id: OLD_SESSION_ID,
      scheduledAt: expiredDate,
    });

    const res = await ensureActiveSeriesSession(SERIES_ID, now);

    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(res).toMatchObject({
      activeSessionId: OLD_SESSION_ID,
      createdNew: false,
    });
  });

  it('bloquea con 403 a miembros comunes al intentar avanzar o pausar una serie', async () => {
    queryRawMock.mockResolvedValueOnce([
      {
        id: SERIES_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        title: 'Jueves',
        location: null,
        frequency: RecurrenceFrequency.weekly,
        voting_mode: VotingMode.multi_vote,
        max_votes_per_user: 3,
        max_proposals_per_user: null,
        share_token: 'series-tok-1',
        is_active: true,
      },
    ]);
    groupMemberFindUniqueMock.mockResolvedValueOnce({ role: GroupRole.member });

    await expect(
      advanceSeriesToNextOccurrence(MEMBER_ID, SERIES_ID),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'SESSION_HOST_REQUIRED',
    });

    vi.clearAllMocks();
    queryRawMock.mockResolvedValueOnce([
      { id: SERIES_ID, group_id: GROUP_ID, host_id: HOST_ID, is_active: true },
    ]);
    groupMemberFindUniqueMock.mockResolvedValueOnce({ role: GroupRole.member });

    await expect(
      updateSessionSeries(MEMBER_ID, SERIES_ID, { isActive: false }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'SESSION_HOST_REQUIRED',
    });
  });
});
