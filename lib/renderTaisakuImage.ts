import sharp from 'sharp'
import { join } from 'path'

const FONT_FILE = join(process.cwd(), 'lib', 'fonts', 'MPLUS1p-Regular.ttf')
const FONT_FAMILY = 'MPLUS1p'

function escapeMarkup(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 対応策テキストを画像化する（widthPx×heightPx の枠に収まるようフォントサイズを自動調整）
// sharp のネイティブテキスト描画（Pango + fontfile 直接指定）を使うことで、
// SVGへのフォント埋め込みのような複雑な仕組みを使わずに済み、実行環境（Vercel/Netlify）に
// 日本語フォントが入っていなくても、同梱したフォントファイルだけで確実に描画できる。
//
// 注意: sharp の text 合成は height を渡すと、指定したフォントサイズを無視して
// 常にその高さいっぱいまで自動拡大／縮小してしまう。フォントサイズを明示的に
// 制御するため、height は渡さず width だけ指定し、実際の描画結果の高さを見て
// 収まっているか判定する。
export async function renderTaisakuImage(
  text: string,
  widthPx: number,
  heightPx: number
): Promise<Buffer> {
  const escaped = escapeMarkup(text)

  // 大きいフォントサイズから順に試し、指定した高さに収まる最大サイズを採用する
  const candidateSizes = [16.5, 15, 13.5, 12, 10.5, 9]
  let chosenBuf: Buffer | null = null
  let chosenMeta: { width: number; height: number } | null = null

  for (const size of candidateSizes) {
    const buf = await sharp({
      text: {
        text: `<span font_desc="${FONT_FAMILY} ${size}">${escaped}</span>`,
        width: widthPx,
        fontfile: FONT_FILE,
        rgba: true,
        wrap: 'word-char',
        align: 'left',
      },
    })
      .png()
      .toBuffer()
    const meta = await sharp(buf).metadata()
    chosenBuf = buf
    chosenMeta = { width: meta.width ?? widthPx, height: meta.height ?? heightPx }
    if (chosenMeta.height <= heightPx) break // 高さに収まった＝これ以上小さくしなくてよい
  }

  // 白背景のキャンバスに配置して指定サイズちょうどの画像にする
  // （収まらなかった場合は上端から heightPx 分だけを切り出す）
  const top = 0
  const cropHeight = Math.min(chosenMeta!.height, heightPx)
  const cropped = await sharp(chosenBuf!)
    .extract({ left: 0, top, width: chosenMeta!.width, height: cropHeight })
    .toBuffer()

  return sharp({
    create: {
      width: widthPx,
      height: heightPx,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([{ input: cropped, left: 0, top: 0 }])
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .png()
    .toBuffer()
}
