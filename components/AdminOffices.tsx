'use client'
import { useState } from 'react'
import NavHeader from './NavHeader'

interface Office {
  id: number
  name: string
  mainOffice: string
  isActive: boolean
  sortOrder: number
}

interface Props {
  initialOffices: Office[]
}

export default function AdminOffices({ initialOffices }: Props) {
  const [offices, setOffices] = useState(initialOffices)
  const [showForm, setShowForm] = useState(false)
  const [editOffice, setEditOffice] = useState<Office | null>(null)
  const [form, setForm] = useState({ name: '', mainOffice: '', sortOrder: '0' })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      if (editOffice) {
        const res = await fetch(`/api/offices/${editOffice.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, sortOrder: parseInt(form.sortOrder) }),
        })
        if (!res.ok) throw new Error()
        const updated = await res.json()
        setOffices(prev => prev.map(o => o.id === updated.id ? updated : o))
      } else {
        const res = await fetch('/api/offices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, sortOrder: parseInt(form.sortOrder) }),
        })
        if (!res.ok) throw new Error()
        const created = await res.json()
        setOffices(prev => [...prev, created])
      }
      setShowForm(false)
      setEditOffice(null)
      setForm({ name: '', mainOffice: '', sortOrder: '0' })
    } catch {
      alert('エラーが発生しました。')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(office: Office) {
    try {
      const res = await fetch(`/api/offices/${office.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !office.isActive }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setOffices(prev => prev.map(o => o.id === updated.id ? updated : o))
    } catch {
      alert('エラーが発生しました。')
    }
  }

  function openEdit(office: Office) {
    setEditOffice(office)
    setForm({ name: office.name, mainOffice: office.mainOffice, sortOrder: String(office.sortOrder) })
    setShowForm(true)
  }

  function openNew() {
    setEditOffice(null)
    setForm({ name: '', mainOffice: '', sortOrder: String(offices.length + 1) })
    setShowForm(true)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavHeader current="offices" />

      <main className="max-w-2xl mx-auto p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-gray-700">出張所一覧</h2>
          <button
            onClick={openNew}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
          >+ 出張所を追加</button>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-600">出張所名</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">担当事務所</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">表示順</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">状態</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {offices.map(office => (
                <tr key={office.id} className={!office.isActive ? 'opacity-50' : ''}>
                  <td className="p-3 font-medium">{office.name}</td>
                  <td className="p-3 text-gray-600">{office.mainOffice}</td>
                  <td className="p-3 text-gray-600">{office.sortOrder}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      office.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {office.isActive ? '有効' : '無効'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(office)}
                        className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
                      >編集</button>
                      <button
                        onClick={() => toggleActive(office)}
                        className={`text-xs px-2 py-1 rounded ${
                          office.isActive
                            ? 'bg-gray-500 text-white hover:bg-gray-600'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                      >{office.isActive ? '無効化' : '有効化'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* フォームモーダル */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-lg mb-4">{editOffice ? '出張所を編集' : '出張所を追加'}</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">出張所名</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm"
                  placeholder="例: 京都第三"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">担当事務所名</label>
                <input
                  type="text"
                  value={form.mainOffice}
                  onChange={e => setForm(prev => ({ ...prev, mainOffice: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm"
                  placeholder="例: 京都"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">表示順</label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={e => setForm(prev => ({ ...prev, sortOrder: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowForm(false); setEditOffice(null) }}
                className="flex-1 border border-gray-300 py-2 rounded hover:bg-gray-50 text-sm"
              >キャンセル</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
              >{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
