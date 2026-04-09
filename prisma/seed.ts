import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const offices = [
    { name: '京都第一', mainOffice: '京都', sortOrder: 1 },
    { name: '京都第二', mainOffice: '京都', sortOrder: 2 },
    { name: '橿原', mainOffice: '奈良', sortOrder: 3 },
    { name: '奈良', mainOffice: '奈良', sortOrder: 4 },
  ]

  for (const office of offices) {
    await prisma.subOfficeMaster.upsert({
      where: { name: office.name },
      update: {},
      create: office,
    })
  }

  console.log('Seed completed')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
