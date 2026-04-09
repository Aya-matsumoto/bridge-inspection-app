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
}

interface Record {
  id: number
  officeNo: number
  subOffice: string
  mainOffice: string
  routeNo: number
  bridgeName: string
  damageType: string
  location: string
  discoveryDate: string | Date
  notes: string | null
  status: string
  photos: Photo[]
}

interface Office {
  id: number
  name: string
}

interface Props {
  initialRecords: Record[]
  offices: Office[]
}

// 編集モーダル用の写真型
interface EditPhoto {
  id?: number      // 既存写真のDB ID（新規追加の場合はundefined）
  file?: File      // 新規追加ファイル
  preview: string  // 表示用URL
}

interface EditPosition {
  id?: number           // 既存位置図のDB ID
  originalFile?: File   // 新規ファイル or アノテーター用ファイル
  annotatedBlob?: Blob  // アノテーション済みBlob
  preview: string       // 表示用URL
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
      damageType: record.damageType,
      location: record.location,
      discoveryDate: record.discoveryDate,
      notes: record.notes,
    })
    // 既存の点検時写真
    const inspPhotos = record.photos
      .filter(p => p.type === 'inspection')
      .map(p => ({ id: p.id, preview: p.filePath }))
    setEditInspPhotos(inspPhotos)

    // 既存の位置図
    const posPhoto = record.photos.find(p => p.type === 'position')
    setEditPosition(posPhoto ? { id: posPhoto.id, preview: posPhoto.filePath } : null)
  }

  function closeEdit() {
    // 新規追加分の ObjectURL を解放
    editInspPhotos.forEach(p => { if (p.file) URL.revokeObjectURL(p.preview) })
    if (editPosition?.originalFile) URL.revokeObjectURL(editPosition.preview)
    setEditRecord(null)
    setEditInspPhotos([])
    setEditPosition(null)
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
      if (file.size > 10 * 1024 * 1024) {
        alert('10MB以下のファイルを選択してください')
        continue
      }
      newPhotos.push({ file, preview: URL.createObjectURL(file) })
    }
    if (editInspPhotos.length + newPhotos.length > 5) {
      alert('写真は最大5枚までです')
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
  }

  // ── 位置図：新規ファイル選択 ──
  function handlePositionChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('JPGまたはPNG形式のファイルを選択してください')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('20MB以下のファイルを選択してください')
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
      // 現在のプレビューURLから画像をfetchしてFileに変換
      const res = await fetch(editPosition.preview)
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
  function handleAnnotationSave(blob: Blob) {
    if (!editPosition) return
    if (editPosition.originalFile) URL.revokeObjectURL(editPosition.preview)
    const newPreview = URL.createObjectURL(blob)
    setEditPosition(prev => prev ? { ...prev, annotatedBlob: blob, preview: newPreview } : null)
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

      // 3. 新規点検時写真のアップロード
      for (const ep of editInspPhotos.filter(p => p.file)) {
        const fd = new FormData()
        fd.append('file', ep.file!)
        fd.append('recordId', String(editRecord.id))
        fd.append('type', 'inspection')
        await fetch('/api/photos', { method: 'POST', body: fd })
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
          ? new File([editPosition.annotatedBlob], 'position_diagram.png', { type: 'image/png' })
          : editPosition.originalFile!
        fd.append('file', fileToUpload)
        fd.append('recordId', String(editRecord.id))
        fd.append('type', 'position')
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

  // ── アノテーターが開いているときは全画面表示 ──
  if (showAnnotator && editPosition?.originalFile) {
    return (
      <ImageAnnotator
        imageFile={
          editPosition.annotatedBlob
            ? new File([editPosition.annotatedBlob], 'position_diagram.png', { type: 'image/png' })
            : editPosition.originalFile
        }
        onSave={handleAnnotationSave}
        onCancel={() => setShowAnnotator(false)}
      />
    )
  }

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
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden md:table-cell">損傷種別</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden md:table-cell">位置</th>
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
                    <td className="p-3 text-gray-600 text-xs hidden md:table-cell">{record.damageType}</td>
                    <td className="p-3 text-gray-600 text-xs hidden md:table-cell">{record.location}</td>
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
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(record)}
                          className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 whitespace-nowrap"
                        >編集</button>
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
                    <td colSpan={8} className="p-8 text-center text-gray-400 text-sm">データがありません</td>
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
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">橋梁名</label>
                <input type="text" value={editForm.bridgeName || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, bridgeName: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm" />
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
                <label className="block text-xs font-medium text-gray-700 mb-1">発見日</label>
                <input type="date"
                  value={typeof editForm.discoveryDate === 'string'
                    ? editForm.discoveryDate.split('T')[0]
                    : (editForm.discoveryDate ? new Date(editForm.discoveryDate).toISOString().split('T')[0] : '')}
                  onChange={e => setEditForm(prev => ({ ...prev, discoveryDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm" />
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
                  <span className="ml-1 text-gray-400 font-normal">JPG/PNG・10MB・最大5枚</span>
                </p>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {editInspPhotos.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={p.preview} alt=""
                        className="w-full h-14 object-cover rounded border"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <button
                        type="button"
                        onClick={() => removeInspPhoto(i)}
                        className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center leading-none"
                      >×</button>
                      {p.file && (
                        <span className="absolute bottom-0.5 left-0.5 bg-blue-500 text-white text-[9px] px-1 rounded">新規</span>
                      )}
                    </div>
                  ))}
                  {editInspPhotos.length < 5 && (
                    <label className="flex items-center justify-center w-full h-14 border-2 border-dashed border-gray-300 rounded cursor-pointer hover:bg-gray-50 text-gray-400 text-xs">
                      ＋追加
                      <input type="file" accept="image/jpeg,image/png" multiple
                        className="hidden" onChange={handleAddInspPhoto} />
                    </label>
                  )}
                </div>
                {editInspPhotos.length === 0 && (
                  <p className="text-xs text-gray-400">写真なし</p>
                )}
              </div>

              {/* ── 位置図 ── */}
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  🗺️ 位置図
                  <span className="ml-1 text-gray-400 font-normal">JPG/PNG・20MB</span>
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
