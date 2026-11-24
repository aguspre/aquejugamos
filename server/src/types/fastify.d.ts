import '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      firebaseUid?: string;
      isGuest?: boolean;
      guestGroupId?: string;
      guestGroupName?: string;
      guestSessionId?: string;
    };
    user: {
      sub: string;
      email: string;
      firebaseUid?: string;
      isGuest?: boolean;
      guestGroupId?: string;
      guestGroupName?: string;
      guestSessionId?: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
