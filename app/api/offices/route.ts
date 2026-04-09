import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const offices = await prisma.subOfficeMaster.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(offices)
}

export async function POST(req: NextRequest) {
  const data = await req.json()
  const office = await prisma.subOfficeMaster.create({ data })
  return NextResponse.json(office)
}
