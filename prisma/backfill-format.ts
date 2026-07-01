import { config } from 'dotenv'
config({ path: '.env.local' }) // Next と同じ .env.local から DATABASE_URL を読む

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 既存出張所に format を後付けするワンショットスクリプト。
//  京都系      → kp_range  （距離標(起終点)あり）
//  姫路・山崎  → kp_point  （距離標(ポイント)あり）
//  それ以外    → normal のまま（列デフォルト）
async function main() {
  const range = await prisma.subOfficeMaster.updateMany({
    where: { mainOffice: '京都' },
    data: { format: 'kp_range' },
  })

  const point = await prisma.subOfficeMaster.updateMany({
    where: { name: { in: ['姫路', '山崎'] } },
    data: { format: 'kp_point' },
  })

  console.log(`Backfill completed: kp_range=${range.count}, kp_point=${point.count}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
