'use client'

interface Props {
  current: 'input' | 'admin' | 'export' | 'offices'
}

export default function NavHeader({ current }: Props) {
  return (
    <header className="bg-blue-700 text-white shadow">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-sm font-bold leading-tight">
          維持作業対応 損傷・変状<br className="sm:hidden" />
          <span className="hidden sm:inline"> </span>措置状況 記録システム
        </h1>
        <nav className="flex gap-1 text-xs sm:text-sm flex-wrap">
          <a
            href="/input"
            className={`px-2 py-1 rounded ${current === 'input' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}
          >入力フォーム</a>
          <a
            href="/admin"
            className={`px-2 py-1 rounded ${current === 'admin' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}
          >データ一覧</a>
          <a
            href="/admin/export"
            className={`px-2 py-1 rounded ${current === 'export' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}
          >Excel出力</a>
          <a
            href="/admin/offices"
            className={`px-2 py-1 rounded ${current === 'offices' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}
          >出張所管理</a>
        </nav>
      </div>
    </header>
  )
}
