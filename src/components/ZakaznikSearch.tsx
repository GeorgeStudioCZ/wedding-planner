"use client"

import { useState, useRef, useEffect } from "react"
import { supabase } from "@/lib/supabase"

export type Zakaznik = {
  id: number
  jmeno: string
  prijmeni: string
  firma?: string | null
  ulice: string
  mesto: string
  psc: string
  email: string
  telefon: string
  projekty: string[]
}

/** Vrátí primární zobrazované jméno — firma pokud je vyplněna, jinak jméno + příjmení */
export function zakaznikDisplayName(z: Pick<Zakaznik, "jmeno" | "prijmeni" | "firma">) {
  if (z.firma?.trim()) return z.firma.trim()
  return [z.jmeno, z.prijmeni].filter(Boolean).join(" ") || "—"
}

type Props = {
  onSelect: (z: Zakaznik) => void
  projekt: string
  accentColor?: "rose" | "emerald"
}

export function ZakaznikSearch({ onSelect, projekt, accentColor = "rose" }: Props) {
  const [query, setQuery] = useState("")
  const [vysledky, setVysledky] = useState<Zakaznik[]>([])
  const [open, setOpen] = useState(false)
  const [novyForm, setNovyForm] = useState(false)
  const [novy, setNovy] = useState({ jmeno: "", prijmeni: "", telefon: "", email: "", ulice: "", mesto: "", psc: "" })
  const [ukladam, setUkladam] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const ring = accentColor === "emerald" ? "focus:ring-emerald-300" : "focus:ring-rose-300"
  const btn = accentColor === "emerald" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-500 hover:bg-rose-600"

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setNovyForm(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  useEffect(() => {
    if (query.length < 2) { setVysledky([]); setOpen(false); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("zakaznici")
        .select("*")
        .or(`jmeno.ilike.%${query}%,prijmeni.ilike.%${query}%,firma.ilike.%${query}%,telefon.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(8)
      setVysledky(data ?? [])
      setOpen(true)
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  async function ulozNoveho() {
    if (!novy.jmeno.trim() && !novy.prijmeni.trim()) return
    setUkladam(true)
    const { data } = await supabase
      .from("zakaznici")
      .insert([{ ...novy, projekty: [projekt] }])
      .select()
      .single()
    if (data) {
      onSelect(data)
      setQuery(zakaznikDisplayName(data))
    }
    setNovyForm(false)
    setOpen(false)
    setUkladam(false)
  }

  const inputClass = `w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${ring}`

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setNovyForm(false) }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Hledat zákazníka (jméno, telefon, e-mail)..."
          className={`${inputClass} pl-9`}
        />
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {vysledky.map(z => (
            <button
              key={z.id}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
              onClick={() => { onSelect(z); setQuery(zakaznikDisplayName(z)); setOpen(false) }}
            >
              <p className="text-sm font-medium text-gray-900">{zakaznikDisplayName(z)}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {z.firma && (z.jmeno || z.prijmeni) ? `${z.jmeno} ${z.prijmeni}`.trim() + " · " : ""}
                {z.telefon}{z.email ? ` · ${z.email}` : ""}{z.mesto ? ` · ${z.mesto}` : ""}
              </p>
            </button>
          ))}
          {!novyForm && (
            <button
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm text-gray-500 flex items-center gap-2 border-t border-gray-100"
              onClick={() => { setNovyForm(true); setNovy(prev => ({ ...prev, jmeno: query.split(" ")[0] ?? "", prijmeni: query.split(" ").slice(1).join(" ") })) }}
            >
              <span className="text-lg leading-none">+</span> Vytvořit nového zákazníka
            </button>
          )}
        </div>
      )}

      {novyForm && (
        <div className="mt-2 border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Nový zákazník</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={novy.jmeno} onChange={e => setNovy({ ...novy, jmeno: e.target.value })} placeholder="Jméno" className={inputClass} />
            <input value={novy.prijmeni} onChange={e => setNovy({ ...novy, prijmeni: e.target.value })} placeholder="Příjmení" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={novy.telefon} onChange={e => setNovy({ ...novy, telefon: e.target.value })} placeholder="Telefon" className={inputClass} />
            <input value={novy.email} onChange={e => setNovy({ ...novy, email: e.target.value })} placeholder="E-mail" className={inputClass} />
          </div>
          <input value={novy.ulice} onChange={e => setNovy({ ...novy, ulice: e.target.value })} placeholder="Ulice" className={inputClass} />
          <div className="grid grid-cols-3 gap-2">
            <input value={novy.mesto} onChange={e => setNovy({ ...novy, mesto: e.target.value })} placeholder="Město" className={`${inputClass} col-span-2`} />
            <input value={novy.psc} onChange={e => setNovy({ ...novy, psc: e.target.value })} placeholder="PSČ" className={inputClass} />
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={ukladam} onClick={ulozNoveho} className={`flex-1 ${btn} text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors`}>
              {ukladam ? "Ukládám..." : "Uložit zákazníka"}
            </button>
            <button type="button" onClick={() => { setNovyForm(false); setOpen(false) }} className="px-3 py-2 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
              Zrušit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
