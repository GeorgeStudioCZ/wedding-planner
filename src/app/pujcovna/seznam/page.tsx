"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import AppShell from "@/components/AppShell"

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

const STAV_PILL: Record<string, { bg: string; color: string }> = {
  "rezervace":    { bg: "#f2f1ec", color: "var(--ink-2)" },
  "cekam-platbu": { bg: "#fff2dd", color: "#8a5a00" },
  "zaplaceno":    { bg: "#e6f7ee", color: "#156a3a" },
  "vypujceno":    { bg: "#e8f0fe", color: "#1a56db" },
  "dokonceno":    { bg: "#eef6ff", color: "#1a56db" },
  "storno":       { bg: "#ffe2e5", color: "#a51939" },
}

function stavInfo(stav: string) {
  return STAVY.find(s => s.value === stav) ?? STAVY[0]
}

function pocetDni(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
}

function formatDatum(d: string) {
  return new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "short" })
}

export default function SeznamRezervaci() {
  const [polozky, setPolozky] = useState<Polozka[]>([])
  const [rezervace, setRezervace] = useState<Rezervace[]>([])
  const [stupne, setStupne] = useState<Stupen[]>([])
  const [loading, setLoading] = useState(true)
  const [hledani, setHledani] = useState("")
  const [aktivniStav, setAktivniStav] = useState<string | null>(null)

  useEffect(() => {
    async function nacti() {
      const sb = createClient()
      const [{ data: pol }, { data: rez }, { data: st }] = await Promise.all([
        supabase.from("pujcovna_polozky").select("*").order("sort_order"),
        supabase.from("pujcovna_rezervace").select("*").order("start_date", { ascending: false }),
        sb.from("pujcovna_ceny_stupne").select("*"),
      ])
      setPolozky(pol ?? [])
      setRezervace(rez ?? [])
      setStupne(st ?? [])
      setLoading(false)
    }
    nacti()
  }, [])

  const stanyIds = new Set(polozky.filter(p => p.category === "Stany").map(p => p.id))
  const rezStanu = rezervace.filter(r => stanyIds.has(r.item_id))

  function stanLabel(itemId: number, unitIndex: number) {
    const p = polozky.find(x => x.id === itemId)
    if (!p) return "—"
    return p.unit_num > 1 ? `${p.name} ${unitIndex + 1}` : p.name
  }

  function vypocitejCenuPolozky(polozka: Polozka, dni: number): number | null {
    if (polozka.cena_typ === "kusova") return polozka.cena_fixni ?? null
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
    const dni = pocetDni(r.start_date, r.end_date)
    const zakladni = vypocitejCenuPolozky(pol, dni)
    if (zakladni === null) return null
    let celkem = zakladni
    if (pol.category === "Stany" && dni <= 4) celkem += 500
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

  const dnesStr = new Date().toISOString().slice(0, 10)

  let filtrovane = rezStanu
  if (aktivniStav) filtrovane = filtrovane.filter(r => r.stav === aktivniStav)
  if (hledani.trim()) {
    const q = hledani.toLowerCase()
    filtrovane = filtrovane.filter(r =>
      r.customer.toLowerCase().includes(q) ||
      stanLabel(r.item_id, r.unit_index).toLowerCase().includes(q)
    )
  }

  const poctyStavu: Record<string, number> = {}
  for (const r of rezStanu) {
    poctyStavu[r.stav] = (poctyStavu[r.stav] ?? 0) + 1
  }

  function RezervaceRadek({ r }: { r: Rezervace }) {
    const dniDo = Math.round((new Date(r.start_date).getTime() - new Date(dnesStr).getTime()) / 86400000)
    const dniZbyvá = Math.round((new Date(r.end_date).getTime() - new Date(dnesStr).getTime()) / 86400000)
    const dni = pocetDni(r.start_date, r.end_date)
    const info = stavInfo(r.stav)
    const cena = celkovaCenaRezervace(r)
    const pillStyle = STAV_PILL[r.stav] ?? STAV_PILL["rezervace"]
    const startDate = new Date(r.start_date)

    function cdPill() {
      if (r.stav === "vypujceno") return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
          vrácení za {Math.max(0, dniZbyvá)} dní
        </span>
      )
      if (r.stav === "dokonceno" || r.stav === "storno") return null
      if (dniDo === 0) return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">Dnes!</span>
      )
      if (dniDo < 0) return null
      return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
          za {dniDo} dní
        </span>
      )
    }

    const pill = cdPill()

    return (
      <Link href={`/pujcovna/rezervace/${r.id}`} className="block hover:bg-gray-50 transition-colors">

        {/* Mobile card */}
        <div className="flex flex-col pl-4 pr-4 py-3.5 gap-1.5 ipad:hidden border-l-4" style={{ borderColor: r.color }}>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 flex-1 truncate text-sm">{r.customer}</p>
            <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${info.barva}`}>{info.label}</span>
          </div>
          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{formatDatum(r.start_date)}</span>
            <span className="text-gray-300">·</span>
            <span>{stanLabel(r.item_id, r.unit_index)}</span>
            <span className="text-gray-300">·</span>
            <span>{dni} {dni === 1 ? "den" : dni < 5 ? "dny" : "dní"}</span>
            {cena !== null && (
              <>
                <span className="text-gray-300">·</span>
                <span className="font-semibold text-gray-700">{cena.toLocaleString("cs-CZ")} Kč</span>
              </>
            )}
            {pill && <span className="ml-auto">{pill}</span>}
          </div>
        </div>

        {/* Desktop row */}
        <div className="hidden ipad:grid" style={{
          gridTemplateColumns: "72px 1fr auto auto auto",
          gap: 16,
          padding: "14px 18px",
          borderTop: "1px solid var(--line)",
          alignItems: "center",
          cursor: "pointer",
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
            <div>{String(startDate.getDate()).padStart(2, "0")}.{String(startDate.getMonth() + 1).padStart(2, "0")}.</div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{startDate.getFullYear()}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.customer}</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 2 }}>{stanLabel(r.item_id, r.unit_index)}</div>
          </div>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 9px", borderRadius: 99, fontSize: 11.5, fontWeight: 500,
            background: pillStyle.bg, color: pillStyle.color, whiteSpace: "nowrap",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor", opacity: .8 }} />
            {info.label}
          </span>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, textAlign: "right" }}>
            {cena !== null
              ? <>{cena.toLocaleString("cs-CZ")} <span style={{ fontSize: 11, color: "var(--muted)" }}>Kč</span></>
              : <span style={{ color: "var(--muted)" }}>—</span>
            }
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right", color: "var(--muted)", minWidth: 44 }}>
            {dni} {dni === 1 ? "den" : dni < 5 ? "dny" : "dní"}
          </div>
        </div>

      </Link>
    )
  }

  return (
    <AppShell module="van">
      <div className="px-4 ipad:px-8" style={{ paddingTop: 22, paddingBottom: 60 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>
              Autostany Planner
            </div>
            <h1 style={{ fontFamily: "var(--font-serif), serif", fontStyle: "normal", fontWeight: 700, fontSize: 34, lineHeight: 1.05, letterSpacing: "-.01em", color: "var(--ink)", margin: "4px 0 0" }}>
              Seznam <span style={{ fontStyle: "normal", fontFamily: "var(--font-sans)", color: "var(--muted)", fontWeight: 400 }}>/ Rezervace</span>
            </h1>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <input
              type="text"
              placeholder="Hledat zákazníka, stan…"
              value={hledani}
              onChange={e => setHledani(e.target.value)}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 13,
                outline: "none",
                background: "white",
                width: "100%",
                maxWidth: 240,
              }}
            />
          </div>
        </div>

        {/* Stav filter tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          <button
            onClick={() => setAktivniStav(null)}
            style={{
              padding: "5px 14px", borderRadius: 99, fontSize: 12.5, fontWeight: 500,
              border: "1px solid",
              borderColor: aktivniStav === null ? "var(--van-ink)" : "var(--line)",
              background: aktivniStav === null ? "var(--van-ink)" : "white",
              color: aktivniStav === null ? "white" : "var(--ink-2)",
              cursor: "pointer",
            }}
          >
            Vše <span style={{ opacity: .7 }}>({rezStanu.length})</span>
          </button>
          {STAVY.map(s => {
            const pocet = poctyStavu[s.value] ?? 0
            if (pocet === 0) return null
            const active = aktivniStav === s.value
            const pill = STAV_PILL[s.value]
            return (
              <button
                key={s.value}
                onClick={() => setAktivniStav(active ? null : s.value)}
                style={{
                  padding: "5px 14px", borderRadius: 99, fontSize: 12.5, fontWeight: 500,
                  border: "1px solid",
                  borderColor: active ? pill.color : "var(--line)",
                  background: active ? pill.bg : "white",
                  color: active ? pill.color : "var(--ink-2)",
                  cursor: "pointer",
                }}
              >
                {s.label} <span style={{ opacity: .7 }}>({pocet})</span>
              </button>
            )
          })}
        </div>

        {/* Column headers — desktop only */}
        <div className="hidden ipad:grid" style={{
          gridTemplateColumns: "72px 1fr auto auto auto",
          gap: 16,
          padding: "8px 18px",
          marginBottom: 4,
          color: "var(--muted)",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          letterSpacing: ".1em",
          textTransform: "uppercase",
        }}>
          <div>Datum</div>
          <div>Zákazník / Stan</div>
          <div>Stav</div>
          <div style={{ textAlign: "right" }}>Cena</div>
          <div style={{ textAlign: "right" }}>Dní</div>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: 32, textAlign: "center", color: "var(--muted)" }}>
            Načítám…
          </div>
        ) : filtrovane.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: 32, textAlign: "center", color: "var(--muted)" }}>
            {hledani || aktivniStav ? "Žádné výsledky" : "Zatím žádné rezervace stanů."}
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            {filtrovane.map(r => <RezervaceRadek key={r.id} r={r} />)}
          </div>
        )}

        {!loading && filtrovane.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
            {filtrovane.length} {filtrovane.length === 1 ? "rezervace" : filtrovane.length < 5 ? "rezervace" : "rezervací"}
            {filtrovane.length !== rezStanu.length && ` z ${rezStanu.length} celkem`}
          </div>
        )}

      </div>
    </AppShell>
  )
}
