import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { r2Put } from '@/lib/r2'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const originalFile = formData.get('originalFile') as File | null
  const recordId = parseInt(formData.get('recordId') as string)
  const type = formData.get('type') as string
  const annotationData = formData.get('annotationData') as string | null

  if (!file || !recordId || !type) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

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
  const publicUrl = await r2Put(key, buf, file.type)

  // アノテーション元画像を別途保存（再編集用）
  let originalFilePath: string | null = null
  if (originalFile && ['image/jpeg', 'image/png'].includes(originalFile.type)) {
    const origExt = originalFile.name.split('.').pop()
    const origKey = `${Date.now()}_orig_${Math.random().toString(36).slice(2)}.${origExt}`
    const origBuf = Buffer.from(await originalFile.arrayBuffer())
    originalFilePath = await r2Put(origKey, origBuf, originalFile.type)
  }

  const photo = await prisma.photo.create({
    data: {
      recordId,
      type,
      filePath: publicUrl,
      originalName: file.name,
      annotationData: annotationData || null,
      originalFilePath,
    },
  })

  return NextResponse.json(photo)
}
