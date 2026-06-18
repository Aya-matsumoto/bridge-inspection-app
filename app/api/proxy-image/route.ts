import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ error: 'fetch failed' }, { status: 502 })

  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    headers: { 'Content-Type': contentType },
  })
}
