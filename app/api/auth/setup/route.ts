// @ts-nocheck
// 初回セットアップ専用API：Userが0件のときだけ管理者を作成できる
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/userAuth'

export async function POST(req: NextRequest) {
  try {
    // すでにユーザーが存在する場合は拒否
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "User"`)
    const count = Number(rows[0]?.cnt ?? 0)
    if (count > 0) {
      return NextResponse.json({ error: 'すでにユーザーが登録されています' }, { status: 403 })
    }

    const { loginId, password, displayName } = await req.json()
    if (!loginId || !password || !displayName) {
      return NextResponse.json({ error: '必須項目が未入力です' }, { status: 400 })
    }

    const now = new Date()
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("loginId", password, "displayName", "allowedOffices", "isAdmin", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'all', true, true, $4, $4)`,
      loginId, hashPassword(password), displayName, now
    )
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
