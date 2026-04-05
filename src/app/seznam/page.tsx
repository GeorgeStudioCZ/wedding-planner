"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

type Zakazka = {
  id: string
  datum_svatby: string
  jmeno_nevesty: string
  jmeno_zenicha: string
  stav: string
  adresa_obradu: string
  typ_sluzby: string
  balicek: string
  cena: number
  vzdalenost_km: number | null
}

const STAVY: Record<string, { label: string; barva: string }> = {
  "poptavka":      { label: "Poptávka",       barva: "bg-gray-100 text-gray-600" },
  "rozhoduje-se":  { label: "Rozhoduje se",   barva: "bg-yellow-100 text-yellow-700" },
  "objednavka":    { label: "Objednávka",      barva: "bg-blue-100 text-blue-700" },
  "cekam-platbu":  { label: "Čekám platbu",   barva: "bg-orange-100 text-orange-700" },
  "zaplaceno":     { label: "Zaplaceno",       barva: "bg-green-100 text-green-700" },
  "ve-strizne":    { label: "Ve střižně",      barva: "bg-purple-100 text-purple-700" },
  "po-svatbe":     { label: "Po svatbě",       barva: "bg-sky-100 text-sky-700" },
  "ukonceno":      { label: "Ukončeno",        barva: "bg-slate-100 text-slate-500" },
}

function typLabel(typ: string) {
  if (typ === "foto+video") return "Foto + Video"
  if (typ === "foto") return "Foto"
  if (typ === "video") return "Video"
  return typ ?? "—"
}

function balicekLabel(b: string) {
  const map: Record<string, string> = {
    "pul-den-6": "Půl den (6 hod)",
    "pul-den":   "Půl den (8 hod)",
    "cely-den":  "Celý den (10 hod)",
    "do-vecera": "Do večera (12 hod)",
  }
  return map[b] ?? b ?? "—"
}

function formatDatum(datum: string) {
  if (!datum) return "—"
  const d = new Date(datum)
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
}

export default function SeznamSvateb() {
  const router = useRouter()
  const [zakazky, setZakazky] = useState<Zakazka[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from("zakazky")
      .select("id, datum_svatby, jmeno_nevesty, jmeno_zenicha, stav, adresa_obradu, typ_sluzby, balicek, cena, vzdalenost_km")
      .order("datum_svatby", { ascending: true })
      .then(({ data }) => {
        setZakazky(data ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <main className="min-h-screen bg-gray-50">

      {/* Hlavička */}
      <div className="w-full bg-sky-100 py-6">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-center">
          <h1 className="text-3xl font-bold text-sky-900 tracking-wide">Seznam svateb</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6">

        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.push("/")} className="text-gray-400 hover:text-gray-600 text-sm transition-colors">
            ← Zpět
          </button>
          <span className="text-sm text-gray-400">{loading ? "" : `${zakazky.length} zakázek`}</span>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">Načítám...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Datum svatby</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Nevěsta</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Ženich</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Stav</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Adresa obřadu</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Služba</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Balíček</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Cena celkem</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Vzdálenost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {zakazky.map(z => {
                    const stav = STAVY[z.stav] ?? { label: z.stav, barva: "bg-gray-100 text-gray-600" }
                    return (
                      <Link key={z.id} href={`/zakazky/${z.id}`} legacyBehavior>
                        <tr className="hover:bg-gray-50 cursor-pointer transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{formatDatum(z.datum_svatby)}</td>
                          <td className="px-4 py-3 text-gray-700">{z.jmeno_nevesty || "—"}</td>
                          <td className="px-4 py-3 text-gray-700">{z.jmeno_zenicha || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-lg whitespace-nowrap ${stav.barva}`}>
                              {stav.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 max-w-[220px] truncate">{z.adresa_obradu || "—"}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{typLabel(z.typ_sluzby)}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{balicekLabel(z.balicek)}</td>
                          <td className="px-4 py-3 text-right text-gray-900 font-medium whitespace-nowrap">
                            {z.cena ? z.cena.toLocaleString("cs-CZ") + " Kč" : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                            {z.vzdalenost_km ? `${z.vzdalenost_km} km` : "—"}
                          </td>
                        </tr>
                      </Link>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
