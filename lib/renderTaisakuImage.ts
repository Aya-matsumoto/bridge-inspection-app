import subsetFont from 'subset-font'
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'

let fullFontCache: Buffer | null = null
function loadFullFont(): Buffer {
  if (!fullFontCache) {
    fullFontCache = readFileSync(join(process.cwd(), 'lib', 'fonts', 'NotoSansJP-Regular.ttf'))
  }
  return fullFontCache
}

// テキストを指定幅(px)で行に分割する（半角文字はfontSizeの55%、それ以外は100%の簡易幅で計算）
function wrapText(text: string, maxWidthPx: number, fontSize: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let current = ''
    let currentWidth = 0
    for (const ch of paragraph) {
      const charWidth = /[\x00-\xff]/.test(ch) ? fontSize * 0.55 : fontSize
      if (currentWidth + charWidth > maxWidthPx && current) {
        lines.push(current)
        current = ch
        currentWidth = charWidth
      } else {
        current += ch
        currentWidth += charWidth
      }
    }
    lines.push(current)
  }
  return lines
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 対応策テキストを画像化する（widthPx×heightPx の枠に収まるようフォントサイズを自動調整）
// フォントは使用する文字だけを抜き出したサブセットをその場で生成して埋め込むため、
// 実行環境（Vercel/Netlify）に日本語フォントが入っていなくても正しく表示される。
export async function renderTaisakuImage(
  text: string,
  widthPx: number,
  heightPx: number
): Promise<Buffer> {
  const padding = 4
  const usableWidth = widthPx - padding * 2
  const usableHeight = heightPx - padding * 2

  const fullFont = loadFullFont()
  const subsetBuf = await subsetFont(fullFont, text, {
    targetFormat: 'sfnt',
    variationAxes: { wght: 400 },
  })
  const b64 = subsetBuf.toString('base64')

  // 大きいフォントサイズから順に試し、枠に収まる最大サイズを採用する
  // （どのサイズでも収まらない場合は最小サイズのまま行を切り詰める）
  const candidateSizes = [16.5, 15, 13.5, 12, 10.5, 9]
  let fontSize = candidateSizes[candidateSizes.length - 1]
  let lines: string[] = []
  for (const size of candidateSizes) {
    const lineHeight = size * 1.3
    const candidateLines = wrapText(text, usableWidth, size)
    fontSize = size
    lines = candidateLines
    if (candidateLines.length * lineHeight <= usableHeight) break
  }
  const lineHeight = fontSize * 1.3
  const maxLines = Math.max(1, Math.floor(usableHeight / lineHeight))
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
  }

  const textElements = lines
    .map((line, i) => `<text x="${padding}" y="${padding + fontSize + i * lineHeight}">${escapeXml(line)}</text>`)
    .join('\n')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}">
    <defs>
      <style>
        @font-face {
          font-family: 'TaisakuFont';
          src: url(data:font/ttf;base64,${b64}) format('truetype');
        }
        text { font-family: 'TaisakuFont'; font-size: ${fontSize}px; fill: #000000; }
      </style>
    </defs>
    <rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="#ffffff"/>
    ${textElements}
  </svg>`

  return sharp(Buffer.from(svg)).flatten({ background: '#ffffff' }).png().toBuffer()
}
