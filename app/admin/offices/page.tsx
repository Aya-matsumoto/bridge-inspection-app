export const dynamic = 'force-dynamic'

import AdminOffices from '@/components/AdminOffices'
import { prisma } from '@/lib/prisma'

export default async function OfficesPage() {
  const offices = await prisma.subOfficeMaster.findMany({
    orderBy: { sortOrder: 'asc' },
  })

  return <AdminOffices initialOffices={offices} />
}
