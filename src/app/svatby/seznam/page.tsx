"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import AppShell from "@/components/AppShell"

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
  videohovor_datum: string | null
  cas_prijezdu: string | null
  cas_obradu: string | null
  pocet_svatebcanu: number | null
}

// ── Design tokens (shodné s dashboardem) ────────────────────────
const WED_PILL: Record<string, { bg: string; color: string }> = {
  "poptavka":     { bg: "#f2f1ec", color: "var(--ink-2)" },
  "rozhoduje-se": { bg: "#fff9c4", color: "#7a5c00" },
  "objednavka":   { bg: "#e8f0fe", color: "#1a56db" },
  "cekam-platbu": { bg: "#fff2dd", color: "#8a5a00" },
  "zaplaceno":    { bg: "#e6f7ee", color: "#156a3a" },
  "ve-strizne":   { bg: "#f3e8ff", color: "#6b21a8" },
  "po-svatbe":    { bg: "#e0f2fe", color: "#0369a1" },
  "ukonceno":     { bg: "#f1f5f9", color: "#475569" },
}

const STAV_BORDER: Record<string, string> = {
  "poptavka":     "#9ca3af",
  "rozhoduje-se": "#fbbf24",
  "objednavka":   "#60a5fa",
  "cekam-platbu": "#fb923c",
  "zaplaceno":    "#4ade80",
  "ve-strizne":   "#c084fc",
  "po-svatbe":    "#38bdf8",
  "ukonceno":     "#94a3b8",
}

const TYP_BADGE: Record<string, { bg: string; color: string }> = {
  "foto":       { bg: "#dbeafe", color: "#1d4ed8" },
  "video":      { bg: "#ffe4e6", color: "#be123c" },
  "foto+video": { bg: "#ffedd5", color: "#c2410c" },
}

const STAV_LABEL: Record<string, string> = {
  "poptavka":     "Poptávka",
  "rozhoduje-se": "Rozhoduje se",
  "objednavka":   "Objednávka",
  "cekam-platbu": "Čeká platbu",
  "zaplaceno":    "Zaplaceno",
  "ve-strizne":   "Ve střižně",
  "po-svatbe":    "Po svatbě",
  "ukonceno":     "Ukončeno",
}

const STAVOVE_FILTRY: { value: string; label: string }[] = [
  { value: "vse",          label: "Vše" },
  { value: "poptavka",     label: "Poptávka" },
  { value: "rozhoduje-se", label: "Rozhoduje se" },
  { value: "objednavka",   label: "Objednávka" },
  { value: "cekam-platbu", label: "Čeká platbu" },
  { value: "zaplaceno",    label: "Zaplaceno" },
  { value: "ve-strizne",   label: "Ve střižně" },
  { value: "po-svatbe",    label: "Po svatbě" },
  { value: "ukonceno",     label: "Ukončeno" },
]

function typLabel(typ: string) {
  if (typ === "foto+video") return "Foto + Video"
  if (typ === "foto") return "Foto"
  if (typ === "video") return "Video"
  return typ ?? "—"
}

function balicekLabel(b: string) {
  const map: Record<string, string> = {
    "pul-den-6": "6 hod",
    "pul-den":   "8 hod",
    "cely-den":  "10 hod",
    "do-vecera": "12 hod",
  }
  return map[b] ?? b ?? null
}

function formatCas(cas: string | null) {
  if (!cas) return null
  return cas.slice(0, 5)   // "HH:MM:SS" → "HH:MM"
}

// Sdílená šířka sloupců — stejná v záhlaví i řádcích
const W = {
  datum:      66,
  videohovor: 48,
  typ:       120,
  stav:      136,
  balicek:    82,
  prijezd:    72,
  obrad:      72,
  hoste:      68,
  cena:      108,
  vzdal:      76,
}

