import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { del } from '@vercel/blob'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Vercel Cron からのリクエストかチェック（不正なアクセスを防ぐ）
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1ヶ月以上前に削除されたレコードを取得
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  const expiredRecords = await prisma.inspectionRecord.findMany({
    where: {
      status: 'deleted',
      deletedAt: { lte: oneMonthAgo },
    },
    include: { photos: true },
  })

  if (expiredRecords.length === 0) {
    return NextResponse.json({ message: '完全削除対象なし', deleted: 0 })
  }

  let deletedPhotos = 0
  let deletedRecords = 0

  for (const record of expiredRecords) {
    // Vercel Blob から写真ファイルを削除
    for (const photo of record.photos) {
      try {
        await del(photo.filePath, {
          token: process.env.BLOB_READ_WRITE_TOKEN,
        })
        deletedPhotos++
      } catch {
        // ファイルが既に存在しない場合などは無視
      }
    }

    // DBからレコードを完全削除（写真はCascadeで自動削除）
    await prisma.inspectionRecord.delete({ where: { id: record.id } })
    deletedRecords++
  }

  console.log(`[cleanup] ${deletedRecords}件のレコード・${deletedPhotos}枚の写真を完全削除しました`)

  return NextResponse.json({
    message: '完全削除完了',
    deletedRecords,
    deletedPhotos,
  })
}
