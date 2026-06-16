import crypto from 'crypto'
import { cookies } from 'next/headers'
import { prisma } from './prisma'

export const USER_SESSION_COOKIE = 'u_session'
const SESSION_DURATION = 8 * 60 * 60 * 1000 // 8時間

// パスワードをSHA-256でハッシュ化
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update('bridge_salt_' + password).digest('hex')
}

// セッションを作成してセッションIDを返す
export async function createUserSession(userId: number): Promise<string> {
  const id = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DURATION)
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserSession" (id, "userId", "createdAt", "expiresAt") VALUES ($1, $2, $3, $4)`,
    id, userId, new Date(), expiresAt
  )
  return id
}

// セッションCookieからユーザー情報を取得
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies()
    const sessionId = cookieStore.get(USER_SESSION_COOKIE)?.value
    if (!sessionId) return null

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT u.id, u."loginId", u."displayName", u."allowedOffices", u."isAdmin", u."isActive"
       FROM "UserSession" s
       JOIN "User" u ON u.id = s."userId"
       WHERE s.id = $1 AND s."expiresAt" > $2`,
      sessionId, new Date()
    )
    if (!rows.length) return null
    const u = rows[0]
    if (!u.isActive) return null
    return {
      id: Number(u.id),
      loginId: u.loginId,
      displayName: u.displayName,
      allowedOffices: u.allowedOffices as string,
      isAdmin: Boolean(u.isAdmin),
    }
  } catch {
    return null
  }
}

// セッションを削除（ログアウト）
export async function deleteUserSession(): Promise<void> {
  try {
    const cookieStore = await cookies()
    const sessionId = cookieStore.get(USER_SESSION_COOKIE)?.value
    if (sessionId) {
      await prisma.$executeRawUnsafe(`DELETE FROM "UserSession" WHERE id = $1`, sessionId)
    }
  } catch {}
}

// allowedOffices の値をパースして出張所名の配列 or null（全て）を返す
export function parseAllowedOffices(allowedOffices: string): string[] | null {
  if (!allowedOffices || allowedOffices === 'all') return null // null = 制限なし
  return allowedOffices.split(',').map(s => s.trim()).filter(Boolean)
}
