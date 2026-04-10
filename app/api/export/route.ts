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
// 画像サイズ取得・配置ヘルパー
// ─────────────────────────────────────────────────────────────

const EMU_PER_PX = 9525  // 1ピクセル = 9525 EMU

// PNG / JPEG ヘッダーから画像の元サイズを取得
function getImageSize(buf: Buffer, ext: string): { w: number; h: number } | null {
  try {
    if (ext === 'png') {
      // PNG: バイト16-19が幅、20-23が高さ
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    }
    // JPEG: SOF マーカーを探す
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue }
      const m = buf[i + 1]
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
      }
      if (i + 3 >= buf.length) break
      i += 2 + buf.readUInt16BE(i + 2)
    }
  } catch { /* ignore */ }
  return null
}

// セル範囲のピクセルサイズを計算（addImage の 0-indexed 座標を受け取る）
function getCellAreaPx(
  ps: ExcelJS.Worksheet,
  tlCol: number, tlRow: number,
  brCol: number, brRow: number
): { cellW: number; cellH: number } {
  let cellW = 0
  for (let c = tlCol + 1; c <= brCol; c++) {
    cellW += Math.round(((ps.getColumn(c) as any).width ?? 8.43) * 7 + 5)
  }
  let cellH = 0
  for (let r = tlRow + 1; r <= brRow; r++) {
    cellH += Math.round(((ps.getRow(r) as any).height ?? 15) * 96 / 72)
  }
  return { cellW, cellH }
}

// 縦横比を保ちながらセルの 98% に収めて中央配置
function placeImageFit(
  ps: ExcelJS.Worksheet,
  imgId: number,
  buf: Buffer,
  ext: string,
  tlCol: number, tlRow: number,
  brCol: number, brRow: number
) {
  const { cellW, cellH } = getCellAreaPx(ps, tlCol, tlRow, brCol, brRow)
  const availW = cellW * 0.98
  const availH = cellH * 0.98

  const imgSize = getImageSize(buf, ext)
  if (imgSize && imgSize.w > 0 && imgSize.h > 0) {
    const scale   = Math.min(availW / imgSize.w, availH / imgSize.h)
    const scaledW = Math.round(imgSize.w * scale)
    const scaledH = Math.round(imgSize.h * scale)

    // 中央揃えのオフセット（ピクセル）
    const xOffPx = (cellW - scaledW) / 2
    const yOffPx = (cellH - scaledH) / 2

    // 先頭の列・行のピクセルサイズで割って小数の col/row 位置に変換
    // ExcelJS は tl.col / tl.row に小数を渡すことで列・行内の位置を指定できる
    const firstColPx = Math.round(((ps.getColumn(tlCol + 1) as any).width ?? 8.43) * 7 + 5)
    const firstRowPx = Math.round(((ps.getRow(tlRow + 1) as any).height ?? 15) * 96 / 72)

    ps.addImage(imgId, {
      tl: {
        col: tlCol + xOffPx / firstColPx,
        row: tlRow + yOffPx / firstRowPx,
      },
      ext: { width: scaledW, height: scaledH },
    } as any)
  } else {
    // 画像サイズ取得失敗時のフォールバック
    ps.addImage(imgId, { tl: { col: tlCol, row: tlRow }, br: { col: brCol, row: brRow } } as any)
  }
}

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

  // D1: 通し番号
  ps.getCell('D1').value = sheetNum
  // B1: 橋梁名
  ps.getCell('B1').value = record.bridgeName
  // B2: 損傷種別
  ps.getCell('B2').value = record.damageType
  // A6: 撮影日
  ps.getCell('A6').value = `${formatJpDate(discoveryDate)}撮影`

  // ── 画像を埋め込む共通処理 ──
  async function embedImage(
    filePath: string,
    tlCol: number, tlRow: number,
    brCol: number, brRow: number
  ) {
    const buf = await fetchImageBuffer(filePath)
    if (!buf) return
    const ext = filePath.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpeg'
    const imgId = workbook.addImage({
      buffer: buf as any,
      extension: (ext === 'png' ? 'png' : 'jpeg') as 'png' | 'jpeg',
    })
    placeImageFit(ps, imgId, buf, ext, tlCol, tlRow, brCol, brRow)
  }

  // A4: 位置図（A4:D4 → tlCol=0,tlRow=3,brCol=4,brRow=4）
  const positionPhoto = record.photos.find(p => p.type === 'position')
  if (positionPhoto) {
    ps.getCell('A4').value = ''
    await embedImage(positionPhoto.filePath, 0, 3, 4, 4)
  }

  // 点検時写真・措置後写真
  const inspPhotos  = record.photos.filter(p => p.type === 'inspection')
  const afterPhotos = record.photos.filter(p => p.type === 'after')

  async function embed(photos: typeof inspPhotos, index: number,
    tlCol: number, tlRow: number, brCol: number, brRow: number) {
    if (!photos[index]) return
    await embedImage(photos[index].filePath, tlCol, tlRow, brCol, brRow)
  }

  await embed(inspPhotos,  0, 0, 6, 2, 7)
  await embed(afterPhotos, 0, 2, 6, 4, 7)
  await embed(inspPhotos,  1, 0, 7, 2, 8)
  await embed(afterPhotos, 1, 2, 7, 4, 8)

  // 3枚目以降の写真は追加行に配置
  const maxExtra = Math.max(inspPhotos.length, afterPhotos.length) - 2
  for (let j = 0; j < maxExtra; j++) {
    const extraRow = 9 + j * 2
    ps.getRow(extraRow).height     = 21.0
    ps.getRow(extraRow + 1).height = 187.5
    try { ps.mergeCells(extraRow + 1, 1, extraRow + 1, 2) } catch { /* 既存結合 */ }
    try { ps.mergeCells(extraRow + 1, 3, extraRow + 1, 4) } catch { /* 既存結合 */ }
    await embed(inspPhotos,  2 + j, 0, extraRow, 2, extraRow + 1)
    await embed(afterPhotos, 2 + j, 2, extraRow, 4, extraRow + 1)
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
