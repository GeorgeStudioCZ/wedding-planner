"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import AppShell from "@/components/AppShell"

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
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
]
const DNY = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]

// Barva dne dle typu/stavu (shodná s MiniKalendarem na dashboardu)
function barvaDne(typ: string, stav: string): string {
  if (stav === "objednavka" || stav === "cekam-platbu") return "#fbbf24"
  if (typ === "foto")        return "#3b82f6"
  if (typ === "video")       return "#f43f5e"
  if (typ === "foto+video")  return "#f97316"
  return "#94a3b8"
}

const LEGENDA = [
  { label: "Předrezervace", color: "#fbbf24" },
  { label: "Foto",          color: "#3b82f6" },
  { label: "Video",         color: "#f43f5e" },
  { label: "Foto + Video",  color: "#f97316" },
]

// ── Měsíční karta ────────────────────────────────────────────────
function MesicniKalendar({ rok, mesic, svatby }: {
  rok: number
  mesic: number
  svatby: Zakazka[]
}) {
  const prvniDen  = new Date(rok, mesic, 1).getDay()
  const offsetPo  = prvniDen === 0 ? 6 : prvniDen - 1
  const pocetDni  = new Date(rok, mesic + 1, 0).getDate()

  const svatbyMesice: Record<number, Zakazka> = {}
  for (const z of svatby) {
    const d = new Date(z.datum_svatby)
    if (d.getFullYear() === rok && d.getMonth() === mesic) {
      svatbyMesice[d.getDate()] = z
    }
  }
  const pocetSvateb = Object.keys(svatbyMesice).length

  const dnes           = new Date()
  const jeAktMesic     = dnes.getFullYear() === rok && dnes.getMonth() === mesic
  const dnesDen        = dnes.getDate()

  const bunky: (number | null)[] = [
    ...Array(offsetPo).fill(null),
    ...Array.from({ length: pocetDni }, (_, i) => i + 1),
  ]
  while (bunky.length % 7 !== 0) bunky.push(null)
  const rowCount = bunky.length / 7

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--line)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-1)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Barevný pruh nahoře */}
      <div style={{ height: 3, background: "linear-gradient(90deg, #ff6a8b 0%, #ff9a6a 100%)", flexShrink: 0 }} />

      {/* Hlavička měsíce */}
      <div style={{
        padding: "13px 16px 11px",
        borderBottom: "1px solid var(--line)",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: "var(--font-serif), serif", fontWeight: 700, fontStyle: "normal", fontSize: 17, color: "var(--ink)", lineHeight: 1 }}>
            {MESICE[mesic]}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", marginTop: 3 }}>
            {rok}
          </div>
        </div>
        {pocetSvateb > 0 && (
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            color: "white", background: "#ff6a8b",
            borderRadius: 99, padding: "2px 8px",
            letterSpacing: ".03em",
          }}>
            {pocetSvateb}
          </div>
        )}
      </div>

      {/* Záhlaví dnů */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        borderBottom: "1px solid var(--line)",
        padding: "6px 0",
        flexShrink: 0,
      }}>
        {DNY.map((d, i) => (
          <div key={d} style={{
            textAlign: "center", fontSize: 9,
            fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: ".05em",
            color: i >= 5 ? "#f43f5e" : "var(--muted)",
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Buňky */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gridTemplateRows: `repeat(${rowCount}, minmax(30px, 1fr))`,
      }}>
        {bunky.map((den, i) => {
          const col      = i % 7
          const row      = Math.floor(i / 7)
          const gridLine = {
            borderRight:  col < 6 ? "1px solid rgba(0,0,0,.05)" : "none",
            borderBottom: row < rowCount - 1 ? "1px solid rgba(0,0,0,.05)" : "none",
          }

          if (den === null) return <div key={i} style={gridLine} />

          const zakazka  = svatbyMesice[den]
          const jeDnes   = jeAktMesic && den === dnesDen
          const isWeekend = col >= 5

          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              ...gridLine,
            }}>
              {zakazka ? (
                <Link
                  href={`/svatby/zakazky/${zakazka.id}`}
                  title={`${zakazka.jmeno_nevesty} & ${zakazka.jmeno_zenicha}`}
                  style={{
                    width: "78%", aspectRatio: "1",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: "white",
                    background: barvaDne(zakazka.typ_sluzby, zakazka.stav),
                    borderRadius: 7,
                    textDecoration: "none",
                    transition: "opacity .15s, transform .1s",
                    boxShadow: "0 1px 4px rgba(0,0,0,.18)",
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.opacity = ".8"; (e.currentTarget as HTMLElement).style.transform = "scale(1.08)" }}
                  onMouseOut={e  => { (e.currentTarget as HTMLElement).style.opacity = "1";  (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}
                >
                  {den}
                </Link>
              ) : (
                <div style={{
                  width: "78%", aspectRatio: "1",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11,
                  color: isWeekend ? "#e11d48" : "var(--ink-2)",
                  fontWeight: jeDnes ? 700 : 400,
                  background: jeDnes ? "rgba(0,0,0,.07)" : "transparent",
                  borderRadius: 99,
                  outline: jeDnes && !zakazka ? "1.5px solid var(--line-strong)" : "none",
                  outlineOffset: "-1.5px",
                }}>
                  {den}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Stránka ──────────────────────────────────────────────────────
export default function Kalendar() {
  const [zakazky, setZakazky] = useState<Zakazka[]>([])
  const [rok, setRok]         = useState(new Date().getFullYear())

  useEffect(() => {
    supabase
      .from("zakazky")
      .select("id, datum_svatby, typ_sluzby, jmeno_nevesty, jmeno_zenicha, stav")
      .in("stav", ["objednavka", "cekam-platbu", "zaplaceno", "po-svatbe", "ve-strizne", "ukonceno"])
      .then(({ data }) => setZakazky(data ?? []))
  }, [])

  const rocniSvatby  = zakazky.filter(z => z.datum_svatby && new Date(z.datum_svatby).getFullYear() === rok)
  const celkemVRoce  = rocniSvatby.length

  return (
    <AppShell module="wed">
      <div style={{ padding: "28px 32px 64px" }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
            Wedding Planner · Plánování
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <h1 style={{ fontFamily: "var(--font-serif), serif", fontWeight: 700, fontStyle: "normal", fontSize: 32, lineHeight: 1.05, color: "var(--ink)", margin: 0 }}>
              Kalendář{" "}
              <span style={{ fontFamily: "var(--font-sans)", color: "var(--muted)", fontWeight: 400, fontSize: 20 }}>
                / Přehled roku
              </span>
            </h1>

            {/* Navigace rokem */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setRok(r => r - 1)}
                style={{
                  width: 34, height: 34, borderRadius: "var(--radius-md)",
                  background: "var(--surface)", border: "1px solid var(--line-strong)",
                  cursor: "pointer", fontSize: 16, color: "var(--ink-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background .15s",
                }}
                onMouseOver={e => (e.currentTarget.style.background = "var(--bg)")}
                onMouseOut={e  => (e.currentTarget.style.background = "var(--surface)")}
              >‹</button>
              <div style={{
                padding: "0 18px", height: 34, display: "flex", alignItems: "center",
                background: "var(--ink)", borderRadius: "var(--radius-md)",
                fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15,
                color: "white", letterSpacing: ".04em", minWidth: 80, justifyContent: "center",
              }}>
                {rok}
              </div>
              <button
                onClick={() => setRok(r => r + 1)}
                style={{
                  width: 34, height: 34, borderRadius: "var(--radius-md)",
                  background: "var(--surface)", border: "1px solid var(--line-strong)",
                  cursor: "pointer", fontSize: 16, color: "var(--ink-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background .15s",
                }}
                onMouseOver={e => (e.currentTarget.style.background = "var(--bg)")}
                onMouseOut={e  => (e.currentTarget.style.background = "var(--surface)")}
              >›</button>
            </div>
          </div>

          {/* Podtitulek + legenda */}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)" }}>
              <strong style={{ color: "var(--ink)", fontSize: 14 }}>{celkemVRoce}</strong>{" "}
              {celkemVRoce === 1 ? "potvrzená zakázka" : celkemVRoce < 5 ? "potvrzené zakázky" : "potvrzených zakázek"} v roce {rok}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              {LEGENDA.map(l => (
                <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--muted)" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, flexShrink: 0, display: "inline-block" }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Mřížka měsíců ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
          className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <MesicniKalendar key={i} rok={rok} mesic={i} svatby={zakazky} />
          ))}
        </div>

      </div>
    </AppShell>
  )
}
