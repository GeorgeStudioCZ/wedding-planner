"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"

type Polozka = {
  id: number
  name: string
  category: string
  unit_num: number
  sort_order: number
}

type Rezervace = {
  id: number
  item_id: number
  unit_index: number
  customer: string
  phone: string
  start_date: string
  end_date: string
  color: string
  notes: string
  group_id: string | null
}

const ROK = new Date().getFullYear()

const MESICE = [
  { label: "Duben",    idx: 0, mesic: 3 },
  { label: "Květen",   idx: 1, mesic: 4 },
  { label: "Červen",   idx: 2, mesic: 5 },
  { label: "Červenec", idx: 3, mesic: 6 },
  { label: "Srpen",    idx: 4, mesic: 7 },
  { label: "Září",     idx: 5, mesic: 8 },
]

function dniVMesici(rok: number, mesic: number) {
  return new Date(rok, mesic + 1, 0).getDate()
}

function overlapDni(start: string, end: string, rok: number, mesic: number): number {
  const ms = new Date(rok, mesic, 1).getTime()
  const me = new Date(rok, mesic + 1, 0).getTime()
  const rs = new Date(start).getTime()
  const re = new Date(end).getTime()
  const overlapStart = Math.max(ms, rs)
  const overlapEnd = Math.min(me, re)
  if (overlapEnd < overlapStart) return 0
  return Math.round((overlapEnd - overlapStart) / 86400000) + 1
}

function formatDatum(d: string) {
  return new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "short" })
}

function pocetDni(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
}

export default function PujcovnaDashboard() {
  const router = useRouter()
  const [polozky, setPolozky] = useState<Polozka[]>([])
  const [rezervace, setRezervace] = useState<Rezervace[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function nacti() {
      const [{ data: pol }, { data: rez }] = await Promise.all([
        supabase.from("pujcovna_polozky").select("*").order("sort_order"),
        supabase.from("pujcovna_rezervace").select("*"),
      ])
      setPolozky(pol ?? [])
      setRezervace(rez ?? [])
      setLoading(false)
    }
    nacti()
  }, [])

  async function odhlasit() {
    const client = createClient()
    await client.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const stany = polozky.filter(p => p.category === "Stany")
  const totalStanu = stany.reduce((s, p) => s + p.unit_num, 0)
  const stanyIds = new Set(stany.map(p => p.id))

  // Rezervace stanů (bez příslušenství), bez duplikátů skupiny — jen hlavní stan
  const rezStanu = rezervace.filter(r => stanyIds.has(r.item_id))

  // Kapacita pro chart
  const kapacita = MESICE.map(({ label, mesic }) => {
    const dni = dniVMesici(ROK, mesic)
    const totalDni = totalStanu * dni
    const usedDni = rezStanu.reduce((sum, r) => sum + overlapDni(r.start_date, r.end_date, ROK, mesic), 0)
    const pct = totalDni > 0 ? Math.min(100, Math.round((usedDni / totalDni) * 100)) : 0
    return { label, pct, usedDni, totalDni }
  })

  // Název stanu podle id + unit_index
  function stanLabel(itemId: number, unitIndex: number) {
    const p = polozky.find(x => x.id === itemId)
    if (!p) return "—"
    return p.unit_num > 1 ? `${p.name} ${unitIndex + 1}` : p.name
  }

  // Seřadit rezervace stanů dle data
  const rezSorted = [...rezStanu].sort((a, b) => a.start_date.localeCompare(b.start_date))

  // Barva sloupce podle obsazenosti
  function barColor(pct: number) {
    if (pct === 0) return "#d1fae5"
    if (pct < 40) return "#34d399"
    if (pct < 70) return "#10b981"
    if (pct < 90) return "#059669"
    return "#065f46"
  }

  return (
    <main className="min-h-screen bg-gray-50">

      {/* Hlavička */}
      <div className="w-full bg-emerald-700 py-5">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-emerald-200 hover:text-white text-sm transition-colors">← Rozcestník</a>
            <div>
              <h1 className="text-xl font-bold text-white">Půjčovna autostanů</h1>
              <p className="text-emerald-300 text-xs mt-0.5">Přehled sezóny {ROK}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/pujcovna/kalendar"
              className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Kalendář
            </Link>
            <button onClick={odhlasit} className="text-xs text-emerald-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10">
              Odhlásit
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Graf kapacity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Využití kapacity stanů</h2>
              <p className="text-sm text-gray-500 mt-0.5">100 % = všech {totalStanu} stanů rezervováno na celý měsíc</p>
            </div>
            {!loading && (
              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-600">{rezStanu.length}</p>
                <p className="text-xs text-gray-500">rezervací</p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="h-48 flex items-end gap-4 px-4">
              {MESICE.map(m => (
                <div key={m.label} className="flex-1 bg-gray-100 rounded-t-lg animate-pulse" style={{ height: `${40 + Math.random() * 60}%` }} />
              ))}
            </div>
          ) : (
            <div className="flex items-end gap-3" style={{ height: 220 }}>
              {kapacita.map(({ label, pct }) => (
                <div key={label} className="flex-1 flex flex-col items-center gap-1">
                  {/* Procento nad sloupcem */}
                  <span className="text-xs font-bold text-gray-600">{pct > 0 ? `${pct}%` : ""}</span>
                  {/* Sloupec */}
                  <div className="w-full rounded-t-lg transition-all duration-500 relative" style={{
                    height: `${Math.max(pct, 2)}%`,
                    maxHeight: 160,
                    minHeight: 4,
                    backgroundColor: barColor(pct),
                  }}>
                    {/* Prázdný prostor nahoře */}
                  </div>
                  {/* Osa */}
                  <div className="w-full h-0.5 bg-gray-200 rounded" />
                  {/* Název měsíce */}
                  <span className="text-xs text-gray-500 font-medium text-center leading-tight">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Legenda */}
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
            <div className="flex items-center gap-3 flex-wrap">
              {[0, 25, 50, 75, 100].map(v => (
                <span key={v} className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: barColor(v) }} />
                  {v}%
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Seznam rezervací stanů */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Rezervace stanů</h2>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-xl animate-pulse border border-gray-100" />)}
            </div>
          ) : rezSorted.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
              Žádné rezervace stanů
            </div>
          ) : (
            <div className="space-y-3">
              {rezSorted.map(r => {
                const dni = pocetDni(r.start_date, r.end_date)
                const dnes = new Date().toISOString().slice(0, 10)
                const probiha = r.start_date <= dnes && r.end_date >= dnes
                const minula = r.end_date < dnes
                return (
                  <Link key={r.id} href={`/pujcovna/rezervace/${r.id}`}
                    className="block bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-200 overflow-hidden">
                    <div className="flex items-center gap-0">
                      {/* Barevný proužek */}
                      <div className="w-1.5 self-stretch shrink-0" style={{ backgroundColor: r.color }} />
                      <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                        {/* Stan + zákazník */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900">{r.customer}</span>
                            {probiha && (
                              <span className="text-[11px] font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Právě půjčeno</span>
                            )}
                            {minula && (
                              <span className="text-[11px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Ukončeno</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">{stanLabel(r.item_id, r.unit_index)}</p>
                        </div>
                        {/* Datum */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-gray-700">{formatDatum(r.start_date)} – {formatDatum(r.end_date)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{dni} {dni === 1 ? "den" : dni < 5 ? "dny" : "dní"}</p>
                        </div>
                        {/* Šipka */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </main>
  )
}
