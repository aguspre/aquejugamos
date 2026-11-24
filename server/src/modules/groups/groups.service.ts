import { GroupRole, UserGameStatus } from '@prisma/client';
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

async function formatGroupDto(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          user: { select: USER_SUMMARY_SELECT },
        },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      },
      _count: {
        select: { sessions: true, playLogs: true },
      },
    },
  });

  if (!group) {
    throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');
  }

  const memberIds = group.members.map((m) => m.userId);

  const ownedRows =
    memberIds.length > 0
      ? await prisma.userGame.findMany({
          where: {
            userId: { in: memberIds },
            status: UserGameStatus.owned,
            game: { isExpansion: false },
          },
          select: { userId: true, gameId: true },
        })
      : [];

  const ownedCountByUser = new Map<string, number>();
  const uniqueGameIds = new Set<string>();

  for (const row of ownedRows) {
    uniqueGameIds.add(row.gameId);
    ownedCountByUser.set(row.userId, (ownedCountByUser.get(row.userId) ?? 0) + 1);
  }

  return {
    id: group.id,
    name: group.name,
    inviteCode: group.inviteCode,
    createdBy: group.createdBy,
    createdAt: group.createdAt,
    gamesCount: uniqueGameIds.size,
    sessionsCount: group._count.sessions,
    playLogsCount: group._count.playLogs,
    members: group.members.map((m) => ({
      role: m.role,
      joinedAt: m.joinedAt,
      ownedGamesCount: ownedCountByUser.get(m.userId) ?? 0,
      user: m.user,
    })),
  };
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
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
    orderBy: { joinedAt: 'asc' },
  });

  const groups = await Promise.all(
    memberships.map((m) => formatGroupDto(m.groupId)),
  );

  return groups;
}

export async function getGroupById(userId: string, groupId: string) {
  await assertGroupMember(userId, groupId);
  return formatGroupDto(groupId);
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
): Promise<{ groupDeleted: boolean }> {
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

  await prisma.groupMember.delete({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });

  return { groupDeleted: false };
}
