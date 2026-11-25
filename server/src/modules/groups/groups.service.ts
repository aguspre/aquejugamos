import { randomBytes } from 'node:crypto';
import { GroupRole, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { generateGroupInviteCode } from '../../utils/tokens.js';
import type { CreateGroupInput } from './groups.schemas.js';

const USER_SUMMARY_SELECT = {
  id: true,
  displayName: true,
  avatarUrl: true,
  bggUsername: true,
} as const;

async function generateUniqueInviteCode(groupName: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = generateGroupInviteCode(groupName);
    const exists = await prisma.group.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  return generateGroupInviteCode('MESA');
}

const GROUP_DTO_INCLUDE = {
  members: {
    include: {
      user: { select: USER_SUMMARY_SELECT },
    },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
  },
  _count: {
    select: { sessions: true, playLogs: true },
  },
} satisfies Prisma.GroupInclude;

type GroupWithMembersAndCounts = Prisma.GroupGetPayload<{
  include: typeof GROUP_DTO_INCLUDE;
}>;

async function fetchGroupWithMembersAndCounts(groupId: string) {
  return prisma.group.findUnique({
    relationLoadStrategy: 'join',
    where: { id: groupId },
    include: GROUP_DTO_INCLUDE,
  });
}

function buildGroupDtoFromCounts(
  group: NonNullable<GroupWithMembersAndCounts>,
  ownedCountByUserId: Map<string, number>,
  distinctGamesCountByGroupId: Map<string, number>,
) {
  return {
    id: group.id,
    name: group.name,
    inviteCode: group.inviteCode,
    createdBy: group.createdBy,
    createdAt: group.createdAt,
    gamesCount: distinctGamesCountByGroupId.get(group.id) ?? 0,
    sessionsCount: group._count.sessions,
    playLogsCount: group._count.playLogs,
    members: group.members.map((m) => ({
      role: m.role,
      joinedAt: m.joinedAt,
      ownedGamesCount: ownedCountByUserId.get(m.userId) ?? 0,
      user: m.user,
    })),
  };
}

async function fetchAggregatedOwnedCounts(
  groupIds: string[],
  userIds: string[],
): Promise<{
  ownedCountByUserId: Map<string, number>;
  distinctGamesCountByGroupId: Map<string, number>;
}> {
  const ownedCountByUserId = new Map<string, number>();
  const distinctGamesCountByGroupId = new Map<string, number>();

  if (groupIds.length === 0 || userIds.length === 0) {
    return { ownedCountByUserId, distinctGamesCountByGroupId };
  }

  const rows = await prisma.$queryRaw<{ kind: string; id: string; count: number }[]>`
    SELECT 'user' AS "kind", ug.user_id::text AS "id", COUNT(*)::int AS "count"
    FROM user_games ug
    INNER JOIN games g ON g.id = ug.game_id
    WHERE ug.user_id = ANY(${userIds}::uuid[])
      AND ug.status = 'owned'::"UserGameStatus"
      AND g.is_expansion = false
    GROUP BY ug.user_id
    UNION ALL
    SELECT 'group' AS "kind", gm.group_id::text AS "id", COUNT(DISTINCT ug.game_id)::int AS "count"
    FROM group_members gm
    INNER JOIN user_games ug
      ON ug.user_id = gm.user_id
     AND ug.status = 'owned'::"UserGameStatus"
    INNER JOIN games g
      ON g.id = ug.game_id
     AND g.is_expansion = false
    WHERE gm.group_id = ANY(${groupIds}::uuid[])
    GROUP BY gm.group_id
  `;

  for (const row of rows) {
    if (row.kind === 'user') {
      ownedCountByUserId.set(row.id, Number(row.count));
    } else {
      distinctGamesCountByGroupId.set(row.id, Number(row.count));
    }
  }

  return { ownedCountByUserId, distinctGamesCountByGroupId };
}

async function fetchUserGroupAggregatedCounts(
  userId: string,
  includeLibraryCount = false,
): Promise<{
  ownedCountByUserId: Map<string, number>;
  distinctGamesCountByGroupId: Map<string, number>;
  libraryCount: number;
}> {
  const ownedCountByUserId = new Map<string, number>();
  const distinctGamesCountByGroupId = new Map<string, number>();
  let libraryCount = 0;

  const libraryUnion = includeLibraryCount
    ? Prisma.sql`
        UNION ALL
        SELECT 'library' AS "kind", ${userId}::text AS "id", COUNT(*)::int AS "count"
        FROM user_games
        WHERE user_id = ${userId}::uuid
      `
    : Prisma.empty;

  const rows = await prisma.$queryRaw<{ kind: string; id: string; count: number }[]>`
    WITH my_groups AS (
      SELECT group_id FROM group_members WHERE user_id = ${userId}::uuid
    ),
    my_members AS (
      SELECT DISTINCT gm.user_id
      FROM group_members gm
      INNER JOIN my_groups mg ON mg.group_id = gm.group_id
    )
    SELECT 'user' AS "kind", ug.user_id::text AS "id", COUNT(*)::int AS "count"
    FROM user_games ug
    INNER JOIN my_members mm ON mm.user_id = ug.user_id
    INNER JOIN games g ON g.id = ug.game_id
    WHERE ug.status = 'owned'::"UserGameStatus"
      AND g.is_expansion = false
    GROUP BY ug.user_id
    UNION ALL
    SELECT 'group' AS "kind", gm.group_id::text AS "id", COUNT(DISTINCT ug.game_id)::int AS "count"
    FROM group_members gm
    INNER JOIN my_groups mg ON mg.group_id = gm.group_id
    INNER JOIN user_games ug
      ON ug.user_id = gm.user_id
     AND ug.status = 'owned'::"UserGameStatus"
    INNER JOIN games g
      ON g.id = ug.game_id
     AND g.is_expansion = false
    GROUP BY gm.group_id
    ${libraryUnion}
  `;

  for (const row of rows) {
    if (row.kind === 'user') {
      ownedCountByUserId.set(row.id, Number(row.count));
    } else if (row.kind === 'group') {
      distinctGamesCountByGroupId.set(row.id, Number(row.count));
    } else if (row.kind === 'library') {
      libraryCount = Number(row.count);
    }
  }

  return { ownedCountByUserId, distinctGamesCountByGroupId, libraryCount };
}

async function formatGroupDto(groupId: string) {
  const group = await fetchGroupWithMembersAndCounts(groupId);

  if (!group) {
    throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');
  }

  const { ownedCountByUserId, distinctGamesCountByGroupId } =
    await fetchAggregatedOwnedCounts(
      [group.id],
      group.members.map((m) => m.userId),
    );

  return buildGroupDtoFromCounts(
    group,
    ownedCountByUserId,
    distinctGamesCountByGroupId,
  );
}

export async function assertGroupMember(userId: string, groupId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership) {
    throw forbidden('No pertenecés a este grupo', 'NOT_GROUP_MEMBER');
  }

  return membership;
}

