'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  current: 'input' | 'admin' | 'export' | 'offices' | 'bridges' | 'users'
}

export default function NavHeader({ current }: Props) {
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // 平文Cookieからユーザー情報を読み取る
    const getCookie = (name: string) => {
      const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
      return match ? decodeURIComponent(match[1]) : ''
    }
    setUserName(getCookie('u_name'))
    setIsAdmin(getCookie('u_admin') === '1')
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/user-logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-blue-700 text-white shadow">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-sm font-bold leading-tight">
          維持作業対応 損傷・変状<br className="sm:hidden" />
          <span className="hidden sm:inline"> </span>措置状況 記録システム
        </h1>
        <nav className="flex gap-1 text-xs sm:text-sm flex-wrap items-center">
          <a href="/input"
            className={`px-2 py-1 rounded ${current === 'input' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}>
            入力フォーム
          </a>
          <a href="/admin"
            className={`px-2 py-1 rounded ${current === 'admin' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}>
            データ一覧
          </a>
          <a href="/admin/export"
            className={`px-2 py-1 rounded ${current === 'export' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}>
            Excel出力
          </a>
          {isAdmin && (
            <>
              <a href="/admin/offices"
                className={`px-2 py-1 rounded ${current === 'offices' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}>
                出張所管理
              </a>
              <a href="/admin/bridges"
                className={`px-2 py-1 rounded ${current === 'bridges' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}>
                橋梁マスタ
              </a>
              <a href="/admin/users"
                className={`px-2 py-1 rounded ${current === 'users' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}>
                ユーザー管理
              </a>
            </>
          )}
          {/* ユーザー名＋ログアウト */}
          {userName && (
            <span className="flex items-center gap-2 ml-2 pl-2 border-l border-blue-500">
              <span className="text-blue-200 text-xs">{userName}</span>
              <button onClick={handleLogout}
                className="bg-blue-800 hover:bg-blue-900 text-white text-xs px-2 py-1 rounded">
                ログアウト
              </button>
            </span>
          )}
        </nav>
      </div>
    </header>
  )
}
