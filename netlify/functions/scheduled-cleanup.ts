import type { Config } from '@netlify/functions'

// Netlify スケジュール関数：毎日 18:00 UTC（日本時間 翌 3:00）に実行
// vercel.json の cron 設定の代替
const handler = async () => {
  const baseUrl = process.env.URL          // Netlify が自動で設定するサイト URL
  const secret  = process.env.CRON_SECRET  // 既存の環境変数をそのまま使用

  if (!baseUrl || !secret) {
    console.error('[scheduled-cleanup] URL または CRON_SECRET が未設定です')
    return
  }

  try {
    const res = await fetch(`${baseUrl}/api/cron/cleanup`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    const data = await res.json()
    console.log('[scheduled-cleanup] 完了:', JSON.stringify(data))
  } catch (err) {
    console.error('[scheduled-cleanup] エラー:', err)
  }
}

export default handler

export const config: Config = {
  schedule: '0 18 * * *',  // cron 式（vercel.json と同じスケジュール）
}
