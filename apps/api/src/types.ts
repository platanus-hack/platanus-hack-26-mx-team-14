import "@fastify/jwt";
import type { FastifyRequest, FastifyReply } from "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { userId: string; credentialId: string | null; rfc: string | null };
    user: { userId: string; credentialId: string | null; rfc: string | null };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
