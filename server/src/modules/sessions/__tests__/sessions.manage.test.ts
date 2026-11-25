import { GroupRole, RsvpStatus, SessionStatus, VotingMode } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRawMock = vi.fn();
const groupMemberFindUniqueMock = vi.fn();
const sessionUpdateMock = vi.fn();
const sessionDeleteMock = vi.fn();
const sessionFindUniqueMock = vi.fn();
const sessionFindManyMock = vi.fn();
const sessionProposalCountMock = vi.fn();
const sessionSeriesFindManyMock = vi.fn();
const sessionSeriesUpdateMock = vi.fn();
const userGameFindManyMock = vi.fn();

const txMock = {
  $queryRaw: (...args: unknown[]) => queryRawMock(...args),
  groupMember: {
    findUnique: (...args: unknown[]) => groupMemberFindUniqueMock(...args),
  },
  session: {
    update: (...args: unknown[]) => sessionUpdateMock(...args),
    delete: (...args: unknown[]) => sessionDeleteMock(...args),
  },
  sessionProposal: {
    count: (...args: unknown[]) => sessionProposalCountMock(...args),
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
      findMany: (...args: unknown[]) => sessionSeriesFindManyMock(...args),
    },
    userGame: {
      findMany: (...args: unknown[]) => userGameFindManyMock(...args),
    },
  },
}));

import { updateSessionSchema } from '../sessions.schemas.js';
import {
  deleteSession,
  listUserSessions,
  updateSession,
  updateSessionStatus,
} from '../sessions.service.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const HOST_ID = '44444444-4444-4444-8444-444444444444';
const ADMIN_ID = '66666666-6666-4666-8666-666666666666';
const MEMBER_ID = '77777777-7777-4777-8777-777777777777';

function mockSessionDetail(overrides: { title?: string; location?: string | null; maxProposalsPerUser?: number | null } = {}) {
  sessionFindUniqueMock.mockResolvedValue({
    id: SESSION_ID,
    groupId: GROUP_ID,
    hostId: HOST_ID,
    title: overrides.title ?? 'Sábado de Euros',
    scheduledAt: new Date('2026-11-28T20:00:00Z'),
    location: overrides.location ?? 'Depto de Agus',
    status: SessionStatus.voting,
    votingMode: VotingMode.multi_vote,
    maxVotesPerUser: 3,
    maxProposalsPerUser: overrides.maxProposalsPerUser ?? 2,
    inviteToken: 'tok-edit',
    group: { id: GROUP_ID, name: 'Los Meeples', members: [{ role: GroupRole.admin }] },
    host: { id: HOST_ID, displayName: 'Host', avatarUrl: null, bggUsername: null },
    participants: [
      {
        userId: HOST_ID,
        rsvp: RsvpStatus.going,
        respondedAt: new Date('2026-11-24T12:00:00Z'),
        user: { id: HOST_ID, displayName: 'Host', avatarUrl: null, bggUsername: null },
      },
    ],
    proposals: [],
  });
  userGameFindManyMock.mockResolvedValue([]);
}

describe('updateSessionSchema', () => {
  it('rechaza payload vacío, fechas inválidas/coercionadas y valida campos opcionales', () => {
    expect(updateSessionSchema.safeParse({}).success).toBe(false);
    expect(updateSessionSchema.safeParse({ title: 'A' }).success).toBe(false);
    expect(updateSessionSchema.safeParse({ maxProposalsPerUser: 0 }).success).toBe(false);
    expect(updateSessionSchema.safeParse({ maxProposalsPerUser: 21 }).success).toBe(false);
    expect(updateSessionSchema.safeParse({ scheduledAt: null }).success).toBe(false);
    expect(updateSessionSchema.safeParse({ scheduledAt: false }).success).toBe(false);
    expect(updateSessionSchema.safeParse({ scheduledAt: 0 }).success).toBe(false);
    expect(updateSessionSchema.safeParse({ scheduledAt: 'invalid-date' }).success).toBe(false);

    expect(
      updateSessionSchema.safeParse({ scheduledAt: '2026-11-29T20:00:00.000Z' }).success,
    ).toBe(true);

    const parsed = updateSessionSchema.parse({
      title: '  Nuevo título  ',
      location: '   ',
      maxProposalsPerUser: null,
    });
    expect(parsed).toEqual({
      title: 'Nuevo título',
      location: null,
      maxProposalsPerUser: null,
    });
  });
});

