// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hashPassword } from '@/lib/userAuth'

// ユーザー更新
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser()
  if (!me?.isAdmin) return NextResponse.json({ error: '権限がありません' }, { status: 403 })

  const { password, displayName, allowedOffices, isAdmin, isActive } = await req.json()
  const id = parseInt(params.id)

  const updates: string[] = []
  const values: any[] = []
  let idx = 1

  if (displayName !== undefined) { updates.push(`"displayName" = $${idx++}`); values.push(displayName) }
  if (allowedOffices !== undefined) { updates.push(`"allowedOffices" = $${idx++}`); values.push(allowedOffices) }
  if (isAdmin !== undefined) { updates.push(`"isAdmin" = $${idx++}`); values.push(Boolean(isAdmin)) }
  if (isActive !== undefined) { updates.push(`"isActive" = $${idx++}`); values.push(Boolean(isActive)) }
  if (password) { updates.push(`password = $${idx++}`); values.push(hashPassword(password)) }

  updates.push(`"updatedAt" = $${idx++}`)
  values.push(new Date())
  values.push(id)

  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET ${updates.join(', ')} WHERE id = $${idx}`,
    ...values
  )
  return NextResponse.json({ success: true })
}

// ユーザー削除
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser()
  if (!me?.isAdmin) return NextResponse.json({ error: '権限がありません' }, { status: 403 })

  const id = parseInt(params.id)
  if (me.id === id) return NextResponse.json({ error: '自分自身は削除できません' }, { status: 400 })

  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id = $1`, id)
  return NextResponse.json({ success: true })
}
