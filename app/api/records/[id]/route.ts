import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recalcOfficeNo } from '@/lib/recalcOfficeNo'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const record = await prisma.inspectionRecord.findUnique({
    where: { id },
    include: { photos: true },
  })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(record)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const data = await req.json()

  const updateData: Record<string, unknown> = { ...data }
  if (data.discoveryDate) updateData.discoveryDate = new Date(data.discoveryDate)
  if (data.measureDate) updateData.measureDate = new Date(data.measureDate)

  const record = await prisma.inspectionRecord.update({
    where: { id },
    data: updateData,
    include: { photos: true },
  })

  // 発見日変更・削除ステータス変更があった場合に通し番号を再計算
  if (data.discoveryDate || data.status) {
    await recalcOfficeNo(record.subOffice)
    const refreshed = await prisma.inspectionRecord.findUnique({
      where: { id },
      include: { photos: true },
    })
    return NextResponse.json(refreshed)
  }

  return NextResponse.json(record)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const record = await prisma.inspectionRecord.update({
    where: { id },
    data: { status: 'deleted' },
  })
  // 削除後も通し番号を再計算
  await recalcOfficeNo(record.subOffice)
  return NextResponse.json({ success: true })
}
