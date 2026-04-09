'use client'
import { useState } from 'react'
import NavHeader from './NavHeader'

interface Office {
  id: number
  name: string
}

interface Props {
  offices: Office[]
}

export default function AdminExport({ offices }: Props) {
  const currentYear = new Date().getFullYear()
  const [selectedOffice, setSelectedOffice] = useState('')
  const [selectedYear, setSelectedYear] = useState(String(currentYear))
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  async function handleExport() {
    if (!selectedOffice) { setError('出張所を選択してください'); return }
    setError('')
    setLoading(true)

    try {
      const params = new URLSearchParams({
        office: selectedOffice,
        year: selectedYear,
        month: selectedMonth,
      })

      const res = await fetch(`/api/export?${params}`)

      if (res.status === 404) {
        setError('該当する期間のデータがありません')
        return
      }
      if (!res.ok) throw new Error()

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `維持作業対応記録表_${selectedOffice}_${selectedYear}年${selectedMonth}月分.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('エラーが発生しました。しばらくしてから再度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavHeader current="export" />

      <main className="max-w-lg mx-auto p-4 mt-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-bold text-lg text-gray-800 mb-6">Excelファイル出力</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">出張所を選択</label>
              <select
                value={selectedOffice}
                onChange={e => setSelectedOffice(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3"
              >
                <option value="">選択してください</option>
                {offices.map(o => (
                  <option key={o.id} value={o.name}>{o.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">年</label>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-3"
                >
                  {years.map(y => (
                    <option key={y} value={String(y)}>{y}年</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">月</label>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-3"
                >
                  {months.map(m => (
                    <option key={m} value={String(m)}>{m}月</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm bg-red-50 p-3 rounded">{error}</p>
            )}

            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 mt-2"
            >
              {loading ? '出力中...' : 'Excelをダウンロード'}
            </button>

            <p className="text-xs text-gray-500 text-center">
              ファイル名：維持作業対応記録表_{selectedOffice || '出張所名'}_{selectedYear}年{selectedMonth}月分.xlsx
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