describe('updateSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permite al anfitrión editar día, lugar y título de una juntada abierta', async () => {
    const newDate = new Date('2026-11-29T19:00:00Z');
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        series_id: null,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: null,
      },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    sessionUpdateMock.mockResolvedValue({
      id: SESSION_ID,
      title: 'Domingo de Euros',
      scheduledAt: newDate,
      location: 'Casa de Lucas',
      status: SessionStatus.voting,
      maxProposalsPerUser: 3,
    });
    sessionProposalCountMock.mockResolvedValue(1);

    const patch = await updateSession(HOST_ID, SESSION_ID, {
      title: 'Domingo de Euros',
      scheduledAt: newDate,
      location: 'Casa de Lucas',
      maxProposalsPerUser: 3,
    });

    expect(sessionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_ID },
        data: {
          title: 'Domingo de Euros',
          scheduledAt: newDate,
          location: 'Casa de Lucas',
          maxProposalsPerUser: 3,
        },
      }),
    );
    expect(sessionFindUniqueMock).not.toHaveBeenCalled();
    expect(patch.title).toBe('Domingo de Euros');
    expect(patch.location).toBe('Casa de Lucas');
    expect(patch.userProposalsCount).toBe(1);
    expect(patch.proposalsRemaining).toBe(2);
  });

  it('permite a un administrador del grupo editar la juntada', async () => {
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        series_id: null,
        host_id: HOST_ID,
        status: SessionStatus.locked,
        max_proposals_per_user: null,
      },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.admin });
    sessionUpdateMock.mockResolvedValue({
      id: SESSION_ID,
      title: 'Sábado',
      scheduledAt: new Date('2026-11-28T20:00:00Z'),
      location: 'Club',
      status: SessionStatus.locked,
      maxProposalsPerUser: null,
    });

    await updateSession(ADMIN_ID, SESSION_ID, { location: 'Club' });
    expect(sessionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_ID },
        data: { location: 'Club' },
      }),
    );
  });

  it('rechaza con 403 SESSION_HOST_REQUIRED a miembros comunes', async () => {
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });

    await expect(
      updateSession(MEMBER_ID, SESSION_ID, { title: 'Intento ajeno' }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'SESSION_HOST_REQUIRED',
    });
    expect(sessionUpdateMock).not.toHaveBeenCalled();
  });

  it('rechaza con 400 SESSION_CLOSED si la juntada está cancelada o finalizada', async () => {
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.cancelled },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.admin });

    await expect(
      updateSession(HOST_ID, SESSION_ID, { location: 'Otro lugar' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'SESSION_CLOSED',
    });
    expect(sessionUpdateMock).not.toHaveBeenCalled();
  });

  it('devuelve 404 SESSION_NOT_FOUND si la juntada no existe', async () => {
    queryRawMock.mockResolvedValueOnce([]);
    await expect(
      updateSession(HOST_ID, SESSION_ID, { title: 'No existe' }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'SESSION_NOT_FOUND',
    });
  });
});

describe('deleteSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permite al anfitrión eliminar definitivamente la juntada', async () => {
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    sessionDeleteMock.mockResolvedValue({ id: SESSION_ID });

    await deleteSession(HOST_ID, SESSION_ID);
    expect(sessionDeleteMock).toHaveBeenCalledWith({ where: { id: SESSION_ID } });
  });

  it('permite a un administrador del grupo eliminar una juntada incluso cancelada', async () => {
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.cancelled },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.admin });
    sessionDeleteMock.mockResolvedValue({ id: SESSION_ID });

    await deleteSession(ADMIN_ID, SESSION_ID);
    expect(sessionDeleteMock).toHaveBeenCalledWith({ where: { id: SESSION_ID } });
  });

  it('rechaza con 403 SESSION_HOST_REQUIRED si un miembro común intenta eliminarla', async () => {
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });

    await expect(deleteSession(MEMBER_ID, SESSION_ID)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SESSION_HOST_REQUIRED',
    });
    expect(sessionDeleteMock).not.toHaveBeenCalled();
  });

  it('devuelve 404 SESSION_NOT_FOUND si ya fue eliminada o no existe', async () => {
    queryRawMock.mockResolvedValueOnce([]);
    await expect(deleteSession(HOST_ID, SESSION_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'SESSION_NOT_FOUND',
    });
    expect(sessionDeleteMock).not.toHaveBeenCalled();
  });

  it('bloquea con 403 a un ex-miembro expulsado del grupo aunque figure como host_id', async () => {
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue(null);

    await expect(deleteSession(HOST_ID, SESSION_ID)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SESSION_HOST_REQUIRED',
    });
    expect(sessionDeleteMock).not.toHaveBeenCalled();
  });

  it('permite al anfitrión editar y eliminar una juntada directa (group_id = null) sin consultar groupMember', async () => {
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: null, host_id: HOST_ID, status: SessionStatus.voting },
    ]);
    sessionDeleteMock.mockResolvedValue({ id: SESSION_ID });

    await deleteSession(HOST_ID, SESSION_ID);
    expect(groupMemberFindUniqueMock).not.toHaveBeenCalled();
    expect(sessionDeleteMock).toHaveBeenCalledWith({ where: { id: SESSION_ID } });
  });
});

