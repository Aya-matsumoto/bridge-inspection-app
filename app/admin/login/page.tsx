import { redirect } from 'next/navigation'

// 管理者ログインは廃止 → データ一覧へリダイレクト
export default function LoginPage() {
  redirect('/admin')
}
