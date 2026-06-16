// @ts-nocheck
import { NextResponse } from 'next/server'
import { deleteUserSession, USER_SESSION_COOKIE } from '@/lib/userAuth'

export async function POST() {
  await deleteUserSession()
  const res = NextResponse.json({ success: true })
  res.cookies.set(USER_SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  res.cookies.set('u_name', '', { maxAge: 0, path: '/' })
  res.cookies.set('u_admin', '', { maxAge: 0, path: '/' })
  return res
}
