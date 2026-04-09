import { cookies } from 'next/headers'
import { prisma } from './prisma'

const SESSION_COOKIE = 'admin_session'
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export async function createSession(): Promise<string> {
  const id = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DURATION)
  await prisma.adminSession.create({ data: { id, expiresAt } })
  return id
}

export async function validateSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value
  if (!sessionId) return false

  const session = await prisma.adminSession.findUnique({ where: { id: sessionId } })
  if (!session) return false
  if (session.expiresAt < new Date()) {
    await prisma.adminSession.delete({ where: { id: sessionId } })
    return false
  }
  return true
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value
  if (sessionId) {
    await prisma.adminSession.deleteMany({ where: { id: sessionId } })
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE
