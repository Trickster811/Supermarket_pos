export type UserRole = "ADMIN" | "MANAGER" | "CASHIER";

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthenticatedUser | null;
  }
}