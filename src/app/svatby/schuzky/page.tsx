"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase-browser"
import AppShell from "@/components/AppShell"

// ── Typy ──────────────────────────────────────────────────────────────────────
type Schuzka = {
  id: number
  jmeno: string
  datum_svadby: string | null
  kontakt: string
  typ_kontaktu: string
  otazky: string | null
  datum: string
  cas: string
  stav: "nova" | "potvrzena" | "zrusena"
  svatba_id: number | null
  created_at: string
}

type Zakazka = {
  id: number
  jmeno_nevesty: string
  jmeno_zenicha: string
  datum_svatby: string
  typ_sluzby: string
  stav: string
}

type StavFilter = "vse" | "nova" | "potvrzena" | "zrusena"

// ── Helpers ───────────────────────────────────────────────────────────────────
function datumCZ(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}

function parseHod(cas: string) {
  return parseInt(cas.split(":")[0])
}

// Nalezne nejpravděpodobnější svatbu pro schůzku
function najdiSvatbu(s: Schuzka, zakazky: Zakazka[]): Zakazka | null {
  // 1. Přesná shoda data
  if (s.datum_svadby) {
    const datShoda = zakazky.find(z => z.datum_svatby?.slice(0, 10) === s.datum_svadby)
    if (datShoda) return datShoda
  }
  // 2. Shoda jmen
  const jmenaParts = s.jmeno.toLowerCase().split(/\s+/)
  const jmenoShoda = zakazky.find(z => {
    const jmena = (z.jmeno_nevesty + " " + z.jmeno_zenicha).toLowerCase()
    return jmenaParts.some(p => p.length > 2 && jmena.includes(p))
  })
  return jmenoShoda ?? null
}

