'use client'
import { useState } from 'react'
import NavHeader from './NavHeader'

interface Office {
  id: number
  name: string
}

interface Props {
  offices: Office[]
  bridgesByOffice: Record<string, string[]>
}

type Mode = 'period' | 'bridge'

export default function AdminExport({ offices, bridgesByOffice }: Props) {
  const currentYear = new Date().getFullYear()
  const [mode, setMode] = useState<Mode>('period')
  const [selectedOffice, setSelectedOffice] = useState('')
  const [selectedYear, setSelectedYear] = useState(String(currentYear))
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1))
  const [selectedBridges, setSelectedBridges] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  const bridgeOptions = selectedOffice ? (bridgesByOffice[selectedOffice] ?? []) : []

  function handleOfficeChange(name: string) {
    setSelectedOffice(name)
    setSelectedBridges([]) // 出張所を変えたら橋梁選択をクリア
    setError('')
  }

  function toggleBridge(name: string) {
    setSelectedBridges(prev =>
      prev.includes(name) ? prev.filter(b => b !== name) : [...prev, name]
    )
  }

  async function handleExport() {
    if (!selectedOffice) { setError('出張所を選択してください'); return }
    if (mode === 'bridge' && selectedBridges.length === 0) {
      setError('橋梁を1つ以上選択してください'); return
    }
    setError('')
    setLoading(true)

    try {
      const params = new URLSearchParams({ office: selectedOffice })
      let downloadName: string

      if (mode === 'period') {
        params.set('year', selectedYear)
        params.set('month', selectedMonth)
        downloadName = `維持作業対応記録表_${selectedOffice}_${selectedYear}年${selectedMonth}月分.xlsx`
      } else {
        selectedBridges.forEach(b => params.append('bridge', b))
        const bridgeLabel = selectedBridges.length === 1
          ? selectedBridges[0]
          : `${selectedBridges[0]}他${selectedBridges.length - 1}件`
        downloadName = `維持作業対応記録表_${selectedOffice}_${bridgeLabel}.xlsx`
      }

      const res = await fetch(`/api/export?${params}`)

      if (res.status === 404) {
        setError('該当するデータがありません')
        return
      }
      if (res.status === 403) {
        setError('この出張所を閲覧する権限がありません')
        return
      }
      if (!res.ok) throw new Error()

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('エラーが発生しました。しばらくしてから再度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  const fileNamePreview = mode === 'period'
    ? `維持作業対応記録表_${selectedOffice || '出張所名'}_${selectedYear}年${selectedMonth}月分.xlsx`
    : `維持作業対応記録表_${selectedOffice || '出張所名'}_${
        selectedBridges.length === 0
          ? '橋梁名'
          : selectedBridges.length === 1
            ? selectedBridges[0]
            : `${selectedBridges[0]}他${selectedBridges.length - 1}件`
      }.xlsx`

  return (
    <div className="min-h-screen bg-gray-50">
      <NavHeader current="export" />

      <main className="max-w-lg mx-auto p-4 mt-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-bold text-lg text-gray-800 mb-6">Excelファイル出力</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">出力条件</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('period'); setError('') }}
                  className={`py-2 rounded-lg border font-medium text-sm ${
                    mode === 'period'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  出張所＋年月
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('bridge'); setError('') }}
                  className={`py-2 rounded-lg border font-medium text-sm ${
                    mode === 'bridge'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  橋梁名
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">出張所を選択</label>
              <select
                value={selectedOffice}
                onChange={e => handleOfficeChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3"
              >
                <option value="">選択してください</option>
                {offices.map(o => (
                  <option key={o.id} value={o.name}>{o.name}</option>
                ))}
              </select>
            </div>

            {mode === 'period' ? (
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
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  橋梁を選択（複数可・全期間を出力）
                </label>
                {!selectedOffice ? (
                  <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
                    先に出張所を選択してください
                  </p>
                ) : bridgeOptions.length === 0 ? (
                  <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
                    この出張所には提出済みデータがありません
                  </p>
                ) : (
                  <div className="border border-gray-300 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                    {bridgeOptions.map(name => (
                      <label
                        key={name}
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedBridges.includes(name)}
                          onChange={() => toggleBridge(name)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-gray-800">{name}</span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedBridges.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{selectedBridges.length}件選択中</p>
                )}
              </div>
            )}

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

            <p className="text-xs text-gray-500 text-center break-all">
              ファイル名：{fileNamePreview}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
