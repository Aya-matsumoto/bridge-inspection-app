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
// 列幅は ExcelJS 内部と同じ w*7 換算を使用（+5 なし）
function getCellAreaPx(
  ps: ExcelJS.Worksheet,
  tlCol: number, tlRow: number,
  brCol: number, brRow: number
): { cellW: number; cellH: number } {
  const firstColWidth = ((ps.getColumn(tlCol + 1) as any).width ?? 8.43)
  let cellW = 0
  for (let c = tlCol + 1; c <= brCol; c++) {
    const w = ((ps.getColumn(c) as any).width ?? firstColWidth)
    cellW += w * 7   // ExcelJS 内部式に合わせる（w * 9525 * 7 EMU → px 換算）
  }
  let cellH = 0
  for (let r = tlRow + 1; r <= brRow; r++) {
    cellH += ((ps.getRow(r) as any).height ?? 15) * 96 / 72
  }
  return { cellW, cellH }
}

// ピクセルオフセット → ExcelJS ネイティブアンカー（EMU直接指定）に変換
// ※ ExcelJS の tl.col 小数変換（set col(v)）は
//    カスタム幅列で colWidth = Math.floor(w×10000) を使うため
//    EMU に対して約 1/6.7 倍になるバグがある。
//    代わりに nativeCol / nativeColOff を直接渡すことで正しい EMU を指定できる。
//    列EMU = charWidth × 66675（= charWidth × 7px × 9525 EMU/px）
function getColAnchor(
  ps: ExcelJS.Worksheet, tlCol: number, xOffPx: number, maxCol: number
): { nativeCol: number; nativeColOff: number } {
  const firstW = ((ps.getColumn(tlCol + 1) as any).width ?? 8.43)
  let remEMU = Math.round(xOffPx * EMU_PER_PX)
  for (let c1 = tlCol + 1; c1 <= maxCol; c1++) {
    const w = ((ps.getColumn(c1) as any).width ?? firstW)
    const colEMU = Math.round(w * 66675)   // charWidth × 9525 × 7
    if (remEMU < colEMU) return { nativeCol: c1 - 1, nativeColOff: remEMU }
    remEMU -= colEMU
  }
  return { nativeCol: maxCol - 1, nativeColOff: 0 }
}

// 行オフセット → ネイティブアンカー（行EMU = points × 12700）
function getRowAnchor(
  ps: ExcelJS.Worksheet, tlRow: number, yOffPx: number, maxRow: number
): { nativeRow: number; nativeRowOff: number } {
  const firstH = ((ps.getRow(tlRow + 1) as any).height ?? 15)
  let remEMU = Math.round(yOffPx * EMU_PER_PX)
  for (let r1 = tlRow + 1; r1 <= maxRow; r1++) {
    const h = ((ps.getRow(r1) as any).height ?? firstH)
    const rowEMU = Math.round(h * 12700)   // points × 12700 EMU/pt
    if (remEMU < rowEMU) return { nativeRow: r1 - 1, nativeRowOff: remEMU }
    remEMU -= rowEMU
  }
  return { nativeRow: maxRow - 1, nativeRowOff: 0 }
}

// 縦横比を保ちながらセルの 98% に収めて中央配置（{ tl, ext } 形式で正確なサイズを指定）
// editAs:"absolute" は後段の fixImageAnchors() で ZIP レベルで付与する
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

    // EMU を直接 nativeCol/nativeColOff で指定（ExcelJS の broken な col setter を回避）
    const colAnchor = getColAnchor(ps, tlCol, xOffPx, brCol)
    const rowAnchor = getRowAnchor(ps, tlRow, yOffPx, brRow)
    ps.addImage(imgId, {
      tl: {
        nativeCol: colAnchor.nativeCol,
        nativeColOff: colAnchor.nativeColOff,
        nativeRow: rowAnchor.nativeRow,
        nativeRowOff: rowAnchor.nativeRowOff,
      },
      ext: { width: scaledW, height: scaledH },
    } as any)
  } else {
    // 画像サイズ取得失敗時のフォールバック
    ps.addImage(imgId, { tl: { col: tlCol, row: tlRow }, br: { col: brCol, row: brRow } } as any)
  }
}

