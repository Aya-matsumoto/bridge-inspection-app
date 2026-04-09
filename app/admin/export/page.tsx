import AdminExport from '@/components/AdminExport'
import { prisma } from '@/lib/prisma'

export default async function ExportPage() {
  const offices = await prisma.subOfficeMaster.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  return <AdminExport offices={offices} />
}
