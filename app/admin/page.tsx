export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, parseAllowedOffices } from '@/lib/userAuth'
import { sortRecordsBySpanNoWithinGroup } from '@/lib/utils'
import AdminRecordList from '@/components/AdminRecordList'

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
    include: { photos: { orderBy: { sortOrder: 'asc' } } },
  })

  sortRecordsBySpanNoWithinGroup(records)

  const offices = await prisma.subOfficeMaster.findMany({
    where: {
      isActive: true,
      ...(allowed ? { name: { in: allowed } } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  })

  return <AdminRecordList initialRecords={records} offices={offices} />
}
