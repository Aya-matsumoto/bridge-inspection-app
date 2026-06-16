// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, createUserSession, USER_SESSION_COOKIE } from '@/lib/userAuth'

export async function POST(req: NextRequest) {
  try {
    const { loginId, password } = await req.json()
    if (!loginId || !password) {
      return NextResponse.json({ error: 'IDとパスワードを入力してください' }, { status: 400 })
    }

    const hashed = hashPassword(password)

    // DBからユーザーを検索
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, "loginId", "displayName", "allowedOffices", "isAdmin", "isActive", password
       FROM "User" WHERE "loginId" = $1`,
      loginId
    )

    if (!rows.length) {
      return NextResponse.json({ error: 'IDまたはパスワードが違います' }, { status: 401 })
    }

    const user = rows[0]
    if (!user.isActive) {
      return NextResponse.json({ error: 'このアカウントは無効です' }, { status: 401 })
    }
    if (user.password !== hashed) {
      return NextResponse.json({ error: 'IDまたはパスワードが違います' }, { status: 401 })
    }

    const sessionId = await createUserSession(Number(user.id))

    const res = NextResponse.json({
      success: true,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
    })
    res.cookies.set(USER_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,
      path: '/',
    })
    // クライアント側で表示名・権限を参照できるよう平文Cookieも設定
    res.cookies.set('u_name', user.displayName, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,
      path: '/',
    })
    res.cookies.set('u_admin', user.isAdmin ? '1' : '0', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,
      path: '/',
    })
    return res
  } catch (e: any) {
    console.error('user-login error:', e)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
