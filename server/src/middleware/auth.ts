import type { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../utils/errors.js';

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized('Token inválido o expirado', 'INVALID_TOKEN');
  }
}
