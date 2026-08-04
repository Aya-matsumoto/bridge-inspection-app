export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function formatDateInput(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}

// 径間番号は「13-1」のような枝番付き文字列のため、DBの文字列ソートでは
// 二桁以上の数値が絡むと直感と異なる順序になる（例: "10" が "3" より前に来る）。
// 数値部分ごとに区切って比較する自然順ソートで数値として正しい順序にする。
export function naturalCompareSpanNo(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  const ax = a.match(/(\d+)|(\D+)/g) || []
  const bx = b.match(/(\d+)|(\D+)/g) || []
  const len = Math.max(ax.length, bx.length)
  for (let i = 0; i < len; i++) {
    const av = ax[i]
    const bv = bx[i]
    if (av === undefined) return -1
    if (bv === undefined) return 1
    const an = Number(av)
    const bn = Number(bv)
    if (!isNaN(an) && !isNaN(bn)) {
      if (an !== bn) return an - bn
    } else if (av !== bv) {
      return av < bv ? -1 : 1
    }
  }
  return 0
}

// discoveryDate・bridgeName は呼び出し側の Prisma orderBy で既にDBの照合順序に
// 従って並んでいる前提。その順序を崩さないよう、同じ日付・橋梁名のレコード同士の
// ときだけ径間番号で並べ替え、それ以外は0（順序維持）を返す
// （Array#sort の安定ソート性を利用）。
export function sortRecordsBySpanNoWithinGroup<
  T extends { discoveryDate: Date; bridgeName: string; spanNo: string | null }
>(records: T[]): T[] {
  records.sort((a, b) => {
    if (a.discoveryDate.getTime() === b.discoveryDate.getTime() && a.bridgeName === b.bridgeName) {
      return naturalCompareSpanNo(a.spanNo, b.spanNo)
    }
    return 0
  })
  return records
}
