export const dynamic = 'force-dynamic'

import AdminExport from '@/components/AdminExport'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, parseAllowedOffices } from '@/lib/userAuth'

export default async function ExportPage() {
  // ログインユーザーが閲覧可能な出張所のみに絞る（null = 制限なし）
  const user = await getCurrentUser()
  const allowed = user ? parseAllowedOffices(user.allowedOffices) : null

  const offices = await prisma.subOfficeMaster.findMany({
    where: {
      isActive: true,
      ...(allowed ? { name: { in: allowed } } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  })

  // 提出済みデータが存在する橋梁名を出張所ごとにまとめる（閲覧可能な出張所のみ）
  const rows = await prisma.inspectionRecord.findMany({
    where: {
      status: 'submitted',
      ...(allowed ? { subOffice: { in: allowed } } : {}),
    },
    select: { subOffice: true, bridgeName: true },
    distinct: ['subOffice', 'bridgeName'],
    orderBy: [{ subOffice: 'asc' }, { bridgeName: 'asc' }],
  })

  const bridgesByOffice: Record<string, string[]> = {}
  for (const { subOffice, bridgeName } of rows) {
    ;(bridgesByOffice[subOffice] ??= []).push(bridgeName)
  }

  return <AdminExport offices={offices} bridgesByOffice={bridgesByOffice} />
}
