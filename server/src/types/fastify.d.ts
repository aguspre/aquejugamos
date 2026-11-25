import '@fastify/jwt';
import type { User } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      emailVerified?: boolean;
      firebaseUid?: string;
      isGuest?: boolean;
      guestGroupId?: string;
      guestGroupName?: string;
      guestSessionId?: string;
    };
    user: {
      sub: string;
      email: string;
      emailVerified?: boolean;
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

  interface FastifyRequest {
    syncedUser?: User;
    hasAdminTokenAuth?: boolean;
  }

  interface FastifyReply {
    telemetryErrorCode?: string;
  }
}
