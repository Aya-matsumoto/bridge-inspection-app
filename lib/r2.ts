// Cloudflare R2 ストレージ用ヘルパー
// AWS S3 互換 API を使って R2 を操作する
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

// R2 クライアントの初期化
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME!
// バケットの公開 URL（例: https://pub-xxxxxxxxxxxx.r2.dev）
const PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')

/**
 * ファイルを R2 にアップロードし、公開 URL を返す
 */
export async function r2Put(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await r2Client.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        body,
    ContentType: contentType,
  }))
  return `${PUBLIC_URL}/${key}`
}

/**
 * R2 からファイルを削除する
 * filePath は公開 URL またはキー名のどちらでも受け付ける
 */
export async function r2Delete(filePath: string): Promise<void> {
  // URL 全体が渡された場合はキー部分だけ取り出す
  const key = filePath.startsWith('http')
    ? filePath.replace(`${PUBLIC_URL}/`, '')
    : filePath

  await r2Client.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key:    key,
  }))
}
