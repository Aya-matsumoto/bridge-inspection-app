// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hashPassword } from '@/lib/userAuth'

// ユーザー一覧取得
export async function GET() {
  const me = await getCurrentUser()
  if (!me?.isAdmin) return NextResponse.json({ error: '権限がありません' }, { status: 403 })

  const users: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, "loginId", "displayName", "allowedOffices", "isAdmin", "isActive", "createdAt"
     FROM "User" ORDER BY id ASC`
  )
  return NextResponse.json(users.map(u => ({ ...u, id: Number(u.id) })))
}

// ユーザー作成
export async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me?.isAdmin) return NextResponse.json({ error: '権限がありません' }, { status: 403 })

  const { loginId, password, displayName, allowedOffices, isAdmin } = await req.json()
  if (!loginId || !password || !displayName) {
    return NextResponse.json({ error: '必須項目が未入力です' }, { status: 400 })
  }

  const hashed = hashPassword(password)
  const now = new Date()
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("loginId", password, "displayName", "allowedOffices", "isAdmin", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, true, $6, $6)`,
      loginId, hashed, displayName, allowedOffices || 'all', Boolean(isAdmin), now
    )
    return NextResponse.json({ success: true })
  } catch (e: any) {
    if (e?.message?.includes('unique') || e?.message?.includes('duplicate')) {
      return NextResponse.json({ error: 'そのログインIDはすでに使われています' }, { status: 409 })
    }
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
