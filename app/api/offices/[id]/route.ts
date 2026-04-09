import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const data = await req.json()
  const office = await prisma.subOfficeMaster.update({ where: { id }, data })
  return NextResponse.json(office)
}
