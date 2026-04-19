"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type SvatbaEmbed = {
  datum_svatby: string
  typ_sluzby: string
}

const MESICE = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"
]

const DNY = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]

function barvaSvatby(typ: string): string {
  if (typ === "foto") return "bg-blue-500 text-white"
  if (typ === "video") return "bg-rose-500 text-white"
  if (typ === "foto+video") return "bg-gray-500 text-white"
  return "bg-gray-400 text-white"
}

function MesicniKalendar({ rok, mesic, svatby }: {
  rok: number
  mesic: number
  svatby: SvatbaEmbed[]
}) {
  const prvniDen = new Date(rok, mesic, 1).getDay()
  const offsetPo = prvniDen === 0 ? 6 : prvniDen - 1
  const pocetDni = new Date(rok, mesic + 1, 0).getDate()

  const obsazene: Record<number, string> = {}
  for (const z of svatby) {
    const d = new Date(z.datum_svatby)
    if (d.getFullYear() === rok && d.getMonth() === mesic) {
      obsazene[d.getDate()] = z.typ_sluzby
    }
  }

  const dnes = new Date()
  const jeAktualniMesic = dnes.getFullYear() === rok && dnes.getMonth() === mesic
  const dnesDen = dnes.getDate()

  const bunky: (number | null)[] = [
    ...Array(offsetPo).fill(null),
    ...Array.from({ length: pocetDni }, (_, i) => i + 1),
  ]
  while (bunky.length % 7 !== 0) bunky.push(null)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-rose-500 px-4 py-2.5">
        <h3 className="text-white font-bold text-sm">{MESICE[mesic]} {rok}</h3>
      </div>
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DNY.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {bunky.map((den, i) => {
          if (!den) return <div key={i} className="aspect-square" />
          const typ = obsazene[den]
          const jeDnes = jeAktualniMesic && den === dnesDen
          return (
            <div key={i} className="flex items-center justify-center aspect-square p-0.5">
              {typ ? (
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold select-none ${barvaSvatby(typ)}`}>
                  {den}
                </div>
              ) : (
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs select-none ${jeDnes ? "bg-sky-100 text-sky-700 font-bold" : "text-gray-700"}`}>
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

export default function KalendarEmbed() {
  const [svatby, setSvatby] = useState<SvatbaEmbed[]>([])
  const [rok, setRok] = useState(new Date().getFullYear())

  useEffect(() => {
    supabase
      .from("zakazky")
      .select("datum_svatby, typ_sluzby")
      .in("stav", ["objednavka", "zaplaceno", "po-svatbe", "ve-strizne", "ukonceno"])
      .then(({ data }) => setSvatby(data ?? []))
  }, [])

  // Posílá výšku obsahu do rodiče (auto-resize iframe)
  useEffect(() => {
    function sendHeight() {
      const height = document.documentElement.scrollHeight
      window.parent.postMessage({ type: "iframeResize", height }, "*")
    }
    sendHeight()
    const ro = new ResizeObserver(sendHeight)
    ro.observe(document.body)
    return () => ro.disconnect()
  }, [rok, svatby])

  return (
    <div className="bg-gray-50 p-4 font-sans">

      {/* Navigace roku */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRok(r => r - 1)}
            className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600 transition-colors text-lg"
          >‹</button>
          <span className="text-lg font-bold text-gray-900 w-14 text-center">{rok}</span>
          <button
            onClick={() => setRok(r => r + 1)}
            className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600 transition-colors text-lg"
          >›</button>
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />Foto</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />Video</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-500 inline-block" />Foto + Video</span>
        </div>
      </div>

      {/* Mřížka měsíců */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 12 }, (_, i) => (
          <MesicniKalendar key={i} rok={rok} mesic={i} svatby={svatby} />
        ))}
      </div>

    </div>
  )
}