// Google Calendar odkaz (event na 1 hodinu)
function gcalUrl(s: Schuzka) {
  const hod = parseHod(s.cas)
  const datStr = s.datum.replace(/-/g, "")
  const casOd = `${String(hod).padStart(2,"0")}0000`
  const casDo = `${String(hod + 1).padStart(2,"0")}0000`
  const start = `${datStr}T${casOd}`
  const end   = `${datStr}T${casDo}`
  const title = encodeURIComponent(`Videohovor – ${s.jmeno}`)
  let details = ""
  if (s.typ_kontaktu === "whatsapp") details += `WhatsApp: ${s.kontakt}`
  else if (s.typ_kontaktu === "facetime") details += `FaceTime: ${s.kontakt}`
  else details += `Osobně: ${s.kontakt}`
  if (s.datum_svadby) details += `\nDatum svatby: ${s.datum_svadby}`
  if (s.otazky) details += `\n\nOtázky:\n${s.otazky}`
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${encodeURIComponent(details)}`
}

// ── Stav badge ────────────────────────────────────────────────────────────────
const STAV_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  nova:      { bg: "#fef9c3", color: "#854d0e", label: "Nová" },
  potvrzena: { bg: "#dcfce7", color: "#166534", label: "Potvrzena" },
  zrusena:   { bg: "#fee2e2", color: "#991b1b", label: "Zrušena" },
}

function StavBadge({ stav }: { stav: string }) {
  const s = STAV_STYLE[stav] ?? { bg: "#f3f4f6", color: "#6b7280", label: stav }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: s.bg, color: s.color, letterSpacing: ".04em", textTransform: "uppercase" }}>
      {s.label}
    </span>
  )
}

// ── Karta schůzky ─────────────────────────────────────────────────────────────
function SchuzkaKarta({
  s, zakazka, onStav,
}: {
  s: Schuzka
  zakazka: Zakazka | null
  onStav: (id: number, stav: Schuzka["stav"]) => void
}) {
  const hod = parseHod(s.cas)
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      background: "white", borderRadius: 14, padding: "16px 18px",
      boxShadow: "var(--shadow-1)", border: s.stav === "nova" ? "1.5px solid #fde68a" : "1px solid var(--line)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>

        {/* Datum + čas blok */}
        <div style={{
          flexShrink: 0, width: 58, textAlign: "center", background: "#fafaf9", borderRadius: 10,
          padding: "8px 4px", border: "1px solid #f0ede8",
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#be123c", lineHeight: 1 }}>
            {new Date(s.datum).getDate()}
          </div>
          <div style={{ fontSize: 10.5, color: "#9ca3af", fontWeight: 600, marginTop: 1 }}>
            {new Date(s.datum).toLocaleDateString("cs-CZ", { month: "short" }).replace(".","").toUpperCase()}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#374151", marginTop: 5 }}>
            {String(hod).padStart(2,"0")}:00
          </div>
        </div>

        {/* Hlavní info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{s.jmeno}</span>
            <StavBadge stav={s.stav} />
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "#6b7280" }}>
            {/* Kontakt */}
            <span>
              {s.typ_kontaktu === "whatsapp" ? "📱" : s.typ_kontaktu === "facetime" ? "📹" : "🤝"}
              {" "}{s.kontakt}
            </span>
            {/* Datum svatby */}
            {s.datum_svadby && (
              <span>💒 {datumCZ(s.datum_svadby)}</span>
            )}
          </div>

          {/* Párovaná svatba */}
          {zakazka && (
            <div style={{ marginTop: 7 }}>
              <Link
                href={`/svatby/zakazky/${zakazka.id}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#be123c", textDecoration: "none", background: "#fff1f2", padding: "3px 10px", borderRadius: 99, border: "1px solid #fecdd3" }}
              >
                ✨ Párováno: {zakazka.jmeno_nevesty} &amp; {zakazka.jmeno_zenicha} · {datumCZ(zakazka.datum_svatby)}
              </Link>
            </div>
          )}

          {/* Otázky (expandovatelné) */}
          {s.otazky && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setExpanded(e => !e)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#9ca3af", padding: 0, display: "flex", alignItems: "center", gap: 4 }}
              >
                {expanded ? "▾" : "▸"} Otázky klienta
              </button>
              {expanded && (
                <div style={{ marginTop: 6, fontSize: 13, color: "#374151", background: "#fafaf9", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {s.otazky}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Akce */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          {/* Google Kalendář */}
          <a
            href={gcalUrl(s)}
            target="_blank"
            rel="noopener noreferrer"
            title="Přidat do Google Kalendáře"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 8,
              background: "white", border: "1.5px solid #e5e7eb",
              color: "#374151", fontSize: 12, fontWeight: 600, textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <GcalIco /> Přidat do Kalendáře
          </a>

          {/* Změna stavu */}
          {s.stav !== "potvrzena" && (
            <button
              onClick={() => onStav(s.id, "potvrzena")}
              style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "#dcfce7", color: "#166534", fontSize: 12, fontWeight: 600 }}
            >
              ✓ Potvrdit
            </button>
          )}
          {s.stav !== "zrusena" && (
            <button
              onClick={() => onStav(s.id, "zrusena")}
              style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "#fee2e2", color: "#991b1b", fontSize: 12, fontWeight: 600 }}
            >
              × Zrušit
            </button>
          )}
          {s.stav !== "nova" && (
            <button
              onClick={() => onStav(s.id, "nova")}
              style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "#f3f4f6", color: "#6b7280", fontSize: 12 }}
            >
              ↩ Vrátit
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function GcalIco() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SchuzkyPage() {
  const [schuzky,  setSchuzky]  = useState<Schuzka[]>([])
  const [zakazky,  setZakazky]  = useState<Zakazka[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filtr,    setFiltr]    = useState<StavFilter>("vse")

  useEffect(() => {
    const db = createClient()
    Promise.all([
      db.from("schuzky").select("*").order("datum", { ascending: true }).order("cas", { ascending: true }),
      db.from("zakazky").select("id, jmeno_nevesty, jmeno_zenicha, datum_svatby, typ_sluzby, stav"),
    ]).then(([{ data: s }, { data: z }]) => {
      setSchuzky((s ?? []) as Schuzka[])
      setZakazky((z ?? []) as Zakazka[])
      setLoading(false)
    })
  }, [])

  async function handleStav(id: number, stav: Schuzka["stav"]) {
    const db = createClient()
    await db.from("schuzky").update({ stav }).eq("id", id)
    setSchuzky(prev => prev.map(s => s.id === id ? { ...s, stav } : s))
  }

  const filtered = schuzky.filter(s => filtr === "vse" || s.stav === filtr)

  // Skupiny: budoucí / minulé
  const dnes = new Date(); dnes.setHours(0,0,0,0)
  const budouci = filtered.filter(s => new Date(s.datum) >= dnes)
  const minule  = filtered.filter(s => new Date(s.datum) < dnes)

  const counts = {
    vse:      schuzky.length,
    nova:     schuzky.filter(s => s.stav === "nova").length,
    potvrzena:schuzky.filter(s => s.stav === "potvrzena").length,
    zrusena:  schuzky.filter(s => s.stav === "zrusena").length,
  }

  return (
    <AppShell module="wed">
      <div style={{ padding: "28px", maxWidth: 820 }}>

        {/* Hlavička */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Schůzky</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "4px 0 0" }}>
              Videohovory s potenciálními klienty
            </p>
          </div>

          {/* Iframe link */}
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href="/embed/videohovor"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 9, border: "1.5px solid #e5e7eb",
                background: "white", color: "#374151", fontSize: 13, fontWeight: 600,
                textDecoration: "none",
              }}
            >
              🔗 Náhled formuláře
            </a>
          </div>
        </div>

        {/* Filtry */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {([
            { key: "vse",      label: "Vše" },
            { key: "nova",     label: "Nové" },
            { key: "potvrzena",label: "Potvrzené" },
            { key: "zrusena",  label: "Zrušené" },
          ] as { key: StavFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFiltr(key)}
              style={{
                padding: "7px 16px", borderRadius: 9, cursor: "pointer", fontSize: 13,
                border: "1.5px solid",
                borderColor: filtr === key ? "#be123c" : "#e5e7eb",
                background: filtr === key ? "#fff1f2" : "white",
                color: filtr === key ? "#be123c" : "#6b7280",
                fontWeight: filtr === key ? 700 : 400,
              }}
            >
              {label}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: .7 }}>({counts[key]})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              {filtr === "vse" ? "Zatím žádné schůzky" : "Žádné schůzky v tomto filtru"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Schůzky se zobrazí po vyplnění formuláře klientem
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Budoucí */}
            {budouci.length > 0 && (
              <section>
                <SecHeader>Nadcházející · {budouci.length}</SecHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {budouci.map(s => (
                    <SchuzkaKarta
                      key={s.id}
                      s={s}
                      zakazka={najdiSvatbu(s, zakazky)}
                      onStav={handleStav}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Minulé */}
            {minule.length > 0 && (
              <section>
                <SecHeader>Proběhlé · {minule.length}</SecHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {minule.map(s => (
                    <SchuzkaKarta
                      key={s.id}
                      s={s}
                      zakazka={najdiSvatbu(s, zakazky)}
                      onStav={handleStav}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function SecHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#9ca3af" }}>
        {children}
      </div>
      <div style={{ flex: 1, height: 1, background: "#f3f4f6" }} />
    </div>
  )
}
