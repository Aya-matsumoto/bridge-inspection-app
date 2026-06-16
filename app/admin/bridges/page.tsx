'use client'
// @ts-nocheck
import { useState, useEffect, useRef } from 'react'
import NavHeader from '@/components/NavHeader'

interface Bridge {
  id?: number
  sortOrder: string
  subOffice: string
  bridgeName: string
  routeNo: number
  distanceMarker: string | null
}

// CSVテンプレートの内容
const CSV_TEMPLATE = `整理番号,担当出張所名,橋梁名,号線,距離標_開始kp,距離標_終了kp
1,第一出張所,○○橋,3,,
2,第二出張所,△△橋,7,,
3,京都第一,□□橋,5,1.234,5.678
`

export default function BridgesPage() {
  const [bridges, setBridges] = useState<Bridge[]>([])
  const [preview, setPreview] = useState<Bridge[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadBridges()
  }, [])

  function loadBridges() {
    setLoading(true)
    fetch('/api/bridges')
      .then(r => r.json())
      .then(data => {
        if (data?.error) {
          setMessage({ type: 'error', text: `データ取得エラー: ${data.error}` })
          setBridges([])
        } else {
          setBridges(Array.isArray(data) ? data : [])
        }
        setLoading(false)
      })
      .catch(e => {
        setMessage({ type: 'error', text: `通信エラー: ${String(e)}` })
        setLoading(false)
      })
  }

  // CSVテンプレートをダウンロード
  function downloadTemplate() {
    const bom = '﻿' // Excel で文字化けしないよう BOM 付き
    const blob = new Blob([bom + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '橋梁マスタ_テンプレート.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // CSVファイルを読み込んでプレビュー
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text)
      setPreview(parsed)
      setMessage(null)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  // CSV文字列をパース
  function parseCSV(text: string): Bridge[] {
    // BOM除去
    const cleaned = text.replace(/^﻿/, '')
    const lines = cleaned.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []
    // 1行目はヘッダー（スキップ）
    const rows: Bridge[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',')
      const sortOrderStr = cols[0]?.trim() || ''
      const subOffice    = cols[1]?.trim() || ''
      const bridgeName   = cols[2]?.trim() || ''
      const routeNoStr   = cols[3]?.trim() || ''
      const fromKp       = cols[4]?.trim() || ''
      const toKp         = cols[5]?.trim() || ''

      if (!subOffice || !bridgeName || !routeNoStr) continue
      const routeNo = parseInt(routeNoStr)
      if (isNaN(routeNo)) continue
      const sortOrder = sortOrderStr

      // 距離標：開始・終了両方ある場合のみ作成
      let distanceMarker: string | null = null
      if (fromKp && toKp) {
        const from = parseFloat(fromKp)
        const to   = parseFloat(toKp)
        if (!isNaN(from) && !isNaN(to)) {
          distanceMarker = `${from.toFixed(3)}kp～${to.toFixed(3)}kp`
        }
      }

      rows.push({ sortOrder, subOffice, bridgeName, routeNo, distanceMarker })
    }
    return rows
  }

  // プレビューデータをDBに保存
  async function savePreview() {
    if (preview.length === 0) return
    if (!confirm(`${preview.length}件の橋梁データを登録します。\n既存のデータはすべて置き換えられます。よろしいですか？`)) return
    setSaving(true)
    try {
      const res = await fetch('/api/bridges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preview),
      })
      if (!res.ok) throw new Error()
      const result = await res.json()
      if (result?.error) throw new Error(result.error)
      setPreview([])
      setMessage({ type: 'success', text: `${result.count}件の橋梁データを登録しました。` })
      // 登録後にDBから再取得して最新データを表示
      loadBridges()
    } catch {
      setMessage({ type: 'error', text: 'エラーが発生しました。もう一度お試しください。' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavHeader current="bridges" />

      <main className="max-w-5xl mx-auto p-4">
        <h2 className="text-lg font-bold text-gray-800 mb-4">橋梁マスタ管理（CSV取込）</h2>

        {/* 操作エリア */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <p className="text-sm text-gray-600 mb-3">
            CSVファイルから橋梁の一覧（出張所名・橋梁名・号線・距離標）を取り込みます。<br />
            取り込むと<span className="text-red-500 font-bold">既存データはすべて置き換え</span>られます。
          </p>

          <div className="flex flex-wrap gap-3">
            {/* テンプレートダウンロード */}
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
            >
              📥 CSVテンプレートをダウンロード
            </button>

            {/* CSVアップロード */}
            <label className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 cursor-pointer">
              📂 CSVファイルを選択
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        </div>

        {/* メッセージ */}
        {message && (
          <div className={`mb-4 p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-300' : 'bg-red-50 text-red-700 border border-red-300'}`}>
            {message.type === 'success' ? '✓ ' : '⚠ '}{message.text}
          </div>
        )}

        {/* プレビュー（CSVを読み込んだ後） */}
        {preview.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-sm text-gray-700">
                📋 取込プレビュー（{preview.length}件）
                <span className="ml-2 text-xs font-normal text-gray-500">内容を確認して「登録する」を押してください</span>
              </h3>
              <div className="flex gap-2">
                <button onClick={() => setPreview([])}
                  className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-300 rounded">
                  キャンセル
                </button>
                <button onClick={savePreview} disabled={saving}
                  className="text-xs bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                  {saving ? '登録中...' : '✓ 登録する'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-2 text-center w-16">整理番号</th>
                    <th className="border border-gray-300 p-2 text-left">担当出張所名</th>
                    <th className="border border-gray-300 p-2 text-left">橋梁名</th>
                    <th className="border border-gray-300 p-2 text-center w-12">号線</th>
                    <th className="border border-gray-300 p-2 text-left">距離標</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((b, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="border border-gray-300 p-2 text-center text-gray-500">{b.sortOrder || <span className="text-gray-300">—</span>}</td>
                      <td className="border border-gray-300 p-2">{b.subOffice}</td>
                      <td className="border border-gray-300 p-2">{b.bridgeName}</td>
                      <td className="border border-gray-300 p-2 text-center">{b.routeNo}</td>
                      <td className="border border-gray-300 p-2">{b.distanceMarker || <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 現在登録済みのデータ */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-sm text-gray-700 mb-3">
            現在登録されている橋梁
            {!loading && <span className="ml-2 font-normal text-gray-500">（{bridges.length}件）</span>}
          </h3>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">読み込み中...</p>
          ) : bridges.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              まだデータがありません。CSVテンプレートをダウンロードして取り込んでください。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-2 text-center w-16">整理番号</th>
                    <th className="border border-gray-300 p-2 text-left">担当出張所名</th>
                    <th className="border border-gray-300 p-2 text-left">橋梁名</th>
                    <th className="border border-gray-300 p-2 text-center w-12">号線</th>
                    <th className="border border-gray-300 p-2 text-left">距離標</th>
                  </tr>
                </thead>
                <tbody>
                  {bridges.map((b, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="border border-gray-300 p-2 text-center text-gray-500">{b.sortOrder || <span className="text-gray-300">—</span>}</td>
                      <td className="border border-gray-300 p-2">{b.subOffice}</td>
                      <td className="border border-gray-300 p-2">{b.bridgeName}</td>
                      <td className="border border-gray-300 p-2 text-center">{b.routeNo}</td>
                      <td className="border border-gray-300 p-2 whitespace-nowrap">{b.distanceMarker || <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
