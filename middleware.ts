import { NextRequest, NextResponse } from 'next/server'
import { USER_SESSION_COOKIE } from '@/lib/userAuth'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ログインページ・API・静的ファイルは認証不要
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // セッションCookieがなければログインページへ
  const sessionCookie = req.cookies.get(USER_SESSION_COOKIE)
  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
