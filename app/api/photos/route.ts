import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { r2Put } from '@/lib/r2'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const recordId = parseInt(formData.get('recordId') as string)
  const type = formData.get('type') as string

  if (!file || !recordId || !type) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    return NextResponse.json({ error: 'JPGまたはPNG形式のファイルを選択してください' }, { status: 400 })
  }

  const maxSize = type === 'position' ? 20 * 1024 * 1024 : 10 * 1024 * 1024
  if (file.size > maxSize) {
    return NextResponse.json({ error: `${type === 'position' ? '20' : '10'}MB以下のファイルを選択してください` }, { status: 400 })
  }

  const ext = file.name.split('.').pop()
  const key = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  // Cloudflare R2 にアップロード（公開 URL を返す）
  const buf = Buffer.from(await file.arrayBuffer())
  const publicUrl = await r2Put(key, buf, file.type)

  const photo = await prisma.photo.create({
    data: {
      recordId,
      type,
      filePath: publicUrl,   // R2 の公開 URL をそのまま保存
      originalName: file.name,
    },
  })

  return NextResponse.json(photo)
}