export default function SeznamSvateb() {
  const [zakazky, setZakazky]     = useState<Zakazka[]>([])
  const [loading, setLoading]     = useState(true)
  const [stavFilter, setStavFilter] = useState("vse")
  const [search, setSearch]       = useState("")

  useEffect(() => {
    supabase
      .from("zakazky")
      .select("id, datum_svatby, jmeno_nevesty, jmeno_zenicha, stav, adresa_obradu, typ_sluzby, balicek, cena, vzdalenost_km, videohovor_datum, cas_prijezdu, cas_obradu, pocet_svatebcanu")
      .order("datum_svatby", { ascending: true })
      .then(({ data }) => {
        setZakazky(data ?? [])
        setLoading(false)
      })
  }, [])

  const filtered = zakazky
    .filter(z => stavFilter === "vse" || z.stav === stavFilter)
    .filter(z => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        z.jmeno_nevesty?.toLowerCase().includes(q) ||
        z.jmeno_zenicha?.toLowerCase().includes(q) ||
        z.adresa_obradu?.toLowerCase().includes(q)
      )
    })

  // Seskupení po rocích
  const byYear = filtered.reduce<Record<number, Zakazka[]>>((acc, z) => {
    const yr = z.datum_svatby ? new Date(z.datum_svatby).getFullYear() : 0
    if (!acc[yr]) acc[yr] = []
    acc[yr].push(z)
    return acc
  }, {})
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b)

  const celkovaCena = filtered.reduce((s, z) => s + (z.cena || 0), 0)

  async function zmenStav(id: string, novyStav: string) {
    await supabase.from("zakazky").update({ stav: novyStav }).eq("id", id)
    await supabase.from("zakazky_historie").insert([{ zakazka_id: id, stav: novyStav }])
    setZakazky(prev => prev.map(z => z.id === id ? { ...z, stav: novyStav } : z))
  }

  // Pipe — svislý oddělovač
  const Pipe = () => (
    <div style={{ width: 1, background: "var(--line)", alignSelf: "stretch", flexShrink: 0 }} />
  )

  return (
    <AppShell module="wed">
      <div className="px-4 sm:px-8" style={{ paddingTop: 28, paddingBottom: 72 }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
            Wedding Planner · Zakázky
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: "var(--font-serif), serif", fontWeight: 700, fontStyle: "normal", fontSize: 32, lineHeight: 1.05, color: "var(--ink)", margin: 0 }}>
              Seznam zakázek{" "}
              <span style={{ fontFamily: "var(--font-sans)", color: "var(--muted)", fontWeight: 400, fontSize: 20 }}>
                / All Weddings
              </span>
            </h1>
            {!loading && (
              <div style={{ display: "flex", gap: 18, paddingBottom: 3, alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)" }}>
                  <strong style={{ color: "var(--ink)", fontSize: 15 }}>{filtered.length}</strong> zakázek
                </span>
                {celkovaCena > 0 && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)" }}>
                    <strong style={{ color: "var(--ink)", fontSize: 15 }}>{celkovaCena.toLocaleString("cs-CZ")} Kč</strong> celkem
                  </span>
                )}
              </div>
            )}
            <Link href="/svatby/zakazky/nova" style={{ marginLeft: "auto", textDecoration: "none" }}>
              <button style={{
                background: "linear-gradient(135deg, #ff6a8b, #ff9a6a)",
                color: "white", border: "none",
                borderRadius: "var(--radius-md)", padding: "9px 20px",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(255,106,139,.35)",
              }}>
                + Nová zakázka
              </button>
            </Link>
          </div>
        </div>

        {/* ── Filter + search bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
          {/* Status filter tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
            {STAVOVE_FILTRY.map(f => {
              const active  = stavFilter === f.value
              const dot     = STAV_BORDER[f.value]
              const count   = f.value === "vse"
                ? zakazky.length
                : zakazky.filter(z => z.stav === f.value).length
              if (count === 0 && f.value !== "vse") return null
              return (
                <button
                  key={f.value}
                  onClick={() => setStavFilter(f.value)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 13px", borderRadius: 99,
                    border: "1px solid",
                    fontSize: 12, fontWeight: 500, cursor: "pointer",
                    transition: "all .15s",
                    background: active ? "var(--ink)" : "var(--surface)",
                    color: active ? "white" : "var(--ink-2)",
                    borderColor: active ? "var(--ink)" : "var(--line-strong)",
                  }}
                >
                  {dot && (
                    <span style={{
                      width: 6, height: 6, borderRadius: 99, flexShrink: 0,
                      background: active ? "rgba(255,255,255,.65)" : dot,
                    }} />
                  )}
                  {f.label}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: .65 }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          {/* Search */}
          <input
            type="text"
            placeholder="Hledat jméno, adresu…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: "7px 14px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--line-strong)",
              fontSize: 12.5, color: "var(--ink)",
              background: "var(--surface)", outline: "none",
              width: "100%", maxWidth: 220, fontFamily: "inherit",
            }}
          />
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div style={{
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)", padding: "56px 0",
            textAlign: "center", color: "var(--muted)", fontSize: 13,
          }}>
            Načítám…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)", padding: "56px 0",
            textAlign: "center", color: "var(--muted)", fontSize: 13,
          }}>
            Žádné záznamy
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            {years.map(yr => (
              <section key={yr}>

                {/* Year divider */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                    letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)",
                    flexShrink: 0,
                  }}>
                    {yr || "Bez data"}
                  </div>
                  <div style={{ flex: 1, height: 1, background: "var(--line-strong)" }} />
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 10.5,
                    color: "var(--muted)", flexShrink: 0,
                  }}>
                    {byYear[yr].length}{" "}
                    {byYear[yr].length === 1 ? "zakázka" : byYear[yr].length < 5 ? "zakázky" : "zakázek"}
                    {" · "}
                    {byYear[yr].reduce((s, z) => s + (z.cena || 0), 0).toLocaleString("cs-CZ")} Kč
                  </div>
                </div>

                {/* Card */}
                <div style={{
                  background: "var(--surface)", border: "1px solid var(--line)",
                  borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)",
                  overflow: "hidden",
                }}>

                  {/* Column header — hidden on mobile */}
                  <div className="hidden ipad:flex" style={{
                    alignItems: "stretch",
                    background: "rgba(0,0,0,.025)",
                    borderBottom: "1px solid var(--line-strong)",
                    fontSize: 9.5, fontFamily: "var(--font-mono)", fontWeight: 700,
                    letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)",
                  }}>
                    <div style={{ width: W.datum, flexShrink: 0, padding: "9px 0", textAlign: "center" }}>Datum</div>
                    <Pipe />
                    <div style={{ flex: 1, minWidth: 0, padding: "9px 16px" }}>Manželé &amp; Místo</div>
                    <Pipe />
                    <div style={{ width: W.videohovor, flexShrink: 0, padding: "9px 0", textAlign: "center" }}>VH</div>
                    <Pipe />
                    <div style={{ width: W.typ, flexShrink: 0, padding: "9px 0", textAlign: "center" }}>Typ</div>
                    <Pipe />
                    <div style={{ width: W.stav, flexShrink: 0, padding: "9px 0", textAlign: "center" }}>Stav</div>
                    <Pipe />
                    <div style={{ width: W.balicek, flexShrink: 0, padding: "9px 0", textAlign: "center" }}>Balíček</div>
                    <Pipe />
                    <div style={{ width: W.prijezd, flexShrink: 0, padding: "9px 0", textAlign: "center" }}>Příjezd</div>
                    <Pipe />
                    <div style={{ width: W.obrad, flexShrink: 0, padding: "9px 0", textAlign: "center" }}>Obřad</div>
                    <Pipe />
                    <div style={{ width: W.hoste, flexShrink: 0, padding: "9px 0", textAlign: "center" }}>Hosté</div>
                    <Pipe />
                    <div style={{ width: W.cena, flexShrink: 0, padding: "9px 16px", textAlign: "right" }}>Cena</div>
                    <Pipe />
                    <div style={{ width: W.vzdal, flexShrink: 0, padding: "9px 0", textAlign: "center" }}>Vzdál.</div>
                  </div>

                  {/* Rows */}
                  {byYear[yr].map((z, i) => {
                    const borderColor = STAV_BORDER[z.stav] ?? "#9ca3af"
                    const typBadge   = TYP_BADGE[z.typ_sluzby]
                    const d          = z.datum_svatby ? new Date(z.datum_svatby) : null
                    const datumDen   = d ? String(d.getDate()).padStart(2, "0") : "—"
                    const datumMesRok = d
                      ? `${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
                      : ""
                    const bal        = balicekLabel(z.balicek)
                    const prijezd    = formatCas(z.cas_prijezdu)
                    const obrad      = formatCas(z.cas_obradu)

                    return (
                      <Link key={z.id} href={`/svatby/zakazky/${z.id}`} style={{ textDecoration: "none", display: "block" }}>

                        {/* ── Mobile card ── */}
                        <div className="flex md:hidden" style={{
                          alignItems: "stretch",
                          borderTop: i > 0 ? "1px solid var(--line)" : "none",
                          minHeight: 70,
                        }}>
                          {/* Datum */}
                          <div style={{
                            background: borderColor, width: 54, flexShrink: 0,
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: "white", fontFamily: "var(--font-serif)", lineHeight: 1 }}>{datumDen}</div>
                            <div style={{ fontSize: 8, color: "rgba(255,255,255,.82)", fontFamily: "var(--font-mono)", marginTop: 2, letterSpacing: ".04em" }}>{datumMesRok}</div>
                          </div>
                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0, padding: "9px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {z.jmeno_nevesty || "—"} &amp; {z.jmeno_zenicha || "—"}
                            </div>
                            {z.adresa_obradu && (
                              <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {z.adresa_obradu}
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 1 }}>
                              {typBadge && (
                                <span style={{ background: typBadge.bg, color: typBadge.color, borderRadius: 4, padding: "2px 7px", fontSize: 10.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                                  {typLabel(z.typ_sluzby)}
                                </span>
                              )}
                              <span onClick={e => e.preventDefault()}>
                                <select
                                  value={z.stav}
                                  onChange={e => { e.stopPropagation(); zmenStav(z.id, e.target.value) }}
                                  style={{
                                    background: WED_PILL[z.stav]?.bg ?? "#f2f1ec",
                                    color: WED_PILL[z.stav]?.color ?? "var(--ink-2)",
                                    border: "none", borderRadius: 4,
                                    padding: "2px 6px",
                                    fontSize: 10.5, fontWeight: 700,
                                    cursor: "pointer", outline: "none",
                                    fontFamily: "var(--font-sans)",
                                  }}
                                >
                                  {STAVOVE_FILTRY.filter(f => f.value !== "vse").map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                  ))}
                                </select>
                              </span>
                              {z.cena > 0 && (
                                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap" }}>
                                  {z.cena.toLocaleString("cs-CZ")} Kč
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ── Desktop row ── */}
                        <div
                          className="hidden ipad:flex"
                          style={{
                            alignItems: "stretch",
                            borderTop: i > 0 ? "1px solid var(--line)" : "none",
                            minHeight: 68,
                            transition: "background .12s",
                          }}
                          onMouseOver={e => (e.currentTarget.style.background = "var(--bg)")}
                          onMouseOut={e  => (e.currentTarget.style.background = "transparent")}
                        >
                          {/* 1 · Datum */}
                          <div style={{
                            background: borderColor, width: W.datum, flexShrink: 0,
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          }}>
                            <div style={{ fontSize: 24, fontWeight: 800, color: "white", fontFamily: "var(--font-serif)", lineHeight: 1 }}>
                              {datumDen}
                            </div>
                            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,.82)", fontFamily: "var(--font-mono)", marginTop: 3, letterSpacing: ".05em" }}>
                              {datumMesRok}
                            </div>
                          </div>

                          {/* 2 · Jméno + adresa */}
                          <Pipe />
                          <div style={{ flex: 1, minWidth: 0, padding: "11px 16px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {z.jmeno_nevesty || "—"} & {z.jmeno_zenicha || "—"}
                            </div>
                            {z.adresa_obradu && (
                              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {z.adresa_obradu}
                              </div>
                            )}
                          </div>

                          {/* 3 · Videohovor */}
                          <Pipe />
                          <div style={{ width: W.videohovor, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {z.videohovor_datum && (
                              <span title="Videohovor absolvován" style={{ fontSize: 19, lineHeight: 1 }}>🎥</span>
                            )}
                          </div>

                          {/* 4 · Typ */}
                          <Pipe />
                          <div style={{ width: W.typ, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {typBadge ? (
                              <span style={{
                                background: typBadge.bg, color: typBadge.color,
                                borderRadius: 4, padding: "5px 10px",
                                fontSize: 12, fontWeight: 700,
                                fontFamily: "var(--font-mono)", letterSpacing: ".03em",
                                whiteSpace: "nowrap",
                              }}>
                                {typLabel(z.typ_sluzby)}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>—</span>
                            )}
                          </div>

                          {/* 5 · Stav */}
                          <Pipe />
                          <div
                            style={{ width: W.stav, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                            onClick={e => e.preventDefault()}
                          >
                            <select
                              value={z.stav}
                              onChange={e => { e.stopPropagation(); zmenStav(z.id, e.target.value) }}
                              style={{
                                background: WED_PILL[z.stav]?.bg ?? "#f2f1ec",
                                color: WED_PILL[z.stav]?.color ?? "var(--ink-2)",
                                border: `1px solid ${STAV_BORDER[z.stav] ?? "#9ca3af"}`,
                                borderRadius: 6, padding: "5px 10px",
                                fontSize: 12, fontWeight: 700,
                                whiteSpace: "nowrap",
                                cursor: "pointer", outline: "none",
                                fontFamily: "var(--font-sans)",
                              }}
                            >
                              {STAVOVE_FILTRY.filter(f => f.value !== "vse").map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* 6 · Balíček */}
                          <Pipe />
                          <div style={{ width: W.balicek, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {bal ? (
                              <span style={{
                                fontSize: 11, fontFamily: "var(--font-mono)",
                                color: "var(--ink-2)", background: "rgba(0,0,0,.05)",
                                borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap",
                              }}>
                                {bal}
                              </span>
                            ) : <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>—</span>}
                          </div>

                          {/* 7 · Čas příjezdu */}
                          <Pipe />
                          <div style={{ width: W.prijezd, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: prijezd ? "var(--ink)" : "var(--muted)", whiteSpace: "nowrap" }}>
                              {prijezd ?? "—"}
                            </span>
                          </div>

                          {/* 8 · Čas obřadu */}
                          <Pipe />
                          <div style={{ width: W.obrad, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: obrad ? "var(--ink)" : "var(--muted)", whiteSpace: "nowrap" }}>
                              {obrad ?? "—"}
                            </span>
                          </div>

                          {/* 9 · Počet hostů */}
                          <Pipe />
                          <div style={{ width: W.hoste, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {z.pocet_svatebcanu ? (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                                {z.pocet_svatebcanu}
                              </span>
                            ) : <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>—</span>}
                          </div>

                          {/* 10 · Cena */}
                          <Pipe />
                          <div style={{ width: W.cena, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 16 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap" }}>
                              {z.cena ? `${z.cena.toLocaleString("cs-CZ")} Kč` : "—"}
                            </span>
                          </div>

                          {/* 7 · Vzdálenost */}
                          <Pipe />
                          <div style={{ width: W.vzdal, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                              {z.vzdalenost_km ? `${z.vzdalenost_km} km` : "—"}
                            </span>
                          </div>

                        </div>
                      </Link>
                    )
                  })}

                </div>
              </section>
            ))}
          </div>
        )}

      </div>
    </AppShell>
  )
}
