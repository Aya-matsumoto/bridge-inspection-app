'use client'
import { useState, useEffect } from 'react'
import NavHeader from '@/components/NavHeader'
import ImageAnnotator from '@/components/ImageAnnotator'

interface SubOffice {
  id: number
  name: string
  mainOffice: string
}

interface PhotoPreview {
  file: File
  preview: string
}

interface PositionDiagram {
  originalFile: File
  annotatedBlob?: Blob       // アノテーション済みの Blob
  preview: string            // 表示用プレビューURL
}

const TITLE = '維持作業対応(対策区分『Ｍ』相当)損傷・変状の措置状況　記録表'

const th: React.CSSProperties = {
  border: '1px solid #999',
  padding: '4px 6px',
  textAlign: 'center',
  verticalAlign: 'middle',
  fontSize: '11px',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  border: '1px solid #999',
  padding: '4px',
  verticalAlign: 'middle',
}

export default function InputPage() {
  const [offices, setOffices] = useState<SubOffice[]>([])
  const [formData, setFormData] = useState({
    subOffice: '',
    mainOffice: '',
    routeNo: '',
    bridgeName: '',
    damageType: '',
    location: '',
    discoveryDate: '',
    notes: '',
  })
  const [inspectionPhotos,  setInspectionPhotos]  = useState<PhotoPreview[]>([])
  const [positionDiagram,   setPositionDiagram]   = useState<PositionDiagram | null>(null)
  const [showAnnotator,     setShowAnnotator]     = useState(false)
  const [errors,            setErrors]            = useState<Record<string, string>>({})
  const [saving,            setSaving]            = useState(false)
  const [submitted,         setSubmitted]         = useState(false)
  const [submittedOffice,   setSubmittedOffice]   = useState('')
  const [inspDragOver,      setInspDragOver]      = useState(false)
  const [posDragOver,       setPosDragOver]       = useState(false)

  useEffect(() => {
    fetch('/api/offices')
      .then(r => r.json())
      .then(data => setOffices(data))
  }, [])

  const today = new Date().toISOString().split('T')[0]

  function handleOfficeChange(name: string) {
    const office = offices.find(o => o.name === name)
    setFormData(prev => ({
      ...prev,
      subOffice: name,
      mainOffice: office?.mainOffice || '',
    }))
  }

  function validateForm() {
    const errs: Record<string, string> = {}
    if (!formData.subOffice)                           errs.subOffice     = '担当出張所名を選択してください'
    if (!formData.routeNo)                             errs.routeNo       = '号線を入力してください'
    else if (!/^\d+$/.test(formData.routeNo) || parseInt(formData.routeNo) <= 0)
                                                       errs.routeNo       = '正の整数を入力してください'
    if (!formData.bridgeName.trim())                   errs.bridgeName    = '橋梁名を入力してください'
    if (!formData.damageType.trim())                   errs.damageType    = '損傷種別・内容を入力してください'
    if (!formData.location.trim())                     errs.location      = '位置を入力してください'
    if (!formData.discoveryDate)                       errs.discoveryDate = '発見日を入力してください'
    else if (formData.discoveryDate > today)           errs.discoveryDate = '未来の日付は入力できません'
    return errs
  }

  // ── 点検時写真：ファイルを処理する共通関数 ──
  function processInspectionFiles(files: File[]) {
    const newErrors: Record<string, string> = {}
    const validFiles: PhotoPreview[] = []
    for (const file of files) {
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        newErrors.photo_inspection = 'JPGまたはPNG形式のファイルを選択してください'
        continue
      }
      if (file.size > 10 * 1024 * 1024) {
        newErrors.photo_inspection = '10MB以下のファイルを選択してください'
        continue
      }
      validFiles.push({ file, preview: URL.createObjectURL(file) })
    }
    if (inspectionPhotos.length + validFiles.length > 2) {
      newErrors.photo_inspection = '写真は最大2枚までです'
    } else {
      setInspectionPhotos(prev => [...prev, ...validFiles])
    }
    if (Object.keys(newErrors).length > 0) setErrors(prev => ({ ...prev, ...newErrors }))
  }

  function handleInspectionPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    processInspectionFiles(Array.from(e.target.files || []))
  }

  function handleInspectionDrop(e: React.DragEvent) {
    e.preventDefault()
    setInspDragOver(false)
    processInspectionFiles(Array.from(e.dataTransfer.files))
  }

  function removeInspectionPhoto(index: number) {
    setInspectionPhotos(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  // ── 位置図：ファイルを処理する共通関数 ──
  function processPositionFile(file: File) {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setErrors(prev => ({ ...prev, position: 'JPGまたはPNG形式のファイルを選択してください' }))
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, position: '20MB以下のファイルを選択してください' }))
      return
    }
    if (positionDiagram) URL.revokeObjectURL(positionDiagram.preview)
    setPositionDiagram({ originalFile: file, preview: URL.createObjectURL(file) })
    setErrors(prev => { const e = { ...prev }; delete e.position; return e })
    setShowAnnotator(true)
  }

  function handlePositionDiagramChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processPositionFile(file)
  }

  function handlePositionDrop(e: React.DragEvent) {
    e.preventDefault()
    setPosDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processPositionFile(file)
  }

  // アノテーター保存コールバック
  function handleAnnotationSave(blob: Blob) {
    if (!positionDiagram) return
    // 古いプレビューURLを解放
    URL.revokeObjectURL(positionDiagram.preview)
    const newPreview = URL.createObjectURL(blob)
    setPositionDiagram(prev => prev
      ? { ...prev, annotatedBlob: blob, preview: newPreview }
      : null
    )
    setShowAnnotator(false)
  }

  function removePositionDiagram() {
    if (positionDiagram) URL.revokeObjectURL(positionDiagram.preview)
    setPositionDiagram(null)
  }

  async function saveRecord(status: 'draft' | 'submitted') {
    const errs = validateForm()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setSaving(true)
    try {
      const body = {
        ...formData,
        routeNo: parseInt(formData.routeNo),
        discoveryDate: formData.discoveryDate,
        measureStatus: '未',
        measureDate: null,
        measurePlan: null,
        notes: formData.notes || null,
        status,
      }
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const record = await res.json()

      // 点検時写真をアップロード
      for (const { file } of inspectionPhotos) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('recordId', String(record.id))
        fd.append('type', 'inspection')
        await fetch('/api/photos', { method: 'POST', body: fd })
      }

      // 位置図をアップロード（アノテーション済みがあればそちらを優先）
      if (positionDiagram) {
        const fd = new FormData()
        const fileToUpload = positionDiagram.annotatedBlob
          ? new File([positionDiagram.annotatedBlob], 'position_diagram.png', { type: 'image/png' })
          : positionDiagram.originalFile
        fd.append('file', fileToUpload)
        fd.append('recordId', String(record.id))
        fd.append('type', 'position')
        await fetch('/api/photos', { method: 'POST', body: fd })
      }

      if (status === 'submitted') {
        setSubmitted(true)
        setSubmittedOffice(formData.subOffice)
      } else {
        alert('一時保存しました')
      }
    } catch {
      alert('エラーが発生しました。しばらくしてから再度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = (field: string) =>
    `w-full border-0 p-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 ${errors[field] ? 'bg-red-50' : 'bg-white'}`

  // ────────────────────────────────────────────────
  // アノテーターが開いている間はキャンバス全画面を表示
  // ────────────────────────────────────────────────
  if (showAnnotator && positionDiagram) {
    return (
      <ImageAnnotator
        imageFile={positionDiagram.annotatedBlob
          ? new File([positionDiagram.annotatedBlob], 'position_diagram.png', { type: 'image/png' })
          : positionDiagram.originalFile}
        onSave={handleAnnotationSave}
        onCancel={() => setShowAnnotator(false)}
      />
    )
  }

  // ────────────────────────────────────────────────
  // 送信完了画面
  // ────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavHeader current="input" />
        <div className="flex items-center justify-center p-8">
          <div className="bg-white rounded-lg shadow p-8 max-w-md w-full text-center">
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">送信しました</h2>
            <p className="text-gray-600 mb-6">データが正常に送信されました。</p>
            <div className="flex flex-col gap-3">
              <a
                href="/input"
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
              >
                新しいデータを入力する
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────
  // メインフォーム
  // ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <NavHeader current="input" />

      <main className="max-w-5xl mx-auto p-3">

        {/* エラーサマリー */}
        {Object.keys(errors).length > 0 && (
          <div className="mb-3 bg-red-50 border border-red-300 rounded p-3">
            <p className="text-red-600 text-sm font-bold mb-1">入力エラーがあります</p>
            {Object.values(errors).map((e, i) => (
              <p key={i} className="text-red-500 text-xs">・{e}</p>
            ))}
          </div>
        )}

        {/* ── Excel表形式 入力テーブル ── */}
        <div className="bg-white shadow rounded overflow-hidden mb-4">
          <div className="overflow-x-auto">
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '720px' }}>
              <colgroup>
                <col style={{ width: '90px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '60px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '115px' }} />
                <col style={{ width: '110px' }} />
              </colgroup>
              <thead>
                {/* タイトル行 */}
                <tr style={{ height: '28px', background: '#f0f4f8' }}>
                  <th colSpan={8} style={{ ...th, fontSize: '12px', background: '#f0f4f8', letterSpacing: '0.02em' }}>
                    {TITLE}
                  </th>
                </tr>
                {/* 大ヘッダー */}
                <tr style={{ height: '24px' }}>
                  <th rowSpan={2} style={{ ...th, background: '#dce6f1' }}>担当<br />事務所名</th>
                  <th rowSpan={2} style={{ ...th, background: '#dce6f1' }}>担当<br />出張所名</th>
                  <th rowSpan={2} style={{ ...th, background: '#dce6f1' }}>号線</th>
                  <th rowSpan={2} style={{ ...th, background: '#fde9d9' }}>橋梁名</th>
                  <th colSpan={3} style={{ ...th, background: '#dce6f1', fontWeight: 'bold' }}>損傷・変状</th>
                  <th rowSpan={2} style={{ ...th, background: '#dce6f1' }}>備考<br />(写真No.等)</th>
                </tr>
                {/* 中ヘッダー */}
                <tr style={{ height: '30px' }}>
                  <th style={{ ...th, background: '#dce6f1' }}>損傷種別・内容</th>
                  <th style={{ ...th, background: '#dce6f1' }}>位置<br />(部材・部位)</th>
                  <th style={{ ...th, background: '#dce6f1' }}>発見日</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ height: '48px' }}>
                  {/* 担当事務所名 */}
                  <td style={td}>
                    <input type="text" value={formData.mainOffice} readOnly
                      className="w-full border-0 p-1 text-sm bg-gray-100 text-gray-600 focus:outline-none"
                      placeholder="自動入力" />
                  </td>
                  {/* 担当出張所名 */}
                  <td style={td}>
                    <select value={formData.subOffice} onChange={e => handleOfficeChange(e.target.value)}
                      className={`w-full border-0 p-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 ${errors.subOffice ? 'bg-red-50' : 'bg-white'}`}>
                      <option value="">選択...</option>
                      {offices.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                    </select>
                  </td>
                  {/* 号線 */}
                  <td style={td}>
                    <input type="number" min="1" value={formData.routeNo}
                      onChange={e => setFormData(prev => ({ ...prev, routeNo: e.target.value }))}
                      className={inputClass('routeNo')} placeholder="1" />
                  </td>
                  {/* 橋梁名 */}
                  <td style={td}>
                    <input type="text" value={formData.bridgeName}
                      onChange={e => setFormData(prev => ({ ...prev, bridgeName: e.target.value }))}
                      className={inputClass('bridgeName')} placeholder="○○橋" />
                  </td>
                  {/* 損傷種別 */}
                  <td style={td}>
                    <input type="text" value={formData.damageType}
                      onChange={e => setFormData(prev => ({ ...prev, damageType: e.target.value }))}
                      className={inputClass('damageType')} placeholder="例: 路面の凹凸" />
                  </td>
                  {/* 位置 */}
                  <td style={td}>
                    <input type="text" value={formData.location}
                      onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                      className={inputClass('location')} placeholder="例: 路面" />
                  </td>
                  {/* 発見日 */}
                  <td style={td}>
                    <input type="date" value={formData.discoveryDate} max={today}
                      onChange={e => setFormData(prev => ({ ...prev, discoveryDate: e.target.value }))}
                      className={inputClass('discoveryDate')} />
                  </td>
                  {/* 備考 */}
                  <td style={td}>
                    <input type="text" value={formData.notes}
                      onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full border-0 p-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      placeholder="メモ" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 写真・位置図セクション ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">

          {/* 点検時写真 */}
          <div className="bg-white rounded shadow p-4">
            <p className="text-sm font-bold text-gray-700 mb-2">
              📷 写真（点検時）
              <span className="ml-2 text-xs font-normal text-gray-500">任意・JPG/PNG・10MB以下・最大2枚</span>
            </p>
            <label
              className={`flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded cursor-pointer mb-2 transition-colors ${
                inspDragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
              onDragOver={e => { e.preventDefault(); setInspDragOver(true) }}
              onDragLeave={() => setInspDragOver(false)}
              onDrop={handleInspectionDrop}
            >
              <span className="text-xl mb-1">📂</span>
              <span className="text-xs text-gray-500">ここにドロップ、または<span className="text-blue-500 underline">クリックして選択</span></span>
              <input type="file" accept="image/jpeg,image/png" multiple
                className="hidden" onChange={handleInspectionPhotoChange} />
            </label>
            {errors.photo_inspection && <p className="text-red-500 text-xs mb-1">{errors.photo_inspection}</p>}
            {inspectionPhotos.length > 0 && (
              <div className="grid grid-cols-4 gap-1">
                {inspectionPhotos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.preview} alt="" className="w-full h-16 object-cover rounded" />
                    <button type="button" onClick={() => removeInspectionPhoto(i)}
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center leading-none">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 位置図 */}
          <div className="bg-white rounded shadow p-4">
            <p className="text-sm font-bold text-gray-700 mb-2">
              🗺️ 位置図
              <span className="ml-2 text-xs font-normal text-gray-500">任意・JPG/PNG・20MB以下</span>
            </p>

            {!positionDiagram ? (
              <>
                <label
                  className={`flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded cursor-pointer mb-2 transition-colors ${
                    posDragOver
                      ? 'border-blue-500 bg-blue-100'
                      : 'border-blue-300 bg-blue-50 hover:bg-blue-100'
                  }`}
                  onDragOver={e => { e.preventDefault(); setPosDragOver(true) }}
                  onDragLeave={() => setPosDragOver(false)}
                  onDrop={handlePositionDrop}
                >
                  <span className="text-xl mb-1">🗺️</span>
                  <span className="text-xs text-blue-600 font-medium">ここにドロップ、または<span className="underline">クリックして選択</span></span>
                  <input type="file" accept="image/jpeg,image/png"
                    className="hidden" onChange={handlePositionDiagramChange} />
                </label>
                {errors.position && <p className="text-red-500 text-xs">{errors.position}</p>}
              </>
            ) : (
              <div>
                {/* プレビュー */}
                <div className="relative mb-2">
                  <img src={positionDiagram.preview} alt="位置図" className="w-full rounded border border-gray-200 object-contain max-h-40" />
                  {positionDiagram.annotatedBlob && (
                    <span className="absolute top-1 left-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">
                      ✓ 書き込み済み
                    </span>
                  )}
                </div>
                {/* 操作ボタン */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAnnotator(true)}
                    className="flex-1 bg-blue-600 text-white py-2 rounded text-xs font-bold hover:bg-blue-700"
                  >
                    ✏️ {positionDiagram.annotatedBlob ? '書き込みを編集' : '丸囲み・矢印・文字を書き込む'}
                  </button>
                  <button
                    type="button"
                    onClick={removePositionDiagram}
                    className="px-3 py-2 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                  >
                    削除
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── ボタン ── */}
        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => saveRecord('draft')} disabled={saving}
            className="flex-1 bg-gray-500 text-white py-3 rounded-lg font-bold text-sm hover:bg-gray-600 disabled:opacity-50">
            {saving ? '保存中...' : '一時保存'}
          </button>
          <button
            type="button"
            onClick={() => saveRecord('submitted')}
            disabled={saving}
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50"
          >{saving ? '送信中...' : '送信'}</button>
        </div>
      </main>

    </div>
  )
}
