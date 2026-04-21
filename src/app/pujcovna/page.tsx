"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"

type Polozka = {
  id: number
  name: string
  category: string
  unit_num: number
  sort_order: number
  cena_typ: "fixni" | "stupnovana" | "kusova"
  cena_fixni: number | null
}

type Stupen = {
  polozka_id: number
  dni_od: number
  dni_do: number | null
  cena_za_den: number
}

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
  stav: string
}

const STAVY = [
  { value: "rezervace",    label: "Rezervace",    barva: "bg-gray-100 text-gray-600" },
  { value: "cekam-platbu", label: "Čekám platbu", barva: "bg-orange-100 text-orange-700" },
  { value: "zaplaceno",    label: "Zaplaceno",    barva: "bg-green-100 text-green-700" },
  { value: "vypujceno",    label: "Vypůjčeno",    barva: "bg-blue-100 text-blue-700" },
  { value: "dokonceno",    label: "Dokončeno",    barva: "bg-sky-100 text-sky-700" },
  { value: "storno",       label: "Storno",       barva: "bg-red-100 text-red-700" },
]

function stavInfo(stav: string) {
  return STAVY.find(s => s.value === stav) ?? STAVY[0]
}

const ROK = new Date().getFullYear()

const MESICE = [
  { label: "Duben",    mesic: 3 },
  { label: "Květen",   mesic: 4 },
  { label: "Červen",   mesic: 5 },
  { label: "Červenec", mesic: 6 },
  { label: "Srpen",    mesic: 7 },
  { label: "Září",     mesic: 8 },
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

function barColor(pct: number) {
  if (pct === 0) return "#d1fae5"
  if (pct < 40) return "#34d399"
  if (pct < 70) return "#10b981"
  if (pct < 90) return "#059669"
  return "#065f46"
}

export default function PujcovnaDashboard() {
  const router = useRouter()
  const [polozky, setPolozky] = useState<Polozka[]>([])
  const [rezervace, setRezervace] = useState<Rezervace[]>([])
  const [stupne, setStupne] = useState<Stupen[]>([])
  const [loading, setLoading] = useState(true)
  const [statRozsireno, setStatRozsireno] = useState(false)

  async function odhlasit() {
    const client = createClient()
    await client.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  useEffect(() => {
    async function nacti() {
      const sb = createClient()
      const [{ data: pol }, { data: rez }, { data: st }] = await Promise.all([
        supabase.from("pujcovna_polozky").select("*").order("sort_order"),
        supabase.from("pujcovna_rezervace").select("*"),
        sb.from("pujcovna_ceny_stupne").select("*"),
      ])
      setPolozky(pol ?? [])
      setRezervace(rez ?? [])
      setStupne(st ?? [])
      setLoading(false)
    }
    nacti()
  }, [])

  const dnesStr = new Date().toISOString().slice(0, 10)
  const stany = polozky.filter(p => p.category === "Stany")
  const totalStanu = stany.reduce((s, p) => s + p.unit_num, 0)
  const stanyIds = new Set(stany.map(p => p.id))
  const rezStanu = rezervace.filter(r => stanyIds.has(r.item_id))

  const letosRez = rezStanu.filter(r => new Date(r.start_date).getFullYear() === ROK)
  const rezRezervace = rezStanu.filter(r => r.stav === "rezervace")
  const cekamPlatbu  = rezStanu.filter(r => r.stav === "cekam-platbu")
  const zaplaceno   = rezStanu.filter(r => r.stav === "zaplaceno")
  const vypujceno   = rezStanu.filter(r => r.stav === "vypujceno")
  const dokonceno   = rezStanu.filter(r => r.stav === "dokonceno")
  const storno      = rezStanu.filter(r => r.stav === "storno")

  const celkemDni = letosRez.reduce((s, r) => s + pocetDni(r.start_date, r.end_date), 0)
  const prumDelka = letosRez.length > 0 ? Math.round(celkemDni / letosRez.length) : 0

  const kapacita = MESICE.map(({ label, mesic }) => {
    const dni = dniVMesici(ROK, mesic)
    const totalDni = totalStanu * dni
    const usedDni = rezStanu.reduce((sum, r) => sum + overlapDni(r.start_date, r.end_date, ROK, mesic), 0)
    const pct = totalDni > 0 ? Math.min(100, Math.round((usedDni / totalDni) * 100)) : 0
    return { label, pct }
  })

  const mesicniStats = MESICE.map(({ label, mesic }) => {
    const rezMesice = letosRez.filter(r =>
      r.stav !== "storno" && new Date(r.start_date).getMonth() === mesic
    )
    const pocet = rezMesice.length
    const hruba = rezMesice.reduce((s, r) => s + (celkovaCenaRezervace(r) ?? 0), 0)
    const cisty = Math.round(hruba / 1.21)
    return { label, pocet, cisty }
  })
  const maxPocet = Math.max(...mesicniStats.map(m => m.pocet), 1)
  const maxCisty = Math.max(...mesicniStats.map(m => m.cisty), 1)

  function stanLabel(itemId: number, unitIndex: number) {
    const p = polozky.find(x => x.id === itemId)
    if (!p) return "—"
    return p.unit_num > 1 ? `${p.name} ${unitIndex + 1}` : p.name
  }

  function vypocitejCenuPolozky(polozka: Polozka, dni: number): number | null {
    if (polozka.cena_typ === "kusova") {
      return polozka.cena_fixni ?? null
    }
    if (polozka.cena_typ === "fixni") {
      if (!polozka.cena_fixni) return null
      return polozka.cena_fixni * dni
    }
    const tier = stupne.find(
      s => s.polozka_id === polozka.id && s.dni_od <= dni && (s.dni_do === null || s.dni_do >= dni)
    )
    return tier ? tier.cena_za_den * dni : null
  }

  function celkovaCenaRezervace(r: Rezervace): number | null {
    const pol = polozky.find(p => p.id === r.item_id)
    if (!pol) return null
    const zakladni = vypocitejCenuPolozky(pol, pocetDni(r.start_date, r.end_date))
    if (zakladni === null) return null
    let celkem = zakladni
    if (r.group_id) {
      const prisl = rezervace.filter(x => x.group_id === r.group_id && x.id !== r.id)
      for (const pr of prisl) {
        const prPol = polozky.find(p => p.id === pr.item_id)
        if (prPol) {
          const prCena = vypocitejCenuPolozky(prPol, pocetDni(pr.start_date, pr.end_date))
          if (prCena !== null) celkem += prCena
        }
      }
    }
    return celkem
  }

  function RezervaceRadek({ r }: { r: Rezervace }) {
    const dniDo = Math.round((new Date(r.start_date).getTime() - new Date(dnesStr).getTime()) / 86400000)
    const dniZbývá = Math.round((new Date(r.end_date).getTime() - new Date(dnesStr).getTime()) / 86400000)
    const dni = pocetDni(r.start_date, r.end_date)
    const info = stavInfo(r.stav)
    const cena = celkovaCenaRezervace(r)

    return (
      <Link href={`/pujcovna/rezervace/${r.id}`} className="flex items-stretch hover:bg-gray-50 transition-colors">

        {/* Datum */}
        <div className="flex flex-col items-center justify-center px-3 py-4 border-r border-gray-100 shrink-0 text-center" style={{ width: 64 }}>
          <span className="text-base font-bold text-gray-900 leading-none">
            {String(new Date(r.start_date).getDate()).padStart(2, "0")}.{String(new Date(r.start_date).getMonth() + 1).padStart(2, "0")}.
          </span>
          <span className="text-xs text-gray-400 mt-0.5">{new Date(r.start_date).getFullYear()}</span>
        </div>

        {/* Zákazník + stan */}
        <div className="flex-1 px-3 md:px-4 py-4 flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
            <p className="font-semibold text-gray-900 truncate">{r.customer}</p>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{stanLabel(r.item_id, r.unit_index)}</p>
        </div>

        {/* Cena výpůjčky */}
        <div className="flex flex-col items-end justify-center px-3 py-4 border-l border-gray-100 shrink-0" style={{ width: 100 }}>
          {cena !== null ? (
            <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{cena.toLocaleString("cs-CZ")} Kč</span>
          ) : (
            <span className="text-gray-300 text-sm">—</span>
          )}
        </div>

        {/* Stav badge */}
        <div className="flex flex-col items-center justify-center px-2 py-4 border-l border-gray-100 shrink-0" style={{ width: 110 }}>
          <span className={`text-xs font-medium px-2 py-1.5 rounded-lg whitespace-nowrap ${info.barva}`}>
            {info.label}
          </span>
        </div>

        {/* Termín */}
        <div className="hidden md:flex flex-col items-end justify-center px-3 py-4 border-l border-gray-100 shrink-0" style={{ width: 120 }}>
          <p className="font-semibold text-gray-900 text-sm">{formatDatum(r.start_date)} – {formatDatum(r.end_date)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{dni} {dni === 1 ? "den" : dni < 5 ? "dny" : "dní"}</p>
        </div>

        {/* Countdown */}
        <div className="flex flex-col items-center justify-center py-4 border-l border-gray-100 shrink-0" style={{ width: 70 }}>
          {r.stav === "vypujceno" ? (
            <>
              <span className="text-xs text-gray-400">Vrácení za</span>
              <span className="text-2xl font-bold text-blue-500 leading-none mt-0.5">{Math.max(0, dniZbývá)}</span>
              <span className="text-xs text-gray-400">dní</span>
            </>
          ) : r.stav === "dokonceno" || r.stav === "storno" ? (
            <span className="text-gray-300 text-sm">—</span>
          ) : dniDo === 0 ? (
            <span className="text-sm font-bold text-emerald-500">Dnes!</span>
          ) : dniDo < 0 ? (
            <span className="text-gray-300 text-sm">—</span>
          ) : (
            <>
              <span className="text-2xl font-bold text-emerald-500 leading-none">{dniDo}</span>
              <span className="text-xs text-gray-400">dní</span>
            </>
          )}
        </div>

      </Link>
    )
  }

  function Blok({ titulek, barva, rezervace, vychozi = true }: {
    titulek: string
    barva: string
    rezervace: Rezervace[]
    vychozi?: boolean
  }) {
    const [otevreno, setOtevreno] = useState(vychozi)
    if (rezervace.length === 0) return null
    const sorted = [...rezervace].sort((a, b) => a.start_date.localeCompare(b.start_date))
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <button
          onClick={() => setOtevreno(o => !o)}
          className="w-full p-4 flex items-center gap-2 hover:bg-gray-50 transition-colors rounded-xl"
        >
          <span className={`w-2.5 h-2.5 rounded-full ${barva}`} />
          <h2 className="font-semibold text-gray-900">{titulek}</h2>
          <span className="text-sm text-gray-400">{rezervace.length}</span>
          <span className={`ml-auto text-gray-400 transition-transform duration-200 ${otevreno ? "rotate-0" : "-rotate-90"}`}>▾</span>
        </button>
        {otevreno && (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {sorted.map(r => <RezervaceRadek key={r.id} r={r} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">

      {/* Hlavička */}
      <div className="w-full bg-emerald-100 py-6">
        <div className="max-w-4xl mx-auto px-4 md:px-8 relative flex items-center justify-center">
          <a href="/" className="absolute left-0 text-xs text-emerald-700 hover:text-emerald-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-emerald-200">
            ← Rozcestník
          </a>
          <h1 className="text-3xl font-bold text-emerald-900 tracking-wide">Autostany Planner</h1>
          <button
            onClick={odhlasit}
            className="absolute right-0 text-xs text-emerald-700 hover:text-emerald-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-emerald-200"
          >
            Odhlásit
          </button>
        </div>
      </div>

      {/* Navigační tlačítka */}
      <div className="max-w-4xl mx-auto px-4 py-5 flex gap-2 mb-3 justify-center">

        {/* Nová rezervace */}
        <Link href="/pujcovna/kalendar" className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors rounded-lg flex items-center justify-center gap-2 px-5 py-2.5 md:w-auto w-12 h-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden md:inline whitespace-nowrap">Nová rezervace</span>
        </Link>

        {/* Kalendář */}
        <Link href="/pujcovna/kalendar" className="bg-white hover:bg-gray-50 text-gray-700 font-medium border border-gray-200 transition-colors rounded-lg flex items-center justify-center gap-2 px-5 py-2.5 md:w-auto w-12 h-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="hidden md:inline whitespace-nowrap">Kalendář</span>
        </Link>

        {/* Zákazníci */}
        <Link href="/zakaznici" className="bg-white hover:bg-gray-50 text-gray-700 font-medium border border-gray-200 transition-colors rounded-lg flex items-center justify-center gap-2 px-5 py-2.5 md:w-auto w-12 h-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="hidden md:inline whitespace-nowrap">Zákazníci</span>
        </Link>

        {/* Ceník */}
        <Link href="/pujcovna/cenik" className="bg-white hover:bg-gray-50 text-gray-700 font-medium border border-gray-200 transition-colors rounded-lg flex items-center justify-center gap-2 px-5 py-2.5 md:w-auto w-12 h-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="hidden md:inline whitespace-nowrap">Ceník</span>
        </Link>

        {/* Rozbalit statistiky */}
        <button
          onClick={() => setStatRozsireno(p => !p)}
          className="w-12 h-12 flex items-center justify-center rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 transition-colors shrink-0"
          title={statRozsireno ? "Skrýt statistiky" : "Ukázat více statistik"}
        >
          <span className={`text-emerald-500 text-base font-bold transition-transform duration-200 inline-block ${statRozsireno ? "rotate-180" : ""}`}>▼</span>
        </button>

      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-8">

        {/* Statistiky — řádek 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
          <StatBox label="Letos celkem" value={loading ? "—" : String(letosRez.length)} />
          <StatBox label="Vypůjčeno" value={loading ? "—" : String(vypujceno.length)} />
          <StatBox label="Zaplaceno" value={loading ? "—" : String(zaplaceno.length)} />
          <StatBox label="Dokončeno" value={loading ? "—" : String(dokonceno.length)} />
        </div>

        {/* Statistiky — řádek 2 (rozšířené) */}
        {statRozsireno && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
            <StatBox label="Celkem dní půjčeno" value={loading ? "—" : `${celkemDni} dní`} />
            <StatBox label="Průměrná délka" value={loading ? "—" : (prumDelka > 0 ? `${prumDelka} dní` : "—")} />
            <StatBox label="Stanů celkem" value={loading ? "—" : String(totalStanu)} />
            <StatBox label="Sezóna" value={String(ROK)} />
          </div>
        )}

        {/* Graf kapacity — vždy viditelný */}
        {!loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Využití kapacity stanů</p>
            <div className="flex items-end gap-3" style={{ height: 120 }}>
              {kapacita.map(({ label, pct }) => (
                <div key={label} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold text-gray-600">{pct > 0 ? `${pct}%` : ""}</span>
                  <div className="w-full rounded-t-lg transition-all duration-500"
                    style={{ height: `${Math.max(pct, 2)}%`, maxHeight: 80, minHeight: 4, backgroundColor: barColor(pct) }} />
                  <div className="w-full h-0.5 bg-gray-200 rounded" />
                  <span className="text-[10px] text-gray-500 font-medium text-center leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Graf rezervací a příjmu po měsících */}
        {!loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Rezervace a příjem bez DPH</p>
              <div className="flex items-center gap-3 text-[10px] text-gray-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-400" />Rezervace</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-blue-400" />Příjem bez DPH</span>
              </div>
            </div>
            <div className="flex gap-2" style={{ height: 130 }}>
              {mesicniStats.map(({ label, pocet, cisty }) => {
                const cH = pocet > 0 ? Math.max(4, Math.round((pocet / maxPocet) * 72)) : 0
                const mH = cisty > 0 ? Math.max(4, Math.round((cisty / maxCisty) * 72)) : 0
                return (
                  <div key={label} className="flex-1 flex flex-col items-center justify-end gap-1">
                    <div className="w-full flex items-end gap-0.5" style={{ height: 84 }}>
                      {/* Počet rezervací */}
                      <div className="flex-1 flex flex-col items-center justify-end h-full">
                        {pocet > 0 && <span className="text-[9px] font-bold text-emerald-600 leading-none mb-0.5">{pocet}</span>}
                        <div className="w-full rounded-t-sm transition-all duration-500" style={{ height: cH, backgroundColor: "#34d399" }} />
                      </div>
                      {/* Příjem bez DPH */}
                      <div className="flex-1 flex flex-col items-center justify-end h-full">
                        {cisty > 0 && <span className="text-[9px] font-bold text-blue-500 leading-none mb-0.5">{Math.round(cisty / 1000)}k</span>}
                        <div className="w-full rounded-t-sm transition-all duration-500" style={{ height: mH, backgroundColor: "#60a5fa" }} />
                      </div>
                    </div>
                    <div className="w-full h-0.5 bg-gray-200 rounded" />
                    <span className="text-[10px] text-gray-500 font-medium text-center leading-tight">{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mb-8" />

        {/* Bloky rezervací */}
        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center text-gray-400">
            Načítám...
          </div>
        )}

        {!loading && rezStanu.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
            Žádné rezervace stanů. Přidej první v Kalendáři.
          </div>
        )}

        {!loading && (
          <>
            <Blok titulek="Rezervace" barva="bg-gray-400" rezervace={rezRezervace} />
            <Blok titulek="Čekám platbu" barva="bg-orange-400" rezervace={cekamPlatbu} />
            <Blok titulek="Zaplaceno" barva="bg-green-400" rezervace={zaplaceno} />
            <Blok titulek="Vypůjčeno" barva="bg-blue-400" rezervace={vypujceno} />
            <Blok titulek="Dokončeno" barva="bg-sky-400" rezervace={dokonceno} vychozi={false} />
            <Blok titulek="Storno" barva="bg-red-400" rezervace={storno} vychozi={false} />
          </>
        )}

      </div>
    </main>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  )
}
