import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    throw new Error("DATABASE_URL is not set");
  }

  const client = new PrismaClient();

  client.$connect().catch((error) => {
    console.error("Prisma connection error:", error instanceof Error ? error.message : "Unknown error");
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
