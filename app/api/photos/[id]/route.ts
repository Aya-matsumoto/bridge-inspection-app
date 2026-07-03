import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { r2Put, r2Delete } from '@/lib/r2'

// 画像の差し替え（注釈の上書き）・並び順の更新
// id/recordId/type/sortOrder は変更しないため、一覧上の並び順が崩れない
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const photo = await prisma.photo.findUnique({ where: { id } })
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const originalFile = formData.get('originalFile') as File | null
  const annotationData = formData.get('annotationData') as string | null
  const sortOrderRaw = formData.get('sortOrder') as string | null

  const updateData: Record<string, unknown> = {}

  if (file) {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      return NextResponse.json({ error: 'JPGまたはPNG形式のファイルを選択してください' }, { status: 400 })
    }
    const maxSize = 1 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: '1MB以下のファイルを選択してください' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()
    const key = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())
    updateData.filePath = await r2Put(key, buf, file.type)
    updateData.annotationData = annotationData || null

    if (originalFile && ['image/jpeg', 'image/png'].includes(originalFile.type)) {
      const origExt = originalFile.name.split('.').pop()
      const origKey = `${Date.now()}_orig_${Math.random().toString(36).slice(2)}.${origExt}`
      const origBuf = Buffer.from(await originalFile.arrayBuffer())
      updateData.originalFilePath = await r2Put(origKey, origBuf, originalFile.type)
    }

    // 差し替え前の画像をR2から削除（失敗しても無視）
    try { await r2Delete(photo.filePath) } catch { /* スキップ */ }
  }

  if (sortOrderRaw !== null) {
    updateData.sortOrder = parseInt(sortOrderRaw)
  }

  const updated = await prisma.photo.update({ where: { id }, data: updateData })
  return NextResponse.json(updated)
}

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
