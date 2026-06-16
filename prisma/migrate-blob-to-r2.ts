/**
 * Vercel Blob → Cloudflare R2 画像移行スクリプト
 *
 * 実行方法:
 *   1. .env.local に R2_* 変数を設定する
 *   2. npx tsx prisma/migrate-blob-to-r2.ts
 */

import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import * as dotenv from 'dotenv'
import * as path from 'path'

// .env.local を読み込む
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const prisma = new PrismaClient()

// R2 クライアント
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET     = process.env.R2_BUCKET_NAME!
const PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')

async function main() {
  console.log('=== Vercel Blob → R2 移行スクリプト ===\n')

  // 環境変数チェック
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL']
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    console.error('❌ 以下の環境変数が設定されていません:')
    missing.forEach(k => console.error(`   - ${k}`))
    console.error('\n.env.local に追記してから再実行してください。')
    process.exit(1)
  }

  // Vercel Blob の URL を持つ写真を全件取得
  // （Vercel Blob の URL は "vercel-storage.com" を含む）
  const photos = await prisma.photo.findMany()
  const blobPhotos = photos.filter(p =>
    p.filePath.includes('vercel-storage.com') ||
    p.filePath.includes('public.blob.vercel')
  )

  console.log(`総写真数: ${photos.length} 件`)
  console.log(`Vercel Blob の写真: ${blobPhotos.length} 件`)
  console.log(`すでに R2 の写真: ${photos.length - blobPhotos.length} 件\n`)

  if (blobPhotos.length === 0) {
    console.log('✅ 移行対象なし。すべて R2 に移行済みです。')
    return
  }

  let success = 0
  let failed  = 0

  for (const photo of blobPhotos) {
    process.stdout.write(`[${success + failed + 1}/${blobPhotos.length}] ${photo.originalName} ... `)

    try {
      // Vercel Blob から画像を取得
      const res = await fetch(photo.filePath)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const buf         = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') ?? 'image/jpeg'

      // ファイル名だけ取り出す（URL の末尾部分）
      const originalKey = photo.filePath.split('/').pop()?.split('?')[0] ?? `photo_${photo.id}.jpg`

      // R2 にアップロード
      await r2.send(new PutObjectCommand({
        Bucket:      BUCKET,
        Key:         originalKey,
        Body:        buf,
        ContentType: contentType,
      }))

      const newUrl = `${PUBLIC_URL}/${originalKey}`

      // DB の URL を更新
      await prisma.photo.update({
        where: { id: photo.id },
        data:  { filePath: newUrl },
      })

      console.log(`✅ 完了`)
      success++

    } catch (err) {
      console.log(`❌ 失敗: ${err}`)
      failed++
    }
  }

  console.log('\n=== 移行結果 ===')
  console.log(`✅ 成功: ${success} 件`)
  if (failed > 0) {
    console.log(`❌ 失敗: ${failed} 件（手動確認が必要です）`)
  }
  console.log('\n移行が完了しました。')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
