import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

// Always cache the Prisma client on globalThis, including in production.
// This prevents connection pool exhaustion caused by creating a new Prisma
// client instance on every hot-reload or module re-evaluation.
globalForPrisma.prisma = db
