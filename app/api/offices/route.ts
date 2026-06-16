import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, parseAllowedOffices } from '@/lib/userAuth'

export async function GET() {
  const user = await getCurrentUser()
  const allowed = user ? parseAllowedOffices(user.allowedOffices) : null

  const offices = await prisma.subOfficeMaster.findMany({
    where: {
      isActive: true,
      ...(allowed ? { name: { in: allowed } } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(offices)
}

export async function POST(req: NextRequest) {
  const data = await req.json()
  const office = await prisma.subOfficeMaster.create({ data })
  return NextResponse.json(office)
}
