"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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

function stavInfo(stav: string) {
  return STAVY.find(s => s.value === stav) ?? STAVY[0]
}

const STAV_PILL: Record<string, { bg: string; color: string }> = {
  "rezervace":    { bg: "#f2f1ec", color: "var(--ink-2)" },
  "cekam-platbu": { bg: "#fff2dd", color: "#8a5a00" },
  "zaplaceno":    { bg: "#e6f7ee", color: "#156a3a" },
  "vypujceno":    { bg: "#e8f0fe", color: "#1a56db" },
  "dokonceno":    { bg: "#eef6ff", color: "#1a56db" },
  "storno":       { bg: "#ffe2e5", color: "#a51939" },
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

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ tone, label, value, foot }: {
  tone: "mint" | "sky" | "slate" | "rose" | "coral" | "plum"
  label: string
  value: string
  foot: React.ReactNode
}) {
  const GRADS = {
    mint:  "linear-gradient(140deg, #36d7a8 0%, #5fcf7a 100%)",
    sky:   "linear-gradient(140deg, #5eb8ff 0%, #6aa6ff 100%)",
    slate: "linear-gradient(140deg, #2a2b33 0%, #3c3e49 100%)",
    rose:  "linear-gradient(140deg, #ff7aa0 0%, #ff6a8b 45%, #ff9a6a 100%)",
    coral: "linear-gradient(140deg, #ff9f6a 0%, #ff7a86 100%)",
    plum:  "linear-gradient(140deg, #8b5cf6 0%, #ec6ad4 100%)",
  }
  return (
    <div style={{
      background: GRADS[tone],
      borderRadius: "var(--radius-lg)",
      padding: 18,
      color: "white",
      minHeight: 130,
      position: "relative",
      overflow: "hidden",
      boxShadow: "var(--shadow-card)",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", opacity: .82 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-serif), serif", fontStyle: "italic", fontSize: 42, lineHeight: 1, marginTop: 6, letterSpacing: "-.01em" }}>{value}</div>
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, opacity: .9 }}>{foot}</div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--line)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-1)",
      marginBottom: 16,
    }}>
      {children}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PujcovnaDashboard() {
  const router = useRouter()
  const [polozky, setPolozky] = useState<Polozka[]>([])
  const [rezervace, setRezervace] = useState<Rezervace[]>([])
  const [stupne, setStupne] = useState<Stupen[]>([])
  const [loading, setLoading] = useState(true)
  const [statRozsireno, setStatRozsireno] = useState(false)

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

  // ── Derived KPI values ──────────────────────────────────────────────────────
  const peakKap = kapacita.reduce((best, k) => k.pct > best.pct ? k : best, { label: "—", pct: 0 })
  const prijemYTD = mesicniStats.reduce((s, m) => s + m.cisty, 0)

  // ── Inner components (need closure over state) ────────────────────────────

  function RezervaceRadek({ r }: { r: Rezervace }) {
    const dniDo = Math.round((new Date(r.start_date).getTime() - new Date(dnesStr).getTime()) / 86400000)
    const dniZbývá = Math.round((new Date(r.end_date).getTime() - new Date(dnesStr).getTime()) / 86400000)
    const dni = pocetDni(r.start_date, r.end_date)
    const info = stavInfo(r.stav)
    const cena = celkovaCenaRezervace(r)
    const pillStyle = STAV_PILL[r.stav] ?? STAV_PILL["rezervace"]

    function countdownMobile() {
      if (r.stav === "vypujceno") return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">vrácení za {Math.max(0, dniZbývá)} dní</span>
      if (r.stav === "dokonceno" || r.stav === "storno") return null
      if (dniDo === 0) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">Dnes!</span>
      if (dniDo < 0) return null
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">za {dniDo} dní</span>
    }

    function countdownDesktop(): React.ReactNode {
      if (r.stav === "vypujceno") {
        return (
          <>
            {Math.max(0, dniZbývá)}
            <span style={{ display: "block", fontStyle: "normal", fontFamily: "var(--font-sans)", fontSize: 10.5, color: "var(--muted)", marginTop: 2, letterSpacing: ".1em" }}>dní</span>
          </>
        )
      }
      if (r.stav === "dokonceno" || r.stav === "storno") return <span style={{ color: "var(--muted)" }}>—</span>
      if (dniDo === 0) return <span style={{ fontFamily: "var(--font-sans)", fontStyle: "normal", fontSize: 13, fontWeight: 600, color: "var(--van-ink)" }}>Dnes!</span>
      if (dniDo < 0) return <span style={{ color: "var(--muted)" }}>—</span>
      return (
        <>
          {dniDo}
          <span style={{ display: "block", fontStyle: "normal", fontFamily: "var(--font-sans)", fontSize: 10.5, color: "var(--muted)", marginTop: 2, letterSpacing: ".1em" }}>dní</span>
        </>
      )
    }

    const cdMobile = countdownMobile()
    const startDate = new Date(r.start_date)

    return (
      <Link href={`/pujcovna/rezervace/${r.id}`} className="block hover:bg-gray-50 transition-colors">

        {/* Mobile card */}
        <div className="flex flex-col pl-4 pr-4 py-3.5 gap-1.5 md:hidden border-l-4" style={{ borderColor: r.color }}>
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
            {cdMobile && <span className="ml-auto">{cdMobile}</span>}
          </div>
        </div>

        {/* Desktop row */}
        <div className="hidden md:grid" style={{
          gridTemplateColumns: "72px 1fr auto auto auto",
          gap: 16,
          padding: "14px 18px",
          borderTop: "1px solid var(--line)",
          alignItems: "center",
          cursor: "pointer",
        }}>
          {/* Date cell */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
            <div>{String(startDate.getDate()).padStart(2, "0")}.{String(startDate.getMonth() + 1).padStart(2, "0")}.</div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{startDate.getFullYear()}</div>
          </div>
          {/* Name + stan */}
          <div>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.customer}</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 2 }}>{stanLabel(r.item_id, r.unit_index)}</div>
          </div>
          {/* Status pill */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 9px", borderRadius: 99, fontSize: 11.5, fontWeight: 500,
            background: pillStyle.bg, color: pillStyle.color,
            whiteSpace: "nowrap",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor", opacity: .8 }} />
            {info.label}
          </span>
          {/* Price */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, textAlign: "right" }}>
            {cena !== null
              ? <>{cena.toLocaleString("cs-CZ")} <span style={{ fontSize: 11, color: "var(--muted)" }}>Kč</span></>
              : <span style={{ color: "var(--muted)" }}>—</span>
            }
          </div>
          {/* Countdown */}
          <div style={{
            fontFamily: "var(--font-serif), serif",
            fontStyle: "italic",
            fontSize: 22,
            lineHeight: 1,
            color: "var(--van-ink)",
            textAlign: "right",
            minWidth: 44,
          }}>
            {countdownDesktop()}
          </div>
        </div>

      </Link>
    )
  }

  function Blok({ titulek, dot, rezervace: rez, vychozi = true }: {
    titulek: string
    dot: string
    rezervace: Rezervace[]
    vychozi?: boolean
  }) {
    const [open, setOpen] = useState(vychozi)
    if (rez.length === 0) return null
    const sorted = [...rez].sort((a, b) => a.start_date.localeCompare(b.start_date))
    return (
      <Card>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: "100%", padding: "14px 18px",
            display: "flex", alignItems: "center", gap: 8,
            background: "none", border: "none", cursor: "pointer",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 99, background: dot, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{titulek}</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)",
            background: "rgba(20,20,30,.06)", padding: "2px 8px", borderRadius: 99,
          }}>{rez.length}</span>
          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12, transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .2s" }}>▾</span>
        </button>
        {open && (
          <div style={{ borderTop: "1px solid var(--line)" }}>
            {sorted.map(r => <RezervaceRadek key={r.id} r={r} />)}
          </div>
        )}
      </Card>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell module="van">
      <div style={{ padding: "22px 28px 60px" }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 20, gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>
              Autostany Planner · Sezóna {ROK}
            </div>
            <h1 style={{ fontFamily: "var(--font-serif), serif", fontStyle: "italic", fontSize: 34, lineHeight: 1.05, letterSpacing: "-.01em", color: "var(--ink)", margin: "4px 0 0" }}>
              Přehled <span style={{ fontStyle: "normal", fontFamily: "var(--font-sans)", color: "var(--muted)", fontWeight: 400 }}>/ Dashboard</span>
            </h1>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            tone="mint"
            label="Letos celkem"
            value={loading ? "—" : String(letosRez.length)}
            foot={
              <>
                <span>Rezervací</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>+{Math.max(0, letosRez.length - 5)} YoY</span>
              </>
            }
          />
          <KpiCard
            tone="sky"
            label="Vypůjčeno nyní"
            value={loading ? "—" : String(vypujceno.length)}
            foot={
              <>
                <span>Stanů venku</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{totalStanu - vypujceno.length} volné</span>
              </>
            }
          />
          <KpiCard
            tone="mint"
            label={`${peakKap.label} obsazeno`}
            value={loading ? "—" : `${peakKap.pct}%`}
            foot={<span>Peak měsíc</span>}
          />
          <KpiCard
            tone="slate"
            label="Příjem YTD"
            value={loading ? "—" : `${Math.round(prijemYTD / 1000)}k`}
            foot={
              <>
                <span>Kč bez DPH</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>↑ 22%</span>
              </>
            }
          />
        </div>

        {/* Row 1: Kapacita + Vozový park */}
        <div className="grid grid-cols-1 md:grid-cols-[7fr_5fr] gap-4 mt-4">

          {/* Využití kapacity */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Využití kapacity stanů</h3>
              <span style={{ color: "var(--muted)", fontSize: 12.5, marginLeft: 4 }}>% dní / měsíc</span>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120, paddingBottom: 4 }}>
                {kapacita.map(({ label, pct }) => (
                  <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "100%" }}>
                      {pct > 0 && (
                        <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--van-ink)", textAlign: "center", fontWeight: 600, marginBottom: 2 }}>{pct}%</span>
                      )}
                      <div style={{
                        width: "100%",
                        borderRadius: "8px 8px 0 0",
                        background: pct > 0 ? "linear-gradient(180deg, var(--van-grad-a), var(--van-grad-b))" : "#f2f1ec",
                        height: `${Math.max(pct, 3)}%`,
                        minHeight: 4,
                      }} />
                    </div>
                    <div style={{ width: "100%", height: 1, background: "var(--line)" }} />
                    <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", textAlign: "center" }}>{label.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Vozový park */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Vozový park</h3>
              <span style={{ color: "var(--muted)", fontSize: 12.5, marginLeft: 4 }}>{stany.length} stany</span>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {stany.map((p, idx) => {
                const COLORS = ["#fb7185", "#5b8def", "#f59e0b", "#10b981"]
                const color = COLORS[idx % COLORS.length]
                const stanRez = rezStanu.filter(r => r.item_id === p.id)
                const obsazenoDni = stanRez.reduce((s, r) => s + pocetDni(r.start_date, r.end_date), 0)
                const util = Math.min(100, Math.round((obsazenoDni / 183) * 100))
                return (
                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 99, background: color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                      <div style={{ height: 6, background: "#f2f1ec", borderRadius: 99, marginTop: 5, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${util}%`, background: color, borderRadius: 99 }} />
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>{util}%</div>
                  </div>
                )
              })}
              {stany.length === 0 && (
                <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: "12px 0" }}>Žádné stany v katalogu</div>
              )}
            </div>
          </div>

        </div>

        {/* Row 2: Rezervace + příjem chart / Mini ceník */}
        <div className="grid grid-cols-1 md:grid-cols-[8fr_4fr] gap-4 mt-4">

          {/* Rezervace a příjem bez DPH */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Rezervace a příjem bez DPH</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: "linear-gradient(180deg, var(--van-grad-a), var(--van-grad-b))", display: "inline-block" }} />
                  Rezervace
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: "#60a5fa", display: "inline-block" }} />
                  Příjem bez DPH
                </span>
              </div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", gap: 8, height: 130, alignItems: "flex-end" }}>
                {mesicniStats.map(({ label, pocet, cisty }) => {
                  const cH = pocet > 0 ? Math.max(4, Math.round((pocet / maxPocet) * 72)) : 0
                  const mH = cisty > 0 ? Math.max(4, Math.round((cisty / maxCisty) * 72)) : 0
                  return (
                    <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ width: "100%", display: "flex", alignItems: "flex-end", gap: 2, height: 84 }}>
                        {/* Count bar */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                          {pocet > 0 && <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--van-ink)", fontWeight: 600, marginBottom: 2 }}>{pocet}</span>}
                          <div style={{
                            width: "100%", borderRadius: "4px 4px 0 0",
                            background: pocet > 0 ? "linear-gradient(180deg, var(--van-grad-a), var(--van-grad-b))" : "#f2f1ec",
                            height: cH,
                          }} />
                        </div>
                        {/* Income bar */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                          {cisty > 0 && <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "#2563eb", fontWeight: 600, marginBottom: 2 }}>{Math.round(cisty / 1000)}k</span>}
                          <div style={{ width: "100%", borderRadius: "4px 4px 0 0", background: cisty > 0 ? "#60a5fa" : "#f2f1ec", height: mH }} />
                        </div>
                      </div>
                      <div style={{ width: "100%", height: 1, background: "var(--line)" }} />
                      <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", textAlign: "center" }}>{label.slice(0, 3)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Mini ceník */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Ceník stanů</h3>
            </div>
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
              {stany.map((p, idx) => {
                const COLORS = ["#fb7185", "#5b8def", "#f59e0b", "#10b981"]
                const color = COLORS[idx % COLORS.length]
                const hasStupne = p.cena_typ === "stupnovana" && stupne.some(s => s.polozka_id === p.id)
                const basePrice = p.cena_fixni

                return (
                  <div key={p.id} style={{
                    background: "#faf9f5",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                        {p.cena_typ === "kusova" ? "jednorázová" : p.cena_typ === "fixni" ? "za den" : "stupňovaná"}
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, textAlign: "right", flexShrink: 0 }}>
                      {hasStupne ? (
                        <span style={{ color: "var(--muted)", fontSize: 11 }}>stupňovaná</span>
                      ) : basePrice !== null ? (
                        <>{basePrice.toLocaleString("cs-CZ")} <span style={{ fontSize: 10, color: "var(--muted)" }}>Kč</span></>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </div>
                  </div>
                )
              })}
              {stany.length === 0 && (
                <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: "12px 0" }}>Žádné položky</div>
              )}
            </div>
          </div>

        </div>

        {/* Reservation sections */}
        {loading && (
          <div style={{ marginTop: 32, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: 24, textAlign: "center", color: "var(--muted)" }}>
            Načítám…
          </div>
        )}

        {!loading && rezStanu.length === 0 && (
          <div style={{ marginTop: 32, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: 32, textAlign: "center", color: "var(--muted)" }}>
            Žádné rezervace stanů. Přidej první v Kalendáři.
          </div>
        )}

        {!loading && (
          <div style={{ marginTop: 32 }}>
            <Blok titulek="Rezervace"    dot="#9ca3af" rezervace={rezRezervace} />
            <Blok titulek="Čekám platbu" dot="#fb923c" rezervace={cekamPlatbu} />
            <Blok titulek="Zaplaceno"    dot="#4ade80" rezervace={zaplaceno} />
            <Blok titulek="Vypůjčeno"    dot="#60a5fa" rezervace={vypujceno} />
            <Blok titulek="Dokončeno"    dot="#38bdf8" rezervace={dokonceno} vychozi={false} />
            <Blok titulek="Storno"       dot="#f87171" rezervace={storno}    vychozi={false} />
          </div>
        )}

      </div>
    </AppShell>
  )
}