export async function assertGroupAdmin(userId: string, groupId: string) {
  const membership = await assertGroupMember(userId, groupId);
  if (membership.role !== GroupRole.admin) {
    throw forbidden(
      'Solo los administradores del grupo pueden realizar esta acción',
      'GROUP_ADMIN_REQUIRED',
    );
  }
  return membership;
}

export async function listUserGroups(userId: string) {
  const { groups } = await listUserGroupsWithLibraryCount(userId, false);
  return groups;
}

export async function listUserGroupsWithLibraryCount(
  userId: string,
  includeLibraryCount = true,
) {
  const [memberships, { ownedCountByUserId, distinctGamesCountByGroupId, libraryCount }] =
    await Promise.all([
      prisma.groupMember.findMany({
        relationLoadStrategy: 'join',
        where: { userId },
        orderBy: { joinedAt: 'asc' },
        include: {
          group: {
            include: GROUP_DTO_INCLUDE,
          },
        },
      }),
      fetchUserGroupAggregatedCounts(userId, includeLibraryCount),
    ]);

  return {
    groups: memberships.map((m) =>
      buildGroupDtoFromCounts(
        m.group,
        ownedCountByUserId,
        distinctGamesCountByGroupId,
      ),
    ),
    libraryCount,
  };
}

export async function getGroupById(userId: string, groupId: string) {
  const group = await fetchGroupWithMembersAndCounts(groupId);

  if (!group) {
    throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');
  }

  if (!group.members.some((m) => m.userId === userId)) {
    throw forbidden('No pertenecés a este grupo', 'NOT_GROUP_MEMBER');
  }

  const { ownedCountByUserId, distinctGamesCountByGroupId } =
    await fetchAggregatedOwnedCounts(
      [group.id],
      group.members.map((m) => m.userId),
    );

  return buildGroupDtoFromCounts(
    group,
    ownedCountByUserId,
    distinctGamesCountByGroupId,
  );
}