describe('updateSessionStatus (FOR UPDATE y máquina de estados)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bloquea transiciones desde completed con 400 SESSION_CLOSED', async () => {
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.completed },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.admin });

    await expect(
      updateSessionStatus(HOST_ID, SESSION_ID, SessionStatus.voting),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'SESSION_CLOSED',
    });
    expect(sessionUpdateMock).not.toHaveBeenCalled();
  });

  it('permite reabrir una juntada cancelada a voting pero bloquea pasarla directo a completed', async () => {
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.cancelled },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    sessionUpdateMock.mockResolvedValue({ id: SESSION_ID });
    mockSessionDetail();

    await updateSessionStatus(HOST_ID, SESSION_ID, SessionStatus.voting);
    expect(sessionUpdateMock).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { status: SessionStatus.voting },
    });

    vi.clearAllMocks();
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.cancelled },
    ]);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });

    await expect(
      updateSessionStatus(HOST_ID, SESSION_ID, SessionStatus.completed),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_STATUS_TRANSITION',
    });
  });
});

describe('listUserSessions canManageSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionSeriesFindManyMock.mockResolvedValue([]);
  });

  it('calcula canManageSession respetando membresía activa, rol admin, sesiones directas e invitados', async () => {
    const baseRow = {
      id: SESSION_ID,
      title: 'Mesa',
      scheduledAt: new Date('2026-11-28T20:00:00Z'),
      location: 'Casa',
      status: SessionStatus.voting,
      votingMode: VotingMode.multi_vote,
      maxVotesPerUser: 3,
      maxProposalsPerUser: null,
      inviteToken: 'tok-1',
      host: { id: HOST_ID, displayName: 'Host', avatarUrl: null, bggUsername: null },
      participants: [],
      proposals: [],
    };

    sessionFindManyMock.mockResolvedValueOnce([
      // 1. Sesión de grupo donde viewer es host activo
      {
        ...baseRow,
        id: 's-1',
        groupId: GROUP_ID,
        hostId: HOST_ID,
        group: { id: GROUP_ID, name: 'G1', members: [{ role: GroupRole.member }] },
      },
      // 2. Sesión de grupo donde viewer es admin (no host)
      {
        ...baseRow,
        id: 's-2',
        groupId: GROUP_ID,
        hostId: MEMBER_ID,
        group: { id: GROUP_ID, name: 'G1', members: [{ role: GroupRole.admin }] },
      },
      // 3. Sesión de grupo donde viewer es host expulsado (sin membresía)
      {
        ...baseRow,
        id: 's-3',
        groupId: GROUP_ID,
        hostId: HOST_ID,
        group: { id: GROUP_ID, name: 'G1', members: [] },
      },
      // 4. Sesión directa (groupId: null) donde viewer es host
      {
        ...baseRow,
        id: 's-4',
        groupId: null,
        hostId: HOST_ID,
        group: null,
      },
    ]);

    const items = await listUserSessions(HOST_ID, {});
    expect(items.map((i) => ({ id: i.id, canManage: i.canManageSession }))).toEqual([
      { id: 's-1', canManage: true },
      { id: 's-2', canManage: true },
      { id: 's-3', canManage: false },
      { id: 's-4', canManage: true },
    ]);

    // Invitado nunca puede gestionar
    sessionFindManyMock.mockResolvedValueOnce([
      {
        ...baseRow,
        id: 's-5',
        groupId: null,
        hostId: HOST_ID,
        group: null,
      },
    ]);
    const guestItems = await listUserSessions(
      HOST_ID,
      {},
      { isGuest: true, guestSessionId: 's-5' },
    );
    expect(guestItems[0]?.canManageSession).toBe(false);
  });
});
