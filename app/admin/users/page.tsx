'use client'
// @ts-nocheck
import { useState, useEffect } from 'react'
import NavHeader from '@/components/NavHeader'

interface User {
  id: number
  loginId: string
  displayName: string
  allowedOffices: string
  isAdmin: boolean
  isActive: boolean
}

interface Office {
  id: number
  name: string
}

const EMPTY_FORM = {
  loginId: '', password: '', displayName: '', allowedOffices: 'all', isAdmin: false,
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/offices').then(r => r.json()),
    ]).then(([u, o]) => {
      setUsers(Array.isArray(u) ? u : [])
      setOffices(Array.isArray(o) ? o : [])
      setLoading(false)
    })
  }, [])

  function openCreate() {
    setEditUser(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(user: User) {
    setEditUser(user)
    setForm({
      loginId: user.loginId,
      password: '',
      displayName: user.displayName,
      allowedOffices: user.allowedOffices,
      isAdmin: user.isAdmin,
    })
    setShowForm(true)
  }

  async function saveUser() {
    if (!form.loginId || !form.displayName) {
      setMessage({ type: 'error', text: 'ログインIDと表示名は必須です' }); return
    }
    if (!editUser && !form.password) {
      setMessage({ type: 'error', text: '新規作成時はパスワードが必須です' }); return
    }
    setSaving(true)
    try {
      const url = editUser ? `/api/users/${editUser.id}` : '/api/users'
      const method = editUser ? 'PATCH' : 'POST'
      const body = editUser
        ? { displayName: form.displayName, allowedOffices: form.allowedOffices, isAdmin: form.isAdmin, ...(form.password ? { password: form.password } : {}) }
        : form
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage({ type: 'success', text: editUser ? '更新しました' : 'ユーザーを作成しました' })
      setShowForm(false)
      // 一覧を再取得
      const updated = await fetch('/api/users').then(r => r.json())
      setUsers(Array.isArray(updated) ? updated : [])
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'エラーが発生しました' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(user: User) {
    await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !user.isActive }),
    })
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: !u.isActive } : u))
  }

  async function deleteUser(user: User) {
    if (!confirm(`「${user.displayName}」を削除しますか？`)) return
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { setMessage({ type: 'error', text: data.error }); return }
    setUsers(prev => prev.filter(u => u.id !== user.id))
    setMessage({ type: 'success', text: '削除しました' })
  }

  // 出張所チェックボックスの管理
  const allowedAll = form.allowedOffices === 'all'
  const selectedOffices = allowedAll ? [] : form.allowedOffices.split(',').map(s => s.trim()).filter(Boolean)

  function toggleOffice(name: string) {
    if (allowedAll) {
      setForm(f => ({ ...f, allowedOffices: name }))
    } else {
      const current = selectedOffices
      const next = current.includes(name)
        ? current.filter(o => o !== name)
        : [...current, name]
      setForm(f => ({ ...f, allowedOffices: next.length ? next.join(',') : 'all' }))
    }
  }

  function formatOffices(val: string) {
    if (val === 'all') return '全出張所'
    return val.split(',').join('、')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavHeader current="users" />
      <main className="max-w-4xl mx-auto p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-800">ユーザー管理</h2>
          <button onClick={openCreate}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            ＋ ユーザーを追加
          </button>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-300' : 'bg-red-50 text-red-700 border border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-600">表示名</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">ログインID</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">閲覧できる出張所</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">権限</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">状態</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-gray-400">読み込み中...</td></tr>
              ) : users.map(user => (
                <tr key={user.id} className={`hover:bg-gray-50 ${!user.isActive ? 'opacity-50' : ''}`}>
                  <td className="p-3 font-medium">{user.displayName}</td>
                  <td className="p-3 text-gray-500 font-mono text-xs">{user.loginId}</td>
                  <td className="p-3 text-xs text-gray-600">{formatOffices(user.allowedOffices)}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${user.isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {user.isAdmin ? '管理者' : '一般'}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {user.isActive ? '有効' : '無効'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(user)}
                        className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">編集</button>
                      <button onClick={() => toggleActive(user)}
                        className={`text-xs px-2 py-1 rounded ${user.isActive ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                        {user.isActive ? '無効化' : '有効化'}
                      </button>
                      <button onClick={() => deleteUser(user)}
                        className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600">削除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">ユーザーがいません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* ユーザー作成・編集モーダル */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-base mb-4">{editUser ? 'ユーザー編集' : 'ユーザー追加'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">ログインID <span className="text-red-500">*</span></label>
                <input type="text" value={form.loginId}
                  onChange={e => setForm(f => ({ ...f, loginId: e.target.value }))}
                  readOnly={!!editUser}
                  className={`w-full border border-gray-300 rounded p-2 text-sm ${editUser ? 'bg-gray-100' : ''}`}
                  placeholder="例: tanaka" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  パスワード {!editUser && <span className="text-red-500">*</span>}
                  {editUser && <span className="text-gray-400 font-normal">（変更する場合のみ入力）</span>}
                </label>
                <input type="password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm"
                  placeholder="パスワード" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">表示名 <span className="text-red-500">*</span></label>
                <input type="text" value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  className="w-full border border-gray-300 rounded p-2 text-sm"
                  placeholder="例: 田中 太郎" />
              </div>

              {/* 閲覧できる出張所 */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">閲覧できる出張所</label>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={allowedAll}
                    onChange={e => setForm(f => ({ ...f, allowedOffices: e.target.checked ? 'all' : '' }))}
                    className="rounded" />
                  <span className="text-sm font-medium">全出張所（制限なし）</span>
                </label>
                {!allowedAll && (
                  <div className="pl-4 space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
                    {offices.map(o => (
                      <label key={o.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox"
                          checked={selectedOffices.includes(o.name)}
                          onChange={() => toggleOffice(o.name)}
                          className="rounded" />
                        <span className="text-sm">{o.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isAdmin}
                    onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))}
                    className="rounded" />
                  <span className="text-sm font-medium">管理者権限（ユーザー管理・全データ閲覧）</span>
                </label>
              </div>
            </div>

            {message && (
              <p className={`mt-3 text-sm ${message.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>{message.text}</p>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-300 py-2 rounded text-sm hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={saveUser} disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
