import type { FastifyInstance } from 'fastify';
import { getEnv } from '../../config/env.js';
import { authenticate, requireRegisteredUser } from '../../middleware/auth.js';
import {
  googleAuthSchema,
  guestJoinSchema,
  invitePreviewQuerySchema,
  loginSchema,
  registerSchema,
  syncProfileSchema,
  updateProfileSchema,
} from './auth.schemas.js';
import {
  authenticateWithGoogle,
  createGuestForInvite,
  getInvitePreview,
  getUserProfile,
  loginUser,
  registerUser,
  toPublicUser,
  updateUserProfile,
} from './auth.service.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const signUserToken = (user: { id: string; email: string }) => {
    const env = getEnv();
    return app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: env.JWT_EXPIRES_IN },
    );
  };

  app.get('/invite-preview', async (request) => {
    const query = invitePreviewQuerySchema.parse(request.query);
    const preview = await getInvitePreview(query);
    return { preview };
  });

  app.post('/guest-join', async (request, reply) => {
    const input = guestJoinSchema.parse(request.body);
    const { user, guestScope } = await createGuestForInvite(input);
    const env = getEnv();
    const token = app.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        isGuest: true,
        ...(guestScope.kind === 'group'
          ? {
              guestGroupId: guestScope.groupId,
              guestGroupName: guestScope.groupName,
            }
          : {
              guestSessionId: guestScope.sessionId,
              guestGroupName: guestScope.groupName,
            }),
      },
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    return reply.status(201).send({
      token,
      user,
      isGuest: true,
      guestScope,
    });
  });

  app.post('/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const user = await registerUser(input);
    const token = signUserToken(user);

    return reply.status(201).send({ token, user });
  });

  app.post('/login', async (request) => {
    const input = loginSchema.parse(request.body);
    const user = await loginUser(input);
    const token = signUserToken(user);

    return { token, user };
  });

  app.post('/google', async (request) => {
    const { idToken } = googleAuthSchema.parse(request.body);
    const user = await authenticateWithGoogle(idToken);
    const token = signUserToken(user);

    return { token, user };
  });

  app.post(
    '/sync',
    { preHandler: [authenticate, requireRegisteredUser] },
    async (request) => {
      const input = syncProfileSchema.parse(request.body);
      const hasUpdates =
        input.displayName !== undefined ||
        input.avatarUrl !== undefined ||
        input.bggUsername !== undefined;

      const user = hasUpdates
        ? await updateUserProfile(request.user.sub, input)
        : request.syncedUser
          ? toPublicUser(request.syncedUser)
          : await getUserProfile(request.user.sub);

      return { user };
    },
  );

  app.get('/me', { preHandler: [authenticate] }, async (request) => {
    const user = request.syncedUser
      ? toPublicUser(request.syncedUser)
      : await getUserProfile(request.user.sub);
    const isGuest = Boolean(request.user.isGuest);
    const guestScope = isGuest
      ? {
          kind: request.user.guestGroupId ? ('group' as const) : ('session' as const),
          groupId: request.user.guestGroupId ?? null,
          sessionId: request.user.guestSessionId ?? null,
          groupName: request.user.guestGroupName ?? null,
        }
      : null;

    return { user, isGuest, guestScope };
  });

  app.patch(
    '/me',
    { preHandler: [authenticate, requireRegisteredUser] },
    async (request) => {
      const input = updateProfileSchema.parse(request.body);
      const user = await updateUserProfile(request.user.sub, input);
      return { user };
    },
  );
}
