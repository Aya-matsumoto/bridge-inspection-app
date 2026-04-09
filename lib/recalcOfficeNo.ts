import { prisma } from './prisma'

/**
 * 指定した出張所の通し番号を発見日の昇順（古い順）で再計算・更新する
 */
export async function recalcOfficeNo(subOffice: string): Promise<void> {
  // 削除済み以外のレコードを発見日の古い順に取得
  const records = await prisma.inspectionRecord.findMany({
    where: {
      subOffice,
      status: { not: 'deleted' },
    },
    orderBy: { discoveryDate: 'asc' },
    select: { id: true },
  })

  // 順番に通し番号を 1 から振り直す
  for (let i = 0; i < records.length; i++) {
    await prisma.inspectionRecord.update({
      where: { id: records[i].id },
      data: { officeNo: i + 1 },
    })
  }
}
