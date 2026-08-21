import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const isDev = process.env.NODE_ENV !== "production";

function createPrismaClient() {
  if (isDev) {
    console.log("[PRISMA] Creating Prisma client");
    console.log("[PRISMA] DATABASE_URL set:", !!process.env.DATABASE_URL);
    console.log("[PRISMA] NODE_ENV:", process.env.NODE_ENV);
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  return new PrismaClient({
    log: isDev
      ? ["error", "warn"]
      : ["error"],
  });
}

/**
 * Singleton Prisma client.
 *
 * In development, we store the client on `globalThis` so it survives
 * hot-module reloading without creating a new connection pool.
 *
 * In production (Vercel serverless), each function invocation gets its
 * own client. The `globalThis` cache is skipped so that each invocation
 * creates exactly one client for its lifetime. Connection pooling is
 * handled by the `@prisma/adapter-pg` or Prisma's built-in connection
 * management.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (isDev) {
  globalForPrisma.prisma = prisma;
}