// ─────────────────────────────────────────────────────────────
// ZIP後処理：oneCellAnchor → twoCellAnchor editAs="absolute"
// ExcelJS が生成した { tl, ext } 形式（oneCellAnchor）は editAs が無効なため、
// バッファ生成後に ZIP 内のドローイング XML を直接書き換える
// ─────────────────────────────────────────────────────────────
async function fixImageAnchors(xlsxBuf: ArrayBuffer): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const JSZip = require('jszip')
  const zip = await JSZip.loadAsync(xlsxBuf)

  // ── シートと対応するドローイングのマッピングを _rels から取得 ──
  const drawToSheet = new Map<string, string>()
  for (const [name] of Object.entries(zip.files)) {
    const m = (name as string).match(/xl\/worksheets\/_rels\/sheet(\d+)\.xml\.rels$/)
    if (!m) continue
    const relsXml = await zip.files[name].async('string')
    const dm = relsXml.match(/Target="\.\.\/drawings\/drawing(\d+)\.xml"/)
    if (dm) {
      drawToSheet.set(`xl/drawings/drawing${dm[1]}.xml`, `xl/worksheets/sheet${m[1]}.xml`)
    }
  }

  const DEFAULT_COL_EMU = Math.round(8.43 * 66675)   // デフォルト列幅 EMU
  const DEFAULT_ROW_EMU = Math.round(15  * 12700)    // デフォルト行高 EMU

  for (const [drawPath, wsPath] of drawToSheet) {
    if (!zip.files[drawPath] || !zip.files[wsPath]) continue

    // ── ワークシートから列幅・行高を EMU で取得 ──
    const wsXml = await zip.files[wsPath].async('string')
    const colEMUs = new Map<number, number>()
    const rowEMUs = new Map<number, number>()

    // <col> 要素（属性順不問）
    for (const m of wsXml.matchAll(/<col\b([^/]*?)\/>/g)) {
      const a = m[1]
      const minM = a.match(/min="(\d+)"/)
      const maxM = a.match(/max="(\d+)"/)
      const wM   = a.match(/width="([^"]+)"/)
      if (minM && maxM && wM) {
        const emu = Math.round(parseFloat(wM[1]) * 66675)  // charWidth × 9525 × 7
        for (let c = parseInt(minM[1]) - 1; c < parseInt(maxM[1]); c++) colEMUs.set(c, emu)
      }
    }
    // <row> 要素（ht 属性がある行のみ）
    for (const m of wsXml.matchAll(/<row\b([^>]*?)>/g)) {
      const a = m[1]
      const rM  = a.match(/\br="(\d+)"/)
      const htM = a.match(/\bht="([^"]+)"/)
      if (rM && htM) rowEMUs.set(parseInt(rM[1]) - 1, Math.round(parseFloat(htM[1]) * 12700))
    }

    const getColEMU = (c: number) => colEMUs.get(c) ?? DEFAULT_COL_EMU
    const getRowEMU = (r: number) => rowEMUs.get(r) ?? DEFAULT_ROW_EMU

    // EMU 加算で to-アンカーを計算（セル境界を越えながら進む）
    function addEMU(idx: number, off: number, delta: number, getSize: (i: number) => number): [number, number] {
      let remain = off + delta
      let i = idx
      for (let guard = 0; guard < 200 && remain >= getSize(i); guard++) {
        remain -= getSize(i)
        i++
      }
      return [i, Math.round(remain)]
    }

    // ── ドローイング XML を書き換え ──
    const drawXml = await zip.files[drawPath].async('string')

    const newDrawXml = drawXml.replace(
      /<xdr:oneCellAnchor>([\s\S]*?)<\/xdr:oneCellAnchor>/g,
      (_, inner) => {
        // <xdr:from> をパース
        const fromM = inner.match(
          /<xdr:from>\s*<xdr:col>(\d+)<\/xdr:col>\s*<xdr:colOff>(\d+)<\/xdr:colOff>\s*<xdr:row>(\d+)<\/xdr:row>\s*<xdr:rowOff>(\d+)<\/xdr:rowOff>\s*<\/xdr:from>/
        )
        // <xdr:ext> をパース（cx/cy は EMU）
        const extM = inner.match(/<xdr:ext\s+cx="(\d+)"\s+cy="(\d+)"/)

        if (!fromM || !extM) return `<xdr:oneCellAnchor>${inner}</xdr:oneCellAnchor>` // パース失敗は変更しない

        const [fromCol, fromColOff, fromRow, fromRowOff] = [parseInt(fromM[1]), parseInt(fromM[2]), parseInt(fromM[3]), parseInt(fromM[4])]
        const [cx, cy] = [parseInt(extM[1]), parseInt(extM[2])]

        const [toCol, toColOff] = addEMU(fromCol, fromColOff, cx, getColEMU)
        const [toRow, toRowOff] = addEMU(fromRow, fromRowOff, cy, getRowEMU)

        const fromEl = inner.match(/(<xdr:from>[\s\S]*?<\/xdr:from>)/)[1]
        const picEl  = inner.match(/(<xdr:pic>[\s\S]*?<\/xdr:pic>)/)[1]

        return `<xdr:twoCellAnchor xdr:editAs="absolute">` +
          fromEl +
          `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>${toColOff}</xdr:colOff>` +
          `<xdr:row>${toRow}</xdr:row><xdr:rowOff>${toRowOff}</xdr:rowOff></xdr:to>` +
          picEl +
          `<xdr:clientData/></xdr:twoCellAnchor>`
      }
    )

    zip.file(drawPath, newDrawXml)
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// ─────────────────────────────────────────────────────────────
// 写真シートにレコードデータ・画像を書き込む（全シート共通）
// 新テンプレート（列A-E、5列構成）対応
// ─────────────────────────────────────────────────────────────
async function fillPhotoSheet(
  workbook: ExcelJS.Workbook,
  ps: ExcelJS.Worksheet,
  record: {
    bridgeName: string
    spanNo?: string | null
    damageType: string
    location?: string
    elementNo?: string | null
    discoveryDate: Date | string
    photos: { type: string; filePath: string }[]
  },
  sheetNum: number
) {
  const discoveryDate = new Date(record.discoveryDate)

  // 列幅を明示的に設定（テンプレートの範囲定義をExcelJSが正しく読めない場合の対策）
  ps.getColumn(1).width = 11.109375   // A
  ps.getColumn(2).width = 11.109375   // B
  ps.getColumn(3).width = 21.77734375 // C
  ps.getColumn(4).width = 21.77734375 // D
  ps.getColumn(5).width = 21.77734375 // E

  // C1: 橋梁名
  ps.getCell('C1').value = record.bridgeName
  // E1: 通し番号
  ps.getCell('E1').value = sheetNum
  // C2: 損傷種別
  ps.getCell('C2').value = record.damageType
  // A6: 撮影日（A6:C6 マージ）
  ps.getCell('A6').value = `${formatJpDate(discoveryDate)}撮影`

  // 点検時写真を先に取得（径間番号・要素番号の条件判定に使用）
  const inspPhotos = record.photos.filter(p => p.type === 'inspection')

  // 径間番号・要素番号の表示文字列を組み立て
  // 例: spanNo="1", location="竪壁", elementNo="0102" → "1径間　竪壁0102"
  const spanPart  = record.spanNo  ? `${record.spanNo}径間` : ''
  const elemPart  = [record.location, record.elementNo].filter(Boolean).join('')
  const spanElem  = [spanPart, elemPart].filter(Boolean).join('　')
  if (spanElem) {
    ps.getCell('B8').value = spanElem
    if (inspPhotos.length >= 2) {
      ps.getCell('B10').value = spanElem
    }
  }

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

  // 位置図: A4:E4 → tlCol=0, tlRow=3, brCol=5, brRow=4
  const positionPhoto = record.photos.find(p => p.type === 'position')
  if (positionPhoto) {
    await embedImage(positionPhoto.filePath, 0, 3, 5, 4)
  }

  // 点検時写真（左側 A-C 列）
  // 全景: A7:C7 → tlCol=0, tlRow=6, brCol=3, brRow=7
  // 近景: A9:C9 → tlCol=0, tlRow=8, brCol=3, brRow=9
  if (inspPhotos[0]) await embedImage(inspPhotos[0].filePath, 0, 6, 3, 7)
  if (inspPhotos[1]) await embedImage(inspPhotos[1].filePath, 0, 8, 3, 9)
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

  // テンプレートの例示行（5・6行目）をクリア
  ;[5, 6].forEach(rowNum => {
    ws.getRow(rowNum).eachCell({ includeEmpty: false }, cell => {
      cell.value = null
    })
  })

  // ── Sheet1 にデータを書き込む（行5〜） ──
  records.forEach((record, i) => {
    const rowNum = 5 + i
    const discoveryDate = new Date(record.discoveryDate)
    const measureDate   = record.measureDate ? new Date(record.measureDate) : null

    const values: [number, ExcelJS.CellValue][] = [
      [1,  record.mainOffice],          // A: 担当事務所名
      [2,  record.subOffice],           // B: 担当出張所名
      [3,  record.routeNo],             // C: 号線
      [4,  record.bridgeName],          // D: 橋梁名
      [5,  (record as any).spanNo || ''],    // E: 径間番号
      [6,  record.damageType],          // F: 損傷種別・内容
      [7,  record.location],            // G: 位置（部材・部位）
      [8,  (record as any).elementNo || ''], // H: 要素番号
      [9,  formatJpDate(discoveryDate)],// I: 発見日
      [10, record.measureStatus || ''], // J: 措置状況
      [11, measureDate ? formatJpDate(measureDate) : ''], // K: 措置日
      [12, record.measurePlan || ''],   // L: 措置予定
      [13, record.notes || String(i + 1)],  // M: 備考・写真No（通し番号のみ）
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

  // Sheet3（補助シート）を削除
  const sheet3 = workbook.getWorksheet('Sheet3')
  if (sheet3) workbook.removeWorksheet(sheet3.id)

  // ── 出力 ──
  // ExcelJS のバッファを生成後、ZIP レベルで画像を絶対位置固定に書き換える
  const rawBuffer = await workbook.xlsx.writeBuffer()
  const buffer    = await fixImageAnchors(rawBuffer)
  const fileName = encodeURIComponent(
    `維持作業対応(対策区分Ｍ相当)損傷・変状の措置状況　記録表_${office}_${year}年${month}月分.xlsx`
  )

  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
    },
  })
}
