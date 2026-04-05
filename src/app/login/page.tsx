"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-browser"

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [heslo, setHeslo] = useState("")
  const [chyba, setChyba] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setChyba(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: heslo })

    if (error) {
      setChyba("Nesprávný e-mail nebo heslo.")
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Hlavička */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-sky-900">Wedding Planner</h1>
          <p className="text-gray-400 text-sm mt-2">Přihlaste se pro přístup</p>
        </div>

        {/* Formulář */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleLogin} className="space-y-5">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                placeholder="vas@email.cz"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Heslo</label>
              <input
                type="password"
                value={heslo}
                onChange={e => setHeslo(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                placeholder="••••••••"
              />
            </div>

            {chyba && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{chyba}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? "Přihlašuji..." : "Přihlásit se"}
            </button>

          </form>
        </div>

      </div>
    </main>
  )
}