export async function createGroup(userId: string, input: CreateGroupInput) {
  const inviteCode = await generateUniqueInviteCode(input.name);

  const created = await prisma.group.create({
    data: {
      name: input.name,
      inviteCode,
      createdBy: userId,
      members: {
        create: {
          userId,
          role: GroupRole.admin,
        },
      },
    },
    select: { id: true },
  });

  return formatGroupDto(created.id);
}

export async function joinGroupByInviteCode(userId: string, inviteCode: string) {
  const group = await prisma.group.findFirst({
    where: {
      inviteCode: {
        equals: inviteCode,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  if (!group) {
    throw notFound(
      'No encontramos ningún grupo con ese código de invitación',
      'GROUP_INVITE_NOT_FOUND',
    );
  }

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId } },
  });

  if (!existing) {
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId,
        role: GroupRole.member,
      },
    });
  }

  return {
    group: await formatGroupDto(group.id),
    alreadyMember: Boolean(existing),
  };
}

export async function regenerateGroupInviteCode(actorId: string, groupId: string) {
  await assertGroupAdmin(actorId, groupId);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true },
  });

  if (!group) {
    throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');
  }

  const inviteCode = await generateUniqueInviteCode(group.name);

  await prisma.group.update({
    where: { id: groupId },
    data: { inviteCode },
  });

  return { inviteCode };
}

export async function updateGroupMemberRole(
  actorId: string,
  groupId: string,
  targetUserId: string,
  role: GroupRole,
) {
  await assertGroupAdmin(actorId, groupId);

  const target = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });

  if (!target) {
    throw notFound('El usuario no es miembro de este grupo', 'MEMBER_NOT_FOUND');
  }

  if (target.role === GroupRole.admin && role === GroupRole.member) {
    const adminCount = await prisma.groupMember.count({
      where: { groupId, role: GroupRole.admin },
    });
    if (adminCount <= 1) {
      throw badRequest(
        'El grupo debe conservar al menos un administrador',
        undefined,
        'LAST_ADMIN_CANNOT_DEMOTE',
      );
    }
  }

  await prisma.groupMember.update({
    where: { groupId_userId: { groupId, userId: targetUserId } },
    data: { role },
  });

  return formatGroupDto(groupId);
}

export async function removeGroupMember(
  actorId: string,
  groupId: string,
  targetUserId: string,
): Promise<{
  groupDeleted: boolean;
  group?: Awaited<ReturnType<typeof formatGroupDto>>;
}> {
  const isSelf = actorId === targetUserId;
  if (!isSelf) {
    await assertGroupAdmin(actorId, groupId);
  } else {
    await assertGroupMember(actorId, groupId);
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId },
  });

  const target = members.find((m) => m.userId === targetUserId);
  if (!target) {
    throw notFound('El usuario no es miembro de este grupo', 'MEMBER_NOT_FOUND');
  }

  if (members.length === 1) {
    await prisma.group.delete({ where: { id: groupId } });
    return { groupDeleted: true };
  }

  if (target.role === GroupRole.admin) {
    const otherAdmins = members.filter(
      (m) => m.userId !== targetUserId && m.role === GroupRole.admin,
    );
    if (otherAdmins.length === 0) {
      throw badRequest(
        'Asigná otro administrador antes de salir del grupo',
        undefined,
        'LAST_ADMIN_CANNOT_LEAVE',
      );
    }
  }

  if (!isSelf) {
    const groupSeries = await prisma.sessionSeries.findMany({
      where: { groupId },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.groupMember.delete({
        where: { groupId_userId: { groupId, userId: targetUserId } },
      }),
      ...groupSeries.map((s) =>
        prisma.sessionSeries.update({
          where: { id: s.id },
          data: { shareToken: randomBytes(12).toString('base64url') },
        }),
      ),
    ]);

    return {
      groupDeleted: false,
      group: await formatGroupDto(groupId),
    };
  }

  await prisma.groupMember.delete({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });

  return { groupDeleted: false };
}
