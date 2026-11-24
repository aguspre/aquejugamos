import type { FastifyInstance } from 'fastify';
import { getEnv } from '../../config/env.js';
import { authenticate } from '../../middleware/auth.js';
import {
  googleAuthSchema,
  loginSchema,
  registerSchema,
  syncProfileSchema,
  updateProfileSchema,
} from './auth.schemas.js';
import {
  authenticateWithGoogle,
  getUserProfile,
  loginUser,
  registerUser,
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

  app.post('/sync', { preHandler: [authenticate] }, async (request) => {
    const input = syncProfileSchema.parse(request.body);
    const hasUpdates =
      input.displayName !== undefined ||
      input.avatarUrl !== undefined ||
      input.bggUsername !== undefined;

    const user = hasUpdates
      ? await updateUserProfile(request.user.sub, input)
      : await getUserProfile(request.user.sub);

    return { user };
  });

  app.get('/me', { preHandler: [authenticate] }, async (request) => {
    const user = await getUserProfile(request.user.sub);
    return { user };
  });

  app.patch('/me', { preHandler: [authenticate] }, async (request) => {
    const input = updateProfileSchema.parse(request.body);
    const user = await updateUserProfile(request.user.sub, input);
    return { user };
  });
}
