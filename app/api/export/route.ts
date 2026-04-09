// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import ExcelJS from 'exceljs'
import { join } from 'path'
import { readFile } from 'fs/promises'

// Blob URL または ローカルパスから画像Bufferを取得する共通関数
async function fetchImageBuffer(filePath: string): Promise<Buffer | null> {
  try {
    let buf: Buffer
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      // Vercel Blob URL → fetch で取得
      const res = await fetch(filePath)
      if (!res.ok) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buf = Buffer.from(await res.arrayBuffer()) as any
    } else {
      // ローカルパス（開発環境用）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buf = (await readFile(join(process.cwd(), 'public', 'uploads', filePath))) as any
    }
    return buf
  } catch {
    return null
  }
}

function formatJpDate(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

// テンプレートに用意されている写真シートの総数（expand_template.py で生成済み）
const TEMPLATE_PHOTO_SHEET_COUNT = 20

// ─────────────────────────────────────────────────────────────
// 写真シートにレコードデータ・画像を書き込む（全シート共通）
// ─────────────────────────────────────────────────────────────
async function fillPhotoSheet(
  workbook: ExcelJS.Workbook,
  ps: ExcelJS.Worksheet,
  record: {
    bridgeName: string
    damageType: string
    discoveryDate: Date | string
    photos: { type: string; filePath: string }[]
  },
  sheetNum: number
) {
  const discoveryDate = new Date(record.discoveryDate)

  // D1: 通し番号（テンプレートの 1/2/3 を正しい番号に上書き）
  ps.getCell('D1').value = sheetNum

  // B1: 橋梁名（テンプレートの VLOOKUP 式を実値に置き換え）
  ps.getCell('B1').value = record.bridgeName

  // B2: 損傷種別（同上）
  ps.getCell('B2').value = record.damageType

  // A6: 撮影日（同上）
  ps.getCell('A6').value = `${formatJpDate(discoveryDate)}撮影`

  // A4: 位置図
  const positionPhoto = record.photos.find(p => p.type === 'position')
  if (positionPhoto) {
    ps.getCell('A4').value = '' // テンプレートの説明テキストをクリア
    const buf = await fetchImageBuffer(positionPhoto.filePath)
    if (buf) {
      const ext = positionPhoto.filePath.split('?')[0].split('.').pop()?.toLowerCase()
      const imgId = workbook.addImage({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        buffer: buf as any,
        extension: (ext === 'png' ? 'png' : 'jpeg') as 'png' | 'jpeg',
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ps.addImage(imgId, { tl: { col: 0, row: 3 }, br: { col: 4, row: 4 } } as any)
    }
  }

  // 点検時写真・措置後写真を埋め込む
  const inspPhotos  = record.photos.filter(p => p.type === 'inspection')
  const afterPhotos = record.photos.filter(p => p.type === 'after')

  async function embed(
    photos: typeof inspPhotos,
    index: number,
    tl: { col: number; row: number },
    br: { col: number; row: number }
  ) {
    const photo = photos[index]
    if (!photo) return
    const buf = await fetchImageBuffer(photo.filePath)
    if (!buf) return
    const ext = photo.filePath.split('?')[0].split('.').pop()?.toLowerCase()
    const imgId = workbook.addImage({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buffer: buf as any,
      extension: (ext === 'png' ? 'png' : 'jpeg') as 'png' | 'jpeg',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ps.addImage(imgId, { tl, br } as any)
  }

  await embed(inspPhotos,  0, { col: 0, row: 6 }, { col: 2, row: 7 })
  await embed(afterPhotos, 0, { col: 2, row: 6 }, { col: 4, row: 7 })
  await embed(inspPhotos,  1, { col: 0, row: 7 }, { col: 2, row: 8 })
  await embed(afterPhotos, 1, { col: 2, row: 7 }, { col: 4, row: 8 })

  // 3枚目以降の写真は追加行に配置
  const maxExtra = Math.max(inspPhotos.length, afterPhotos.length) - 2
  for (let j = 0; j < maxExtra; j++) {
    const extraRow = 9 + j * 2
    ps.getRow(extraRow).height     = 21.0
    ps.getRow(extraRow + 1).height = 187.5
    try { ps.mergeCells(extraRow + 1, 1, extraRow + 1, 2) } catch { /* 既存結合 */ }
    try { ps.mergeCells(extraRow + 1, 3, extraRow + 1, 4) } catch { /* 既存結合 */ }
    await embed(inspPhotos,  2 + j, { col: 0, row: extraRow }, { col: 2, row: extraRow + 1 })
    await embed(afterPhotos, 2 + j, { col: 2, row: extraRow }, { col: 4, row: extraRow + 1 })
  }
}

// ─────────────────────────────────────────────────────────────
// メインハンドラー
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const office = searchParams.get('office')
  const year   = parseInt(searchParams.get('year')  || '0')
  const month  = parseInt(searchParams.get('month') || '0')

  if (!office || !year || !month) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0, 23, 59, 59)

  const records = await prisma.inspectionRecord.findMany({
    where: {
      subOffice: office,
      status: 'submitted',
      discoveryDate: { gte: startDate, lte: endDate },
    },
    orderBy: { discoveryDate: 'asc' },
    include: { photos: true },
  })

  if (records.length === 0) {
    return NextResponse.json({ error: '該当する期間のデータがありません' }, { status: 404 })
  }

  // ── テンプレートを読み込む ──
  const templatePath = join(process.cwd(), 'templates', 'record_template.xlsx')
  const templateBuf  = await readFile(templatePath)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(templateBuf)

  // Sheet1（記録表）を取得
  const ws = workbook.getWorksheet('Sheet1') ?? workbook.worksheets[0]

  // ── Sheet1 にデータを書き込む（行5〜） ──
  records.forEach((record, i) => {
    const rowNum = 5 + i
    const discoveryDate = new Date(record.discoveryDate)
    const measureDate   = record.measureDate ? new Date(record.measureDate) : null

    const values: [number, ExcelJS.CellValue][] = [
      [1,  record.mainOffice],
      [2,  record.subOffice],
      [3,  record.routeNo],
      [4,  record.bridgeName],
      [5,  record.damageType],
      [6,  record.location],
      [7,  formatJpDate(discoveryDate)],
      [8,  record.measureStatus || ''],
      [9,  measureDate ? formatJpDate(measureDate) : ''],
      [10, record.measurePlan || ''],
      [11, i + 1],
    ]

    values.forEach(([col, val]) => {
      const cell = ws.getCell(rowNum, col)
      cell.value = val
      if (!cell.font?.name) {
        cell.font = { name: 'ＭＳ Ｐゴシック', size: 9 }
      }
      cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true }
    })
  })

  // ── 写真シートの処理 ──
  // テンプレートにあらかじめ (1)〜(20) が用意されているので、そのまま使うだけ

  for (let i = 0; i < records.length; i++) {
    const sheetNum = i + 1
    const ps = workbook.getWorksheet(`(${sheetNum})`)!
    await fillPhotoSheet(workbook, ps, records[i], sheetNum)
  }

  // 使わなかったテンプレート写真シートを削除
  for (let i = records.length; i < TEMPLATE_PHOTO_SHEET_COUNT; i++) {
    const sheet = workbook.getWorksheet(`(${i + 1})`)
    if (sheet) workbook.removeWorksheet(sheet.id)
  }

  // ── 出力 ──
  const buffer   = await workbook.xlsx.writeBuffer()
  const fileName = encodeURIComponent(
    `維持作業対応(対策区分Ｍ相当)損傷・変状の措置状況　記録表_${office}_${year}年${month}月分.xlsx`
  )

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
    },
  })
}
