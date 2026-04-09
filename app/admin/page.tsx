export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import AdminRecordList from '@/components/AdminRecordList'

export default async function AdminPage() {
  const records = await prisma.inspectionRecord.findMany({
    where: { status: { in: ['draft', 'submitted'] } },
    orderBy: [{ subOffice: 'asc' }, { discoveryDate: 'asc' }],
    include: { photos: true },
  })

  const offices = await prisma.subOfficeMaster.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  return <AdminRecordList initialRecords={records} offices={offices} />
}
