declare module 'subset-font' {
  interface SubsetFontOptions {
    targetFormat?: 'sfnt' | 'woff' | 'woff2' | 'truetype'
    preserveNameIds?: number[]
    variationAxes?: Record<string, number | { min?: number; max?: number; default?: number }>
    noLayoutClosure?: boolean
  }
  function subsetFont(buffer: Buffer, text: string, options?: SubsetFontOptions): Promise<Buffer>
  export default subsetFont
}
