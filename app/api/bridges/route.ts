// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 橋梁マスタ一覧取得
export async function GET() {
  try {
    // $queryRawUnsafe を使うことでPgBouncer のキャッシュ問題を回避
    const bridges: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, "sortOrder", "subOffice", "bridgeName", "routeNo", "distanceMarker"
       FROM "BridgeMaster"
       ORDER BY "sortOrder" ASC, "subOffice" ASC, "bridgeName" ASC`
    )
    const result = bridges.map((b: any) => ({
      id: Number(b.id),
      sortOrder: b.sortOrder ?? '',
      subOffice: b.subOffice,
      bridgeName: b.bridgeName,
      routeNo: Number(b.routeNo),
      distanceMarker: b.distanceMarker ?? null,
    }))
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('bridges GET error:', e)
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}

// CSV取込（全件置き換え）
export async function POST(req: NextRequest) {
  try {
    const data = await req.json()

    // 既存データを全削除
    await prisma.$executeRawUnsafe(`DELETE FROM "BridgeMaster"`)

    // 1件ずつ登録
    const now = new Date()
    let count = 0
    for (const item of data) {
      const routeNo = Number(item.routeNo)
      if (isNaN(routeNo)) continue
      await prisma.$executeRawUnsafe(
        `INSERT INTO "BridgeMaster" ("sortOrder", "subOffice", "bridgeName", "routeNo", "distanceMarker", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        String(item.sortOrder ?? ''),
        String(item.subOffice),
        String(item.bridgeName),
        routeNo,
        item.distanceMarker ?? null,
        now,
        now
      )
      count++
    }

    return NextResponse.json({ count })
  } catch (e: any) {
    console.error('bridges POST error:', e)
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
