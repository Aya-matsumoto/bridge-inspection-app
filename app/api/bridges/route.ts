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

// CSV取込（出張所名+橋梁名が一致するものは置換え、それ以外は追加）
export async function POST(req: NextRequest) {
  try {
    const data = await req.json()

    // 出張所管理に登録されている出張所名一覧を取得
    const officeRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT name FROM "SubOfficeMaster"`
    )
    const validOffices = new Set(officeRows.map((r: any) => r.name))

    // CSV内の出張所名が出張所管理に存在するか検証
    const unknownOffices = new Set<string>()
    for (const item of data) {
      const subOffice = String(item.subOffice ?? '').trim()
      if (subOffice && !validOffices.has(subOffice)) {
        unknownOffices.add(subOffice)
      }
    }
    if (unknownOffices.size > 0) {
      return NextResponse.json(
        { error: `出張所管理に登録されていない出張所名があります: ${Array.from(unknownOffices).join('、')}` },
        { status: 400 }
      )
    }

    // 1件ずつ「出張所名+橋梁名」が一致するか確認し、置換え or 追加
    const now = new Date()
    let count = 0
    for (const item of data) {
      const routeNo = Number(item.routeNo)
      if (isNaN(routeNo)) continue
      const subOffice = String(item.subOffice)
      const bridgeName = String(item.bridgeName)
      const sortOrder = String(item.sortOrder ?? '')
      const distanceMarker = item.distanceMarker ?? null

      const existing: any[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM "BridgeMaster" WHERE "subOffice" = $1 AND "bridgeName" = $2`,
        subOffice, bridgeName
      )

      if (existing.length > 0) {
        // 既存：置換え（更新）
        await prisma.$executeRawUnsafe(
          `UPDATE "BridgeMaster" SET "sortOrder" = $1, "routeNo" = $2, "distanceMarker" = $3, "updatedAt" = $4 WHERE id = $5`,
          sortOrder, routeNo, distanceMarker, now, existing[0].id
        )
      } else {
        // 新規：追加
        await prisma.$executeRawUnsafe(
          `INSERT INTO "BridgeMaster" ("sortOrder", "subOffice", "bridgeName", "routeNo", "distanceMarker", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          sortOrder, subOffice, bridgeName, routeNo, distanceMarker, now, now
        )
      }
      count++
    }

    return NextResponse.json({ count })
  } catch (e: any) {
    console.error('bridges POST error:', e)
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
