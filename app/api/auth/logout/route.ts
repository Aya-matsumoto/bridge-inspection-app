import { NextResponse } from 'next/server'
import { deleteSession, SESSION_COOKIE_NAME } from '@/lib/auth'

export async function GET() {
  await deleteSession()
  const res = NextResponse.redirect(new URL('/admin/login', process.env.NEXTAUTH_URL || 'http://localhost:3002'))
  res.cookies.delete(SESSION_COOKIE_NAME)
  return res
}
