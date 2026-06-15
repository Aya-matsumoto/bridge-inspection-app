import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { r2Delete } from '@/lib/r2'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)

  const photo = await prisma.photo.findUnique({ where: { id } })
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // DBから削除
  await prisma.photo.delete({ where: { id } })

  // Cloudflare R2 からも削除（失敗しても無視）
  try {
    await r2Delete(photo.filePath)
  } catch { /* スキップ */ }

  return NextResponse.json({ success: true })
}
