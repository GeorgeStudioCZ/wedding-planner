"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Rezervace = {
  id: number
  item_id: number
  unit_index: number
  customer: string
  start_date: string
  end_date: string
  color: string
  notes: string
  group_id: string | null
  zakaznik_id: number | null
  vozidlo: string
  cas_vyzvednuti: string
  cas_vraceni: string
  pricniky: string
}

type Zakaznik = {
  id: number
  jmeno: string
  prijmeni: string
  telefon: string
  email: string
  ulice: string
  mesto: string
  psc: string
}

type Polozka = {
  id: number
  name: string
  category: string
  unit_num: number
}

function formatDatum(d: string) {
  return new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}

function pocetDni(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
}

export default function DetailRezervace() {
  const router = useRouter()
  const params = useParams()
  const [rez, setRez] = useState<Rezervace | null>(null)
  const [zakaznik, setZakaznik] = useState<Zakaznik | null>(null)
  const [polozka, setPolozka] = useState<Polozka | null>(null)
  const [prisl, setPrisl] = useState<{ rez: Rezervace; polozka: Polozka }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function nacti() {
      const { data: r } = await supabase.from("pujcovna_rezervace").select("*").eq("id", params.id).single()
      if (!r) { setLoading(false); return }
      setRez(r)

      // Načíst zákazníka z centrální DB
      if (r.zakaznik_id) {
        const { data: zak } = await supabase.from("zakaznici").select("*").eq("id", r.zakaznik_id).single()
        if (zak) setZakaznik(zak)
      }

      const { data: p } = await supabase.from("pujcovna_polozky").select("*").eq("id", r.item_id).single()
      setPolozka(p)

      if (r.group_id) {
        const { data: skupRez } = await supabase
          .from("pujcovna_rezervace").select("*")
          .eq("group_id", r.group_id)
          .neq("id", r.id)
        if (skupRez && skupRez.length > 0) {
          const itemIds = [...new Set(skupRez.map((x: Rezervace) => x.item_id))]
          const { data: polozky } = await supabase.from("pujcovna_polozky").select("*").in("id", itemIds)
          const polMap = Object.fromEntries((polozky ?? []).map((x: Polozka) => [x.id, x]))
          setPrisl(skupRez.map((x: Rezervace) => ({ rez: x, polozka: polMap[x.item_id] })))
        }
      }
      setLoading(false)
    }
    nacti()
  }, [params.id])

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Načítám...</p>
    </main>
  )

  if (!rez || !polozka) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Rezervace nenalezena.</p>
    </main>
  )

  const stanLabel = polozka.unit_num > 1 ? `${polozka.name} ${rez.unit_index + 1}` : polozka.name
  const dni = pocetDni(rez.start_date, rez.end_date)

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="w-full bg-emerald-700 py-5">
        <div className="max-w-2xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="text-emerald-200 hover:text-white text-sm transition-colors">← Zpět</button>
            <h1 className="text-xl font-bold text-white">Detail výpůjčky</h1>
          </div>
          <button
            onClick={() => router.push(`/pujcovna/kalendar?edit=${params.id}`)}
            className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Upravit
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">

        {/* Barevný proužek + stan */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-2" style={{ backgroundColor: rez.color }} />
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: rez.color + "22" }}>
                <span className="text-2xl">⛺</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{stanLabel}</h2>
                <p className="text-gray-500 text-sm mt-0.5">{polozka.category}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Zákazník */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Zákazník</h3>
          <p className="text-lg font-semibold text-gray-900">
            {zakaznik ? `${zakaznik.jmeno} ${zakaznik.prijmeni}` : rez.customer}
          </p>
          {zakaznik?.telefon && (
            <a href={`tel:${zakaznik.telefon}`} className="text-emerald-600 text-sm mt-1 block hover:underline">
              {zakaznik.telefon}
            </a>
          )}
          {zakaznik?.email && (
            <a href={`mailto:${zakaznik.email}`} className="text-emerald-600 text-sm mt-0.5 block hover:underline">
              {zakaznik.email}
            </a>
          )}
          {zakaznik && (
            <a href="/zakaznici" className="text-xs text-gray-400 mt-3 inline-block hover:text-emerald-600 transition-colors">
              Centrální databáze →
            </a>
          )}
        </div>

        {/* Termín */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Termín</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Od</p>
              <p className="font-semibold text-gray-900">{formatDatum(rez.start_date)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Do</p>
              <p className="font-semibold text-gray-900">{formatDatum(rez.end_date)}</p>
            </div>
          </div>
          <div className="mt-4 bg-emerald-50 rounded-xl px-4 py-3">
            <p className="text-emerald-700 font-semibold">{dni} {dni === 1 ? "den" : dni < 5 ? "dny" : "dní"}</p>
          </div>
        </div>

        {/* Vozidlo + časy + příčníky */}
        {(rez.vozidlo || rez.cas_vyzvednuti || rez.cas_vraceni || rez.pricniky) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Vozidlo a logistika</h3>
            <div className="space-y-3">
              {rez.vozidlo && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Vozidlo</span>
                  <span className="text-sm font-medium text-gray-900">{rez.vozidlo}</span>
                </div>
              )}
              {rez.cas_vyzvednuti && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Vyzvednutí</span>
                  <span className="text-sm font-medium text-gray-900">{rez.cas_vyzvednuti} hod</span>
                </div>
              )}
              {rez.cas_vraceni && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Vrácení</span>
                  <span className="text-sm font-medium text-gray-900">{rez.cas_vraceni} hod</span>
                </div>
              )}
              {rez.pricniky && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Příčníky</span>
                  <span className="text-sm font-medium text-gray-900">{rez.pricniky === "vlastni" ? "Má vlastní" : "Chce půjčit"}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Příslušenství */}
        {prisl.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Příslušenství</h3>
            <div className="space-y-2">
              {prisl.map(({ rez: r, polozka: p }) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-800">{p?.name ?? "—"}</span>
                  {p && p.unit_num > 1 && (
                    <span className="text-xs text-gray-500">#{r.unit_index + 1}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Poznámka */}
        {rez.notes && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Poznámka</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{rez.notes}</p>
          </div>
        )}

      </div>
    </main>
  )
}
