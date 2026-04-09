import { NextRequest, NextResponse } from 'next/server'
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { id, password } = await req.json()

  const adminId = process.env.ADMIN_ID
  const adminPassword = process.env.ADMIN_PASSWORD

  if (id !== adminId || password !== adminPassword) {
    return NextResponse.json({ error: '認証失敗' }, { status: 401 })
  }

  const sessionId = await createSession()

  const res = NextResponse.json({ success: true })
  res.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60,
    path: '/',
  })

  return res
}
