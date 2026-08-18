import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  console.log('[PRISMA] Creating Prisma client');
  console.log('[PRISMA] DATABASE_URL set:', !!process.env.DATABASE_URL);
  console.log('[PRISMA] NODE_ENV:', process.env.NODE_ENV);
  
  if (!process.env.DATABASE_URL) {
    console.error("[PRISMA] DATABASE_URL is not set");
    throw new Error("DATABASE_URL is not set");
  }

  const client = new PrismaClient();

  client.$connect()
    .then(() => {
      console.log('[PRISMA] Successfully connected to database');
    })
    .catch((error) => {
      console.error("[PRISMA] Prisma connection error:", error instanceof Error ? error.message : "Unknown error");
      console.error("[PRISMA] Connection error stack:", error instanceof Error ? error.stack : "No stack trace");
    });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
