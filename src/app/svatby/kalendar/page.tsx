"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"

type Zakazka = {
  id: string
  datum_svatby: string
  typ_sluzby: string
  jmeno_nevesty: string
  jmeno_zenicha: string
  stav: string
}

const MESICE = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"
]

const DNY = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]

function barvaSvatby(typ: string, stav: string): string {
  if (stav === "objednavka") return "bg-yellow-400 text-white"
  if (typ === "foto") return "bg-blue-500 text-white"
  if (typ === "video") return "bg-rose-500 text-white"
  if (typ === "foto+video") return "bg-gray-400 text-white"
  return "bg-gray-300 text-gray-700"
}

function MesicniKalendar({
  rok, mesic, svatby
}: {
  rok: number
  mesic: number // 0–11
  svatby: Zakazka[]
}) {
  // První den měsíce (0=Ne, 1=Po, ..., 6=So) → převedeme na Po=0
  const prvniDen = new Date(rok, mesic, 1).getDay()
  const offsetPo = (prvniDen === 0 ? 6 : prvniDen - 1)
  const pocetDni = new Date(rok, mesic + 1, 0).getDate()

  // Mapa datum → zakázka
  const svatbyMesice: Record<number, Zakazka> = {}
  for (const z of svatby) {
    const d = new Date(z.datum_svatby)
    if (d.getFullYear() === rok && d.getMonth() === mesic) {
      svatbyMesice[d.getDate()] = z
    }
  }

  const dnes = new Date()
  const jeAktualniMesic = dnes.getFullYear() === rok && dnes.getMonth() === mesic
  const dnesDen = dnes.getDate()

  const bunky: (number | null)[] = [
    ...Array(offsetPo).fill(null),
    ...Array.from({ length: pocetDni }, (_, i) => i + 1),
  ]
  // Doplň na násobek 7
  while (bunky.length % 7 !== 0) bunky.push(null)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Hlavička měsíce */}
      <div className="bg-rose-500 px-4 py-2.5">
        <h3 className="text-white font-bold text-sm">{MESICE[mesic]} {rok}</h3>
      </div>

      {/* Dny v týdnu */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DNY.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Dny */}
      <div className="grid grid-cols-7">
        {bunky.map((den, i) => {
          if (!den) return <div key={i} className="aspect-square" />
          const zakazka = svatbyMesice[den]
          const jeDnes = jeAktualniMesic && den === dnesDen
          return (
            <div key={i} className="flex items-center justify-center aspect-square p-0.5">
              {zakazka ? (
                <Link
                  href={`/svatby/zakazky/${zakazka.id}`}
                  title={`${zakazka.jmeno_nevesty} & ${zakazka.jmeno_zenicha}`}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-opacity hover:opacity-80 ${barvaSvatby(zakazka.typ_sluzby, zakazka.stav)}`}
                >
                  {den}
                </Link>
              ) : (
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${jeDnes ? "bg-sky-100 text-sky-700 font-bold" : "text-gray-700"}`}>
                  {den}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Kalendar() {
  const router = useRouter()
  const [zakazky, setZakazky] = useState<Zakazka[]>([])
  const [rok, setRok] = useState(new Date().getFullYear())

  useEffect(() => {
    supabase
      .from("zakazky")
      .select("id, datum_svatby, typ_sluzby, jmeno_nevesty, jmeno_zenicha, stav")
      .in("stav", ["objednavka", "zaplaceno", "po-svatbe", "ve-strizne", "ukonceno"])
      .then(({ data }) => setZakazky(data ?? []))
  }, [])

  return (
    <main className="min-h-screen bg-gray-50">

      {/* Hlavička */}
      <div className="w-full bg-sky-100 py-6">
        <div className="max-w-5xl mx-auto px-8 flex items-center justify-center">
          <h1 className="text-3xl font-bold text-sky-900 tracking-wide">Kalendář svateb</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-6">

        {/* Navigace */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <button onClick={() => router.push("/svatby")} className="text-gray-400 hover:text-gray-600 text-sm transition-colors">
            ← Zpět
          </button>

          {/* Výběr roku */}
          <div className="flex items-center gap-3">
            <button onClick={() => setRok(r => r - 1)} className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600 transition-colors">‹</button>
            <span className="text-lg font-bold text-gray-900 w-16 text-center">{rok}</span>
            <button onClick={() => setRok(r => r + 1)} className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600 transition-colors">›</button>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />Předrezervace</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />Foto</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />Video</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />Foto + Video</span>
          </div>
        </div>

        {/* Mřížka měsíců */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, i) => (
            <MesicniKalendar key={i} rok={rok} mesic={i} svatby={zakazky} />
          ))}
        </div>

      </div>
    </main>
  )
}
