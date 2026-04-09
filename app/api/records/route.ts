import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recalcOfficeNo } from '@/lib/recalcOfficeNo'

export async function POST(req: NextRequest) {
  const data = await req.json()

  // まず仮の通し番号 0 で登録し、後で再計算する
  const record = await prisma.inspectionRecord.create({
    data: {
      ...data,
      officeNo: 0,
      discoveryDate: new Date(data.discoveryDate),
      measureDate: data.measureDate ? new Date(data.measureDate) : null,
    },
  })

  // 発見日の古い順に通し番号を振り直す
  await recalcOfficeNo(data.subOffice)

  // 再計算後の値を取得して返す
  const updated = await prisma.inspectionRecord.findUnique({ where: { id: record.id } })
  return NextResponse.json(updated)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const records = await prisma.inspectionRecord.findMany({
    where: status ? { status } : undefined,
    orderBy: { discoveryDate: 'asc' },
    include: { photos: true },
  })

  return NextResponse.json(records)
}
