export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, parseAllowedOffices } from '@/lib/userAuth'
import AdminRecordList from '@/components/AdminRecordList'

// 径間番号は「13-1」のような枝番付き文字列のため、DBの文字列ソートでは
// 二桁以上の数値が絡むと直感と異なる順序になる（例: "10" が "3" より前に来る）。
// 数値部分ごとに区切って比較する自然順ソートで数値として正しい順序にする。
function naturalCompareSpanNo(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  const ax = a.match(/(\d+)|(\D+)/g) || []
  const bx = b.match(/(\d+)|(\D+)/g) || []
  const len = Math.max(ax.length, bx.length)
  for (let i = 0; i < len; i++) {
    const av = ax[i]
    const bv = bx[i]
    if (av === undefined) return -1
    if (bv === undefined) return 1
    const an = Number(av)
    const bn = Number(bv)
    if (!isNaN(an) && !isNaN(bn)) {
      if (an !== bn) return an - bn
    } else if (av !== bv) {
      return av < bv ? -1 : 1
    }
  }
  return 0
}

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const allowed = parseAllowedOffices(user.allowedOffices)

  const records = await prisma.inspectionRecord.findMany({
    where: {
      status: { in: ['draft', 'submitted'] },
      ...(allowed ? { subOffice: { in: allowed } } : {}),
    },
    orderBy: [{ discoveryDate: 'asc' }, { bridgeName: 'asc' }],
    include: { photos: true },
  })

  // 日付・橋梁名は既にPrismaのorderByでDBの照合順序に従って並んでいる。
  // この順序を崩さないよう、同じ日付・橋梁名のレコード同士のときだけ径間番号で
  // 並べ替え、それ以外は0（順序維持）を返す（Array#sort の安定ソート性を利用）。
  records.sort((a, b) => {
    if (a.discoveryDate.getTime() === b.discoveryDate.getTime() && a.bridgeName === b.bridgeName) {
      return naturalCompareSpanNo(a.spanNo, b.spanNo)
    }
    return 0
  })

  const offices = await prisma.subOfficeMaster.findMany({
    where: {
      isActive: true,
      ...(allowed ? { name: { in: allowed } } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  })

  return <AdminRecordList initialRecords={records} offices={offices} />
}
