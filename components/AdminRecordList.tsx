'use client'
import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import NavHeader from './NavHeader'
import ImageAnnotator from './ImageAnnotator'

interface Photo {
  id: number
  type: string
  filePath: string
  originalName: string
  annotationData?: string | null
  originalFilePath?: string | null
}

interface Record {
  id: number
  officeNo: number
  subOffice: string
  mainOffice: string
  routeNo: number
  bridgeName: string
  spanNo: string | null
  distanceMarker: string | null
  damageType: string
  location: string
  elementNo: string | null
  discoveryDate: string | Date
  taisaku: string | null
  notes: string | null
  status: string
  photos: Photo[]
}

interface Office {
  id: number
  name: string
  format?: string
  taisakuEnabled?: boolean
}

interface Props {
  initialRecords: Record[]
  offices: Office[]
}

// 編集モーダル用の写真型
interface EditPhoto {
  id?: number
  file?: File
  preview: string
  annotatedBlob?: Blob
  annotationData?: string
  originalFilePath?: string  // 元画像URL（再編集用）
}

interface EditPosition {
  id?: number
  originalFile?: File
  annotatedBlob?: Blob
  preview: string
  annotationData?: string
  originalFilePath?: string  // 元画像URL（再編集用）
}

export default function AdminRecordList({ initialRecords, offices }: Props) {
  const [records, setRecords] = useState(initialRecords)
  const [filterOffice, setFilterOffice] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [editRecord, setEditRecord] = useState<Record | null>(null)
  const [editForm, setEditForm] = useState<Partial<Record>>({})
  const [saving, setSaving] = useState(false)

  // 写真編集用 state
  const [editInspPhotos, setEditInspPhotos] = useState<EditPhoto[]>([])
  const [editPosition, setEditPosition] = useState<EditPosition | null>(null)
  const [showAnnotator, setShowAnnotator] = useState(false)
  const [loadingAnnotator, setLoadingAnnotator] = useState(false)
  const [showPhotoAnnotator, setShowPhotoAnnotator] = useState(false)
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState<number | null>(null)

  const filtered = records.filter(r => {
    if (!showDeleted && r.status === 'deleted') return false
    if (showDeleted && r.status !== 'deleted') return false
    if (filterOffice && r.subOffice !== filterOffice) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (!r.bridgeName.toLowerCase().includes(q) && !r.damageType.toLowerCase().includes(q)) return false
    }
    if (filterDateFrom && new Date(r.discoveryDate) < new Date(filterDateFrom)) return false
    if (filterDateTo && new Date(r.discoveryDate) > new Date(filterDateTo)) return false
    return true
  })

  function openEdit(record: Record) {
    setEditRecord(record)
    setEditForm({
      subOffice: record.subOffice,
      mainOffice: record.mainOffice,
      routeNo: record.routeNo,
      bridgeName: record.bridgeName,
      spanNo: record.spanNo,
      distanceMarker: record.distanceMarker,
      damageType: record.damageType,
      location: record.location,
      elementNo: record.elementNo,
      discoveryDate: record.discoveryDate,
      taisaku: record.taisaku,
      notes: record.notes,
    })
    // 既存の点検時写真
    const inspPhotos = record.photos
      .filter(p => p.type === 'inspection')
      .map(p => ({ id: p.id, preview: p.filePath, annotationData: p.annotationData ?? undefined, originalFilePath: p.originalFilePath ?? undefined }))
    setEditInspPhotos(inspPhotos)

    const posPhoto = record.photos.find(p => p.type === 'position')
    setEditPosition(posPhoto ? { id: posPhoto.id, preview: posPhoto.filePath, annotationData: posPhoto.annotationData ?? undefined, originalFilePath: posPhoto.originalFilePath ?? undefined } : null)
  }

  function closeEdit() {
    editInspPhotos.forEach(p => { if (p.file) URL.revokeObjectURL(p.preview) })
    if (editPosition?.originalFile) URL.revokeObjectURL(editPosition.preview)
    setEditRecord(null)
    setEditInspPhotos([])
    setEditPosition(null)
    setSelectedPhotoIdx(null)
  }

  // ── 点検時写真：追加 ──
  function handleAddInspPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const newPhotos: EditPhoto[] = []
    for (const file of files) {
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        alert('JPGまたはPNG形式のファイルを選択してください')
        continue
      }
      if (file.size > 1 * 1024 * 1024) {
        alert('1MB以下のファイルを選択してください')
        continue
      }
      newPhotos.push({ file, preview: URL.createObjectURL(file) })
    }
    if (editInspPhotos.length + newPhotos.length > 2) {
      alert('写真は最大2枚までです')
      return
    }
    setEditInspPhotos(prev => [...prev, ...newPhotos])
    e.target.value = ''
  }

  // ── 点検時写真：削除 ──
  function removeInspPhoto(index: number) {
    const photo = editInspPhotos[index]
    if (photo.file) URL.revokeObjectURL(photo.preview)
    setEditInspPhotos(prev => prev.filter((_, i) => i !== index))
    if (selectedPhotoIdx === index) setSelectedPhotoIdx(null)
    else if (selectedPhotoIdx !== null && selectedPhotoIdx > index) setSelectedPhotoIdx(selectedPhotoIdx - 1)
  }

  // ── 点検時写真：並び替え（1枚目＝全景・2枚目＝近景としてExcel出力されるため順序に意味がある）──
  function moveInspPhoto(index: number, direction: -1 | 1) {
    const target = index + direction
    setEditInspPhotos(prev => {
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setSelectedPhotoIdx(prev => {
      if (prev === index) return target
      if (prev === target) return index
      return prev
    })
  }

  // ── 点検時写真：アノテーション保存 ──
  async function handlePhotoAnnotationSave(blob: Blob, shapes: object[]) {
    if (selectedPhotoIdx === null) return
    const newPreview = URL.createObjectURL(blob)
    const annotationData = JSON.stringify(shapes)
    setEditInspPhotos(prev => prev.map((p, i) => {
      if (i !== selectedPhotoIdx) return p
      if (p.file) URL.revokeObjectURL(p.preview)
      return { ...p, annotatedBlob: blob, preview: newPreview, annotationData }
    }))
    setShowPhotoAnnotator(false)
  }

  // ── 点検時写真：既存画像をアノテーターで編集 ──
  async function openPhotoAnnotator() {
    if (selectedPhotoIdx === null) return
    const photo = editInspPhotos[selectedPhotoIdx]
    if (photo.file || photo.annotatedBlob) {
      setShowPhotoAnnotator(true)
      return
    }
    // 元画像URL（アノテーションなし）があればそちらを優先
    const bgUrl = photo.originalFilePath ?? photo.preview
    setLoadingAnnotator(true)
    try {
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(bgUrl)}`)
      const blob = await res.blob()
      const file = new File([blob], 'inspection_photo.jpg', { type: blob.type || 'image/jpeg' })
      setEditInspPhotos(prev => prev.map((p, i) => i === selectedPhotoIdx ? { ...p, file } : p))
      setShowPhotoAnnotator(true)
    } catch {
      alert('画像の読み込みに失敗しました')
    } finally {
      setLoadingAnnotator(false)
    }
  }

  // ── 位置図：新規ファイル選択 ──
  function handlePositionChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('JPGまたはPNG形式のファイルを選択してください')
      return
    }
    if (file.size > 1 * 1024 * 1024) {
      alert('1MB以下のファイルを選択してください')
      return
    }
    if (editPosition?.originalFile) URL.revokeObjectURL(editPosition.preview)
    const preview = URL.createObjectURL(file)
    // 既存のIDは保持しておく（保存時に削除するため）
    setEditPosition(prev => ({ id: prev?.id, originalFile: file, preview }))
    setShowAnnotator(true)
    e.target.value = ''
  }

  // ── 位置図：既存画像をアノテーターで編集 ──
  async function openAnnotatorForExisting() {
    if (!editPosition) return
    setLoadingAnnotator(true)
    try {
      // 元画像URL（アノテーションなし）があればそちらを優先
      const bgUrl = editPosition.originalFilePath ?? editPosition.preview
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(bgUrl)}`)
      const blob = await res.blob()
      const file = new File([blob], 'position_diagram.png', { type: blob.type || 'image/png' })
      setEditPosition(prev => prev ? { ...prev, originalFile: file } : null)
      setShowAnnotator(true)
    } catch {
      alert('画像の読み込みに失敗しました')
    } finally {
      setLoadingAnnotator(false)
    }
  }

  // ── アノテーター保存 ──
  function handleAnnotationSave(blob: Blob, shapes: object[]) {
    if (!editPosition) return
    if (editPosition.originalFile) URL.revokeObjectURL(editPosition.preview)
    const newPreview = URL.createObjectURL(blob)
    const annotationData = JSON.stringify(shapes)
    setEditPosition(prev => prev ? { ...prev, annotatedBlob: blob, preview: newPreview, annotationData } : null)
    setShowAnnotator(false)
  }

  // ── 位置図：削除 ──
  function removePosition() {
    if (editPosition?.originalFile) URL.revokeObjectURL(editPosition.preview)
    setEditPosition(null)
  }

  // ── 保存 ──
  async function saveEdit() {
    if (!editRecord) return
    setSaving(true)
    try {
      // 1. レコード本体の保存
      const res = await fetch(`/api/records/${editRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error()

      // 2. 点検時写真の削除（editInspPhotos に含まれなくなったIDを削除）
      const remainingIds = new Set(editInspPhotos.filter(p => p.id).map(p => p.id))
      const originalInspIds = editRecord.photos
        .filter(p => p.type === 'inspection')
        .map(p => p.id)
      const deleteInspIds = originalInspIds.filter(id => !remainingIds.has(id))
      for (const photoId of deleteInspIds) {
        await fetch(`/api/photos/${photoId}`, { method: 'DELETE' })
      }

      // 3. 点検時写真の保存（新規追加・注釈更新・並び順の反映）
      //    既存写真はその場更新（PATCH）にすることで id が変わらず、並び順が崩れない
      for (let i = 0; i < editInspPhotos.length; i++) {
        const ep = editInspPhotos[i]
        if (ep.id) {
          const fd = new FormData()
          if (ep.annotatedBlob) {
            fd.append('file', new File([ep.annotatedBlob], 'inspection_photo.jpg', { type: 'image/jpeg' }))
            if (ep.file) fd.append('originalFile', ep.file)
            if (ep.annotationData) fd.append('annotationData', ep.annotationData)
          }
          fd.append('sortOrder', String(i))
          const patchRes = await fetch(`/api/photos/${ep.id}`, { method: 'PATCH', body: fd })
          if (!patchRes.ok) throw new Error()
        } else if (ep.file) {
          const fd = new FormData()
          const fileToUpload = ep.annotatedBlob
            ? new File([ep.annotatedBlob], 'inspection_photo.jpg', { type: 'image/jpeg' })
            : ep.file
          fd.append('file', fileToUpload)
          fd.append('recordId', String(editRecord.id))
          fd.append('type', 'inspection')
          fd.append('sortOrder', String(i))
          if (ep.annotatedBlob) fd.append('originalFile', ep.file)
          if (ep.annotationData) fd.append('annotationData', ep.annotationData)
          const uploadRes = await fetch('/api/photos', { method: 'POST', body: fd })
          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({}))
            throw new Error(err.error ?? 'アップロード失敗')
          }
        }
      }

      // 4. 位置図の処理
      const originalPosPhoto = editRecord.photos.find(p => p.type === 'position')

      if (editPosition === null) {
        // 位置図を削除
        if (originalPosPhoto) {
          await fetch(`/api/photos/${originalPosPhoto.id}`, { method: 'DELETE' })
        }
      } else if (editPosition.originalFile || editPosition.annotatedBlob) {
        // 新規ファイル or アノテーション変更 → 旧ファイル削除 + 新ファイルアップロード
        const targetId = editPosition.id ?? originalPosPhoto?.id
        if (targetId) {
          await fetch(`/api/photos/${targetId}`, { method: 'DELETE' })
        }
        const fd = new FormData()
        const fileToUpload = editPosition.annotatedBlob
          ? new File([editPosition.annotatedBlob], 'position_diagram.jpg', { type: 'image/jpeg' })
          : editPosition.originalFile!
        fd.append('file', fileToUpload)
        fd.append('recordId', String(editRecord.id))
        fd.append('type', 'position')
        if (editPosition.annotatedBlob && editPosition.originalFile) fd.append('originalFile', editPosition.originalFile)
        if (editPosition.annotationData) fd.append('annotationData', editPosition.annotationData)
        await fetch('/api/photos', { method: 'POST', body: fd })
      }
      // 変更なしの場合（editPosition.id のみ）はそのまま

      // 5. 最新データを再取得して一覧を更新
      const refreshRes = await fetch(`/api/records/${editRecord.id}`)
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json()
        setRecords(prev => prev.map(r => r.id === refreshed.id ? refreshed : r))
      }

      closeEdit()
    } catch {
      alert('エラーが発生しました。しばらくしてから再度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  async function submitRecord(id: number) {
    if (!confirm('このレコードを送信済みにしますか？')) return
    try {
      const res = await fetch(`/api/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'submitted' }),
      })
      if (!res.ok) throw new Error()
      setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'submitted' } : r))
    } catch {
      alert('エラーが発生しました。しばらくしてから再度お試しください。')
    }
  }

  async function deleteRecord(id: number) {
    if (!confirm('このレコードを削除しますか？（取り消し可能）')) return
    try {
      const res = await fetch(`/api/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'deleted' }),
      })
      if (!res.ok) throw new Error()
      setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'deleted' } : r))
    } catch {
      alert('エラーが発生しました。しばらくしてから再度お試しください。')
    }
  }

  // ── 写真アノテーター ──
  if (showPhotoAnnotator && selectedPhotoIdx !== null) {
    const photo = editInspPhotos[selectedPhotoIdx]
    const imageFile = photo.annotatedBlob
      ? new File([photo.annotatedBlob], 'inspection_photo.jpg', { type: 'image/jpeg' })
      : photo.file!
    const initialShapes = photo.annotationData ? JSON.parse(photo.annotationData) : undefined
    return (
      <ImageAnnotator
        imageFile={imageFile}
        initialShapes={initialShapes}
        onSave={handlePhotoAnnotationSave}
        onCancel={() => setShowPhotoAnnotator(false)}
      />
    )
  }

  // ── 位置図アノテーターが開いているときは全画面表示 ──
  if (showAnnotator && editPosition?.originalFile) {
    const initialShapes = editPosition.annotationData ? JSON.parse(editPosition.annotationData) : undefined
    return (
      <ImageAnnotator
        imageFile={
          editPosition.annotatedBlob
            ? new File([editPosition.annotatedBlob], 'position_diagram.jpg', { type: 'image/jpeg' })
            : editPosition.originalFile
        }
        initialShapes={initialShapes}
        onSave={handleAnnotationSave}
        onCancel={() => setShowAnnotator(false)}
      />
    )
  }

  // 編集中レコードの出張所フォーマットで距離標の入力様式を切り替える
  const editFormat = offices.find(o => o.name === editForm.subOffice)?.format ?? 'normal'
  const editIsRange = editFormat === 'kp_range'
  const editIsPoint = editFormat === 'kp_point'
  // 編集中レコードの出張所で対応策欄が有効化されているか
  const editTaisakuEnabled = offices.find(o => o.name === editForm.subOffice)?.taisakuEnabled ?? false

  return (
    <div className="min-h-screen bg-gray-50">
      <NavHeader current="admin" />

      <main className="max-w-7xl mx-auto p-3">
        {/* フィルター */}
        <div className="bg-white rounded-lg shadow p-3 mb-3">
          <div className="flex flex-wrap gap-2 items-end">
            <select
              value={filterOffice}
              onChange={e => setFilterOffice(e.target.value)}
              className="border border-gray-300 rounded p-2 text-sm"
            >
              <option value="">全出張所</option>
              {offices.map(o => (
                <option key={o.id} value={o.name}>{o.name}</option>
              ))}
            </select>

            <input
              type="text"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="橋梁名・損傷種別で検索"
              className="border border-gray-300 rounded p-2 text-sm flex-1 min-w-[160px]"
            />

            <div className="flex items-center gap-1">
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="border border-gray-300 rounded p-2 text-sm"
                title="発見日 開始"
              />
              <span className="text-gray-500 text-sm">〜</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="border border-gray-300 rounded p-2 text-sm"
                title="発見日 終了"
              />
            </div>

            <label className="flex items-center gap-1 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={e => setShowDeleted(e.target.checked)}
                className="rounded"
              />
              削除済みを表示
            </label>

            <span className="text-sm text-gray-400 ml-auto">{filtered.length}件</span>
          </div>
        </div>

        {/* テーブル */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap">No.</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap">出張所</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap">橋梁名</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden md:table-cell">距離標</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden md:table-cell">損傷種別</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden md:table-cell">径間</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden md:table-cell">位置</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden md:table-cell">要素番号</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap">発見日</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap">状態</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map(record => (
                  <tr
                    key={record.id}
                    className={`hover:bg-gray-50 ${record.status === 'deleted' ? 'opacity-40' : ''}`}
                  >
                    <td className="p-3 text-gray-500 text-xs">{record.officeNo}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{record.subOffice}</td>
                    <td className="p-3 font-medium text-xs">{record.bridgeName}</td>
                    <td className="p-3 text-gray-600 text-xs hidden md:table-cell whitespace-nowrap">
                      {record.distanceMarker || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="p-3 text-gray-600 text-xs hidden md:table-cell">{record.damageType}</td>
                    <td className="p-3 text-gray-600 text-xs hidden md:table-cell whitespace-nowrap">
                      {record.spanNo || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="p-3 text-gray-600 text-xs hidden md:table-cell">{record.location}</td>
                    <td className="p-3 text-gray-600 text-xs hidden md:table-cell whitespace-nowrap">
                      {record.elementNo || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="p-3 text-gray-600 text-xs whitespace-nowrap">{formatDate(record.discoveryDate)}</td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded ${
                        record.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                        record.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                        'bg-red-100 text-red-600'
                      }`}>
                        {record.status === 'submitted' ? '送信済' : record.status === 'draft' ? '下書き' : '削除'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        <button
                          onClick={() => openEdit(record)}
                          className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 whitespace-nowrap"
                        >編集</button>
                        {record.status === 'draft' && (
                          <button
                            onClick={() => submitRecord(record.id)}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 whitespace-nowrap"
                          >送信済にする</button>
                        )}
                        {record.status !== 'deleted' && (
                          <button
                            onClick={() => deleteRecord(record.id)}
                            className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 whitespace-nowrap"
                          >削除</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-gray-400 text-sm">データがありません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* 編集モーダル */}
      {editRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-5 max-w-lg w-full shadow-xl my-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-base">レコード編集</h3>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">

              {/* ── テキスト項目 ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">担当出張所名</label>
                  <input type="text" value={editForm.subOffice || ''} readOnly
                    className="w-full border border-gray-200 rounded p-2 text-sm bg-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">号線</label>
                  <input
                    type="number"
                    value={editForm.routeNo || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, routeNo: parseInt(e.target.value) }))}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
              </div>
              {/* 距離標（起終点）: kp_range フォーマット */}
              {editIsRange && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    距離標
                    <span className="ml-1 text-green-600 font-normal">（起終点）</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={editForm.distanceMarker ? editForm.distanceMarker.split('kp～')[0] : ''}
                      onChange={e => {
                        const from = e.target.value
                        const to = editForm.distanceMarker ? editForm.distanceMarker.split('kp～')[1]?.replace('kp', '') : ''
                        if (from && to) {
                          setEditForm(prev => ({ ...prev, distanceMarker: `${parseFloat(from).toFixed(3)}kp～${parseFloat(to).toFixed(3)}kp` }))
                        } else {
                          setEditForm(prev => ({ ...prev, distanceMarker: null }))
                        }
                      }}
                      className="w-full border border-gray-300 rounded p-2 text-sm"
                      placeholder="0.000"
                    />
                    <span className="text-sm text-gray-500 whitespace-nowrap">kp ～</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={editForm.distanceMarker ? editForm.distanceMarker.split('kp～')[1]?.replace('kp', '') : ''}
                      onChange={e => {
                        const to = e.target.value
                        const from = editForm.distanceMarker ? editForm.distanceMarker.split('kp～')[0] : ''
                        if (from && to) {
                          setEditForm(prev => ({ ...prev, distanceMarker: `${parseFloat(from).toFixed(3)}kp～${parseFloat(to).toFixed(3)}kp` }))
                        } else {
                          setEditForm(prev => ({ ...prev, distanceMarker: null }))
                        }
                      }}
                      className="w-full border border-gray-300 rounded p-2 text-sm"
                      placeholder="0.000"
                    />
                    <span className="text-sm text-gray-500">kp</span>
                  </div>
                </div>
              )}
              {/* 距離標（ポイント）: kp_point フォーマット（開始kpのみ） */}
              {editIsPoint && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    距離標
                    <span className="ml-1 text-green-600 font-normal">（ポイント）</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={editForm.distanceMarker ? editForm.distanceMarker.replace('kp', '') : ''}
                      onChange={e => {
                        const v = e.target.value
                        setEditForm(prev => ({ ...prev, distanceMarker: v ? `${parseFloat(v).toFixed(3)}kp` : null }))
                      }}
                      className="w-full border border-gray-300 rounded p-2 text-sm"
                      placeholder="0.000"
                    />
                    <span className="text-sm text-gray-500">kp</span>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">橋梁名</label>
                <input type="text" value={editForm.bridgeName || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, bridgeName: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">径間番号</label>
                <input type="text" value={editForm.spanNo || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, spanNo: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm"
                  placeholder="例: 1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">損傷種別・内容</label>
                <input type="text" value={editForm.damageType || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, damageType: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">位置（部材・部位）</label>
                <input type="text" value={editForm.location || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">要素番号</label>
                <input type="text" value={editForm.elementNo || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, elementNo: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm"
                  placeholder="例: 0101" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">発見日</label>
                <input type="date"
                  value={typeof editForm.discoveryDate === 'string'
                    ? editForm.discoveryDate.split('T')[0]
                    : (editForm.discoveryDate ? new Date(editForm.discoveryDate).toISOString().split('T')[0] : '')}
                  onChange={e => setEditForm(prev => ({ ...prev, discoveryDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  対応策
                  {!editTaisakuEnabled && <span className="ml-1 text-gray-400 font-normal">（対象出張所のみ入力可）</span>}
                </label>
                <textarea value={editForm.taisaku || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, taisaku: e.target.value }))}
                  disabled={!editTaisakuEnabled}
                  maxLength={500}
                  rows={2}
                  className={`w-full border border-gray-300 rounded p-2 text-sm ${!editTaisakuEnabled ? 'bg-gray-100 text-gray-400' : ''}`}
                  placeholder={editTaisakuEnabled ? '自由記入（500字程度）' : ''} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">備考</label>
                <textarea value={editForm.notes || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded p-2 text-sm" />
              </div>

              {/* ── 点検時写真 ── */}
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  📷 写真（点検時）
                  <span className="ml-1 text-gray-400 font-normal">JPG/PNG・1MB・最大2枚</span>
                </p>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {editInspPhotos.map((p, i) => (
                    <div
                      key={i}
                      className={`relative cursor-pointer rounded border-2 transition-colors ${
                        selectedPhotoIdx === i ? 'border-blue-500' : 'border-transparent'
                      }`}
                      onClick={() => setSelectedPhotoIdx(i === selectedPhotoIdx ? null : i)}
                    >
                      <img src={p.preview} alt=""
                        className="w-full h-16 object-cover rounded"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <span className="absolute top-0.5 left-0.5 bg-gray-800/70 text-white text-[9px] px-1 rounded">
                        {i === 0 ? '①全景' : '②近景'}
                      </span>
                      {p.annotatedBlob && (
                        <span className="absolute bottom-0.5 left-0.5 bg-green-500 text-white text-[9px] px-1 rounded">✓書込済</span>
                      )}
                      {p.file && !p.annotatedBlob && (
                        <span className="absolute bottom-0.5 left-0.5 bg-blue-500 text-white text-[9px] px-1 rounded">新規</span>
                      )}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); removeInspPhoto(i) }}
                        className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center leading-none"
                      >×</button>
                      {editInspPhotos.length > 1 && (
                        <div className="absolute bottom-0.5 right-0.5 flex gap-0.5">
                          <button type="button" disabled={i === 0}
                            onClick={e => { e.stopPropagation(); moveInspPhoto(i, -1) }}
                            className="bg-gray-800/70 text-white rounded w-4 h-4 text-[9px] leading-none disabled:opacity-30">◀</button>
                          <button type="button" disabled={i === editInspPhotos.length - 1}
                            onClick={e => { e.stopPropagation(); moveInspPhoto(i, 1) }}
                            className="bg-gray-800/70 text-white rounded w-4 h-4 text-[9px] leading-none disabled:opacity-30">▶</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {editInspPhotos.length < 2 && (
                    <label className="flex items-center justify-center w-full h-16 border-2 border-dashed border-gray-300 rounded cursor-pointer hover:bg-gray-50 text-gray-400 text-xs">
                      ＋追加
                      <input type="file" accept="image/jpeg,image/png" multiple
                        className="hidden" onChange={handleAddInspPhoto} />
                    </label>
                  )}
                </div>
                {editInspPhotos.length === 0 && (
                  <p className="text-xs text-gray-400">写真なし</p>
                )}
                {editInspPhotos.length > 0 && (
                  <div>
                    <button
                      type="button"
                      disabled={selectedPhotoIdx === null || loadingAnnotator}
                      onClick={openPhotoAnnotator}
                      className="w-full bg-blue-600 text-white py-1.5 rounded text-xs font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {loadingAnnotator ? '読込中...' : selectedPhotoIdx !== null && editInspPhotos[selectedPhotoIdx]?.annotatedBlob
                        ? '✏️ 書き込みを編集'
                        : '✏️ 選択した写真に書き込む'}
                    </button>
                    {selectedPhotoIdx === null && (
                      <p className="text-xs text-gray-400 text-center mt-1">写真をクリックして選択してください</p>
                    )}
                  </div>
                )}
              </div>

              {/* ── 位置図 ── */}
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  🗺️ 位置図
                  <span className="ml-1 text-gray-400 font-normal">JPG/PNG・1MB</span>
                </p>
                {editPosition ? (
                  <div>
                    <div className="relative mb-2">
                      <img src={editPosition.preview} alt="位置図"
                        className="w-full rounded border border-gray-200 object-contain max-h-40"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      {editPosition.annotatedBlob && (
                        <span className="absolute top-1 left-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">
                          ✓ 書き込み済み
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={openAnnotatorForExisting}
                        disabled={loadingAnnotator}
                        className="flex-1 bg-blue-600 text-white py-1.5 rounded text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                      >
                        {loadingAnnotator ? '読込中...' : '✏️ 丸囲み・矢印・文字を書き込む'}
                      </button>
                      <label className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 cursor-pointer whitespace-nowrap">
                        差替
                        <input type="file" accept="image/jpeg,image/png"
                          className="hidden" onChange={handlePositionChange} />
                      </label>
                      <button
                        type="button"
                        onClick={removePosition}
                        className="px-3 py-1.5 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200 whitespace-nowrap"
                      >削除</button>
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center justify-center w-full h-12 border-2 border-dashed border-blue-300 rounded cursor-pointer hover:bg-blue-50 bg-blue-50">
                    <span className="text-xs text-blue-600 font-medium">＋ 位置図を追加</span>
                    <input type="file" accept="image/jpeg,image/png"
                      className="hidden" onChange={handlePositionChange} />
                  </label>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={closeEdit}
                className="flex-1 border border-gray-300 py-2 rounded text-sm hover:bg-gray-50">
                キャンセル
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
