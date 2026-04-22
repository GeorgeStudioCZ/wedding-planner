"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import AppShell from "@/components/AppShell"

type Zakaznik = {
  id: number
  jmeno: string
  prijmeni: string
  ulice: string
  mesto: string
  psc: string
  email: string
  telefon: string
  projekty: string[]
  created_at: string
}

const PROJEKTY = ["Vše", "Svatby", "Půjčovna"]

export default function Zakaznici() {
  const router = useRouter()
  const [zakaznici, setZakaznici] = useState<Zakaznik[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [projektFilter, setProjektFilter] = useState("Vše")
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<Zakaznik>>({})
  const [novyModal, setNovyModal] = useState(false)
  const [novyForm, setNovyForm] = useState({ jmeno: "", prijmeni: "", ulice: "", mesto: "", psc: "", email: "", telefon: "", projekty: [] as string[] })
  const [ukladam, setUkladam] = useState(false)
  const [mazaniId, setMazaniId] = useState<number | null>(null)

  useEffect(() => {
    nacti()
  }, [])

  async function nacti() {
    const { data } = await supabase.from("zakaznici").select("*").order("prijmeni").order("jmeno")
    setZakaznici(data ?? [])
    setLoading(false)
  }

  const filtrovani = zakaznici.filter(z => {
    const q = query.toLowerCase()
    const odpovida = !q ||
      z.jmeno.toLowerCase().includes(q) ||
      z.prijmeni.toLowerCase().includes(q) ||
      z.email.toLowerCase().includes(q) ||
      z.telefon.includes(q) ||
      z.mesto.toLowerCase().includes(q)
    const projekt = projektFilter === "Vše" || (z.projekty ?? []).includes(projektFilter)
    return odpovida && projekt
  })

  async function ulozEdit() {
    if (!editId) return
    setUkladam(true)
    await supabase.from("zakaznici").update(editForm).eq("id", editId)
    await nacti()
    setEditId(null)
    setUkladam(false)
  }

  async function ulozNoveho() {
    setUkladam(true)
    await supabase.from("zakaznici").insert([novyForm])
    await nacti()
    setNovyModal(false)
    setNovyForm({ jmeno: "", prijmeni: "", ulice: "", mesto: "", psc: "", email: "", telefon: "", projekty: [] })
    setUkladam(false)
  }

  async function smazat(id: number) {
    await supabase.from("zakaznici").delete().eq("id", id)
    setMazaniId(null)
    setZakaznici(prev => prev.filter(z => z.id !== id))
  }

  function toggleProjekt(p: string, projekty: string[], onChange: (v: string[]) => void) {
    if (projekty.includes(p)) onChange(projekty.filter(x => x !== p))
    else onChange([...projekty, p])
  }

  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"

  return (
    <AppShell module="wed">

      <div className="max-w-5xl mx-auto px-6 py-8">

        <div className="flex items-center justify-between mb-6">
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>Zákazníci</h1>
          <button
            onClick={() => setNovyModal(true)}
            className="bg-white hover:bg-gray-100 text-gray-900 font-medium text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nový zákazník
          </button>
        </div>

        {/* Filtry */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Hledat dle jména, telefonu, e-mailu..."
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <select
            value={projektFilter}
            onChange={e => setProjektFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {PROJEKTY.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>

        {/* Počet */}
        <p className="text-sm text-gray-500 mb-4">{filtrovani.length} zákazník{filtrovani.length === 1 ? "" : filtrovani.length < 5 ? "i" : "ů"}</p>

        {/* Seznam */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl animate-pulse border border-gray-100" />)}
          </div>
        ) : filtrovani.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Žádní zákazníci nenalezeni</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtrovani.map(z => (
              <div key={z.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {editId === z.id ? (
                  <div className="p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input value={editForm.jmeno ?? ""} onChange={e => setEditForm({ ...editForm, jmeno: e.target.value })} placeholder="Jméno" className={inputClass} />
                      <input value={editForm.prijmeni ?? ""} onChange={e => setEditForm({ ...editForm, prijmeni: e.target.value })} placeholder="Příjmení" className={inputClass} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={editForm.telefon ?? ""} onChange={e => setEditForm({ ...editForm, telefon: e.target.value })} placeholder="Telefon" className={inputClass} />
                      <input value={editForm.email ?? ""} onChange={e => setEditForm({ ...editForm, email: e.target.value })} placeholder="E-mail" className={inputClass} />
                    </div>
                    <input value={editForm.ulice ?? ""} onChange={e => setEditForm({ ...editForm, ulice: e.target.value })} placeholder="Ulice" className={inputClass} />
                    <div className="grid grid-cols-3 gap-3">
                      <input value={editForm.mesto ?? ""} onChange={e => setEditForm({ ...editForm, mesto: e.target.value })} placeholder="Město" className={`${inputClass} col-span-2`} />
                      <input value={editForm.psc ?? ""} onChange={e => setEditForm({ ...editForm, psc: e.target.value })} placeholder="PSČ" className={inputClass} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Projekty</p>
                      <div className="flex gap-2">
                        {["Svatby", "Půjčovna"].map(p => (
                          <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(editForm.projekty ?? []).includes(p)}
                              onChange={() => toggleProjekt(p, editForm.projekty ?? [], v => setEditForm({ ...editForm, projekty: v }))}
                              className="rounded text-blue-600"
                            />
                            {p}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={ulozEdit} disabled={ukladam} className="flex-1 bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors">
                        {ukladam ? "Ukládám..." : "Uložit"}
                      </button>
                      <button onClick={() => setEditId(null)} className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                        Zrušit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{z.jmeno} {z.prijmeni}</h3>
                        {(z.projekty ?? []).map(p => (
                          <span key={p} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                            p === "Svatby" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"
                          }`}>{p}</span>
                        ))}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                        {z.telefon && <span className="text-sm text-gray-600">📞 {z.telefon}</span>}
                        {z.email && <span className="text-sm text-gray-600">✉️ {z.email}</span>}
                        {(z.ulice || z.mesto) && (
                          <span className="text-sm text-gray-500">
                            {[z.ulice, z.mesto, z.psc].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {mazaniId === z.id ? (
                        <>
                          <button onClick={() => smazat(z.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">Potvrdit</button>
                          <button onClick={() => setMazaniId(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Zrušit</button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditId(z.id); setEditForm({ ...z }) }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            Upravit
                          </button>
                          <button
                            onClick={() => setMazaniId(z.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                          >
                            Smazat
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal — nový zákazník */}
      {novyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Nový zákazník</h2>
              <button onClick={() => setNovyModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={novyForm.jmeno} onChange={e => setNovyForm({ ...novyForm, jmeno: e.target.value })} placeholder="Jméno" className={inputClass} />
                <input value={novyForm.prijmeni} onChange={e => setNovyForm({ ...novyForm, prijmeni: e.target.value })} placeholder="Příjmení" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={novyForm.telefon} onChange={e => setNovyForm({ ...novyForm, telefon: e.target.value })} placeholder="Telefon" className={inputClass} />
                <input value={novyForm.email} onChange={e => setNovyForm({ ...novyForm, email: e.target.value })} placeholder="E-mail" className={inputClass} />
              </div>
              <input value={novyForm.ulice} onChange={e => setNovyForm({ ...novyForm, ulice: e.target.value })} placeholder="Ulice" className={inputClass} />
              <div className="grid grid-cols-3 gap-3">
                <input value={novyForm.mesto} onChange={e => setNovyForm({ ...novyForm, mesto: e.target.value })} placeholder="Město" className={`${inputClass} col-span-2`} />
                <input value={novyForm.psc} onChange={e => setNovyForm({ ...novyForm, psc: e.target.value })} placeholder="PSČ" className={inputClass} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Projekty</p>
                <div className="flex gap-3">
                  {["Svatby", "Půjčovna"].map(p => (
                    <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={novyForm.projekty.includes(p)}
                        onChange={() => {
                          if (novyForm.projekty.includes(p)) setNovyForm({ ...novyForm, projekty: novyForm.projekty.filter(x => x !== p) })
                          else setNovyForm({ ...novyForm, projekty: [...novyForm.projekty, p] })
                        }}
                        className="rounded text-blue-600"
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={ulozNoveho} disabled={ukladam} className="flex-1 bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors">
                {ukladam ? "Ukládám..." : "Uložit zákazníka"}
              </button>
              <button onClick={() => setNovyModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  )
}
