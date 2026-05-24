"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase-browser"
import AppShell from "@/components/AppShell"

// ── Typy ──────────────────────────────────────────────────────────────────────
type Schuzka = {
  id: number
  jmeno: string
  email: string | null
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
function datumKratky(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })
}

// Nalezne nejpravděpodobnější svatbu pro schůzku
function najdiSvatbu(s: Schuzka, zakazky: Zakazka[]): Zakazka | null {
  if (s.datum_svadby) {
    const datShoda = zakazky.find(z => z.datum_svatby?.slice(0, 10) === s.datum_svadby)
    if (datShoda) return datShoda
  }
  const jmenaParts = s.jmeno.toLowerCase().split(/\s+/)
  const jmenoShoda = zakazky.find(z => {
    const jmena = (z.jmeno_nevesty + " " + z.jmeno_zenicha).toLowerCase()
    return jmenaParts.some(p => p.length > 2 && jmena.includes(p))
  })
  return jmenoShoda ?? null
}

// Google Calendar odkaz
function gcalUrl(s: Schuzka) {
  const [hod, min] = s.cas.split(":").map(Number)
  const datStr = s.datum.replace(/-/g, "")
  const start = `${datStr}T${String(hod).padStart(2,"0")}${String(min||0).padStart(2,"0")}00`
  const endHod = hod + 1
  const end   = `${datStr}T${String(endHod).padStart(2,"0")}${String(min||0).padStart(2,"0")}00`
  const title = encodeURIComponent(`Videohovor – ${s.jmeno}`)
  let details = ""
  if (s.typ_kontaktu === "whatsapp") details += `WhatsApp: ${s.kontakt}`
  else if (s.typ_kontaktu === "facetime") details += `FaceTime: ${s.kontakt}`
  else details += `Osobně: ${s.kontakt}`
  if (s.datum_svadby) details += `\nDatum svatby: ${s.datum_svadby}`
  if (s.otazky) details += `\n\nOtázky:\n${s.otazky}`
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${encodeURIComponent(details)}`
}

// ── Stav config ───────────────────────────────────────────────────────────────
const STAV: Record<string, { label: string; bg: string; color: string; bar: string }> = {
  nova:      { label: "Nová",      bg: "#fffbeb", color: "#92400e", bar: "#f59e0b" },
  potvrzena: { label: "Potvrzena", bg: "#f0fdf4", color: "#166534", bar: "#10b981" },
  zrusena:   { label: "Zrušena",   bg: "#fff1f2", color: "#9f1239", bar: "#f43f5e" },
}

// ── Kontakt config ────────────────────────────────────────────────────────────
const KONTAKT: Record<string, { emoji: string; label: string; bg: string; color: string }> = {
  whatsapp: { emoji: "📱", label: "WhatsApp", bg: "#dcfce7", color: "#166534" },
  facetime: { emoji: "📹", label: "FaceTime", bg: "#dbeafe", color: "#1e40af" },
  osobne:   { emoji: "🤝", label: "Osobně",   bg: "#fef3c7", color: "#92400e" },
}

// ── Karta schůzky ─────────────────────────────────────────────────────────────
function SchuzkaKarta({
  s, zakazka, onStav, onDelete, onTermin,
}: {
  s: Schuzka
  zakazka: Zakazka | null
  onStav:  (id: number, stav: Schuzka["stav"]) => void
  onDelete:(id: number) => void
  onTermin:(id: number, datum: string, cas: string) => void
}) {
  const [expanded,   setExpanded]   = useState(false)
  const [editTermin, setEditTermin] = useState(false)
  const [editDatum,  setEditDatum]  = useState(s.datum)
  const [editCas,    setEditCas]    = useState(s.cas.slice(0, 5))

  const st   = STAV[s.stav] ?? STAV.nova
  const kt   = KONTAKT[s.typ_kontaktu] ?? KONTAKT.osobne
  const d    = new Date(s.datum)
  const dnes = new Date(); dnes.setHours(0,0,0,0)
  const jeMinula = d < dnes

  async function ulozTermin() {
    if (!editDatum || !editCas) return
    const db = createClient()
    await db.from("schuzky").update({ datum: editDatum, cas: editCas }).eq("id", s.id)
    onTermin(s.id, editDatum, editCas)
    setEditTermin(false)
  }

  return (
    <div style={{
      background: "white",
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)",
      border: "1px solid #f1f0ef",
      opacity: s.stav === "zrusena" ? 0.6 : 1,
      transition: "box-shadow .15s",
    }}>

      {/* Barevný pruh nahoře */}
      <div style={{ height: 3, background: st.bar }} />

      <div style={{ padding: "18px 20px" }}>
        {/* Horní řádek: datum blok + info + akce */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

          {/* Datum blok */}
          {editTermin ? (
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <input type="date" value={editDatum} onChange={e => setEditDatum(e.target.value)}
                style={{ fontSize: 12, border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "5px 8px", outline: "none", colorScheme: "light" }} />
              <input type="time" value={editCas} onChange={e => setEditCas(e.target.value)}
                style={{ fontSize: 12, border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "5px 8px", outline: "none", width: 110 }} />
              <div style={{ display: "flex", gap: 5 }}>
                <button onClick={ulozTermin}
                  style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: "5px 0", borderRadius: 7, border: "none", cursor: "pointer", background: "#10b981", color: "#fff" }}>
                  Uložit
                </button>
                <button onClick={() => setEditTermin(false)}
                  style={{ flex: 1, fontSize: 11, padding: "5px 0", borderRadius: 7, border: "1px solid #e5e7eb", cursor: "pointer", background: "white", color: "#9ca3af" }}>
                  Zrušit
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => { setEditDatum(s.datum); setEditCas(s.cas.slice(0,5)); setEditTermin(true) }}
              title="Klikni pro změnu termínu"
              style={{
                flexShrink: 0, width: 62, textAlign: "center",
                background: jeMinula ? "#fafaf9" : "#fff1f2",
                borderRadius: 12, padding: "10px 4px",
                border: `1.5px solid ${jeMinula ? "#f0ede8" : "#fecdd3"}`,
                cursor: "pointer", transition: "all .15s",
              }}
              onMouseOver={e => { e.currentTarget.style.background = "#ffe4e6"; e.currentTarget.style.borderColor = "#fb7185" }}
              onMouseOut={e => { e.currentTarget.style.background = jeMinula ? "#fafaf9" : "#fff1f2"; e.currentTarget.style.borderColor = jeMinula ? "#f0ede8" : "#fecdd3" }}
            >
              <div style={{ fontSize: 22, fontWeight: 900, color: "#be123c", lineHeight: 1 }}>
                {d.getDate()}
              </div>
              <div style={{ fontSize: 10, color: "#be123c", fontWeight: 700, marginTop: 2, letterSpacing: ".06em" }}>
                {d.toLocaleDateString("cs-CZ", { month: "short" }).replace(".","").toUpperCase()}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginTop: 6, letterSpacing: ".02em" }}>
                {s.cas.slice(0,5)}
              </div>
              <div style={{ fontSize: 9, color: "#be123c", marginTop: 2, opacity: .6 }}>✏️</div>
            </div>
          )}

          {/* Hlavní info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Jméno + stav */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{s.jmeno}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 99,
                background: st.bg, color: st.color,
                letterSpacing: ".06em", textTransform: "uppercase",
              }}>{st.label}</span>
            </div>

            {/* Datum schůzky — plný text */}
            <div style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 8 }}>
              📅 {datumKratky(s.datum)}
            </div>

            {/* Kontakt pill */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                background: kt.bg, color: kt.color,
              }}>
                {kt.emoji} {s.kontakt}
              </span>
              {s.datum_svadby && (
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  💒 Svatba {datumCZ(s.datum_svadby)}
                </span>
              )}
            </div>

            {/* Párovaná zakázka */}
            {zakazka && (
              <div style={{ marginTop: 10 }}>
                <Link
                  href={`/svatby/zakazky/${zakazka.id}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 12, fontWeight: 600, color: "#be123c",
                    textDecoration: "none", background: "#fff1f2",
                    padding: "4px 12px", borderRadius: 99,
                    border: "1px solid #fecdd3",
                  }}
                >
                  ✨ {zakazka.jmeno_nevesty} &amp; {zakazka.jmeno_zenicha}
                  <span style={{ opacity: .55, fontWeight: 400 }}>· {datumCZ(zakazka.datum_svatby)}</span>
                </Link>
              </div>
            )}
          </div>

          {/* Google Kalendář — vpravo nahoře */}
          <a
            href={gcalUrl(s)}
            target="_blank"
            rel="noopener noreferrer"
            title="Přidat do Google Kalendáře"
            style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 9,
              background: "#f8fafc", border: "1.5px solid #e5e7eb",
              color: "#374151", fontSize: 12, fontWeight: 600,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            <GcalIco /> Kalendář
          </a>
        </div>

        {/* Otázky (expandovatelné) */}
        {s.otazky && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: "#9ca3af", padding: 0,
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ transition: "transform .15s", display: "inline-block", transform: expanded ? "rotate(90deg)" : "none" }}>▸</span>
              Otázky klienta
            </button>
            {expanded && (
              <div style={{
                marginTop: 8, fontSize: 13, color: "#374151",
                background: "#fafaf9", borderRadius: 10,
                padding: "12px 14px", lineHeight: 1.7, whiteSpace: "pre-wrap",
                border: "1px solid #f0ede8",
              }}>
                {s.otazky}
              </div>
            )}
          </div>
        )}

        {/* Dolní akce */}
        <div style={{
          display: "flex", gap: 6, marginTop: 14,
          paddingTop: 14, borderTop: "1px solid #f1f0ef",
          flexWrap: "wrap",
        }}>
          {s.stav !== "potvrzena" && (
            <button onClick={() => onStav(s.id, "potvrzena")}
              style={{ ...btnStyle, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>
              ✓ Potvrdit
            </button>
          )}
          {s.stav !== "zrusena" && (
            <button onClick={() => onStav(s.id, "zrusena")}
              style={{ ...btnStyle, background: "#fff1f2", color: "#9f1239", border: "1px solid #fecdd3" }}>
              × Zrušit
            </button>
          )}
          {s.stav !== "nova" && (
            <button onClick={() => onStav(s.id, "nova")}
              style={{ ...btnStyle, background: "#f9fafb", color: "#6b7280", border: "1px solid #e5e7eb" }}>
              ↩ Vrátit na novou
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => onDelete(s.id)}
            title="Smazat schůzku"
            style={{ ...btnStyle, background: "white", color: "#be123c", border: "1px solid #fecdd3" }}>
            <TrashIco /> Smazat
          </button>
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  fontSize: 12, fontWeight: 600, padding: "6px 13px",
  borderRadius: 8, cursor: "pointer",
}

function TrashIco() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function GcalIco() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

  async function handleDelete(id: number) {
    if (!window.confirm("Opravdu chceš tuto schůzku smazat?")) return
    const db = createClient()
    await db.from("schuzky").delete().eq("id", id)
    setSchuzky(prev => prev.filter(s => s.id !== id))
  }

  function handleTermin(id: number, datum: string, cas: string) {
    setSchuzky(prev => prev.map(s => s.id === id ? { ...s, datum, cas } : s))
  }

  async function handleStav(id: number, stav: Schuzka["stav"]) {
    const db = createClient()
    await db.from("schuzky").update({ stav }).eq("id", id)
    setSchuzky(prev => prev.map(s => s.id === id ? { ...s, stav } : s))

    if (stav === "potvrzena") {
      const s = schuzky.find(x => x.id === id)
      if (s?.email) {
        fetch("/api/mail/schuzka", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            typ: "potvrzeni", jmeno: s.jmeno, email: s.email,
            datum: s.datum, cas: s.cas, typ_kontaktu: s.typ_kontaktu,
            kontakt: s.kontakt, datum_svadby: s.datum_svadby, otazky: s.otazky,
          }),
        }).catch(e => console.error("Potvrzeni mail:", e))
      }
    }
  }

  const filtered = schuzky.filter(s => filtr === "vse" || s.stav === filtr)
  const dnes = new Date(); dnes.setHours(0,0,0,0)
  const budouci = filtered.filter(s => new Date(s.datum) >= dnes)
  const minule  = filtered.filter(s => new Date(s.datum) < dnes)

  const counts = {
    vse:       schuzky.length,
    nova:      schuzky.filter(s => s.stav === "nova").length,
    potvrzena: schuzky.filter(s => s.stav === "potvrzena").length,
    zrusena:   schuzky.filter(s => s.stav === "zrusena").length,
  }

  return (
    <AppShell module="wed">
      <div style={{ padding: "32px 28px", maxWidth: 860 }}>

        {/* Hlavička */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-.3px" }}>Schůzky</h1>
            <p style={{ fontSize: 13.5, color: "#9ca3af", margin: "5px 0 0" }}>
              Předsvatební videohovory s potenciálními klienty
            </p>
          </div>
          <a
            href="/embed/videohovor"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "9px 16px", borderRadius: 10,
              background: "white", border: "1.5px solid #e5e7eb",
              color: "#374151", fontSize: 13, fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            }}
          >
            🔗 Formulář pro klienty
          </a>
        </div>

        {/* Statistiky */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
          {([
            { key: "vse",       label: "Celkem",     color: "#374151", bg: "#f9fafb", border: "#e5e7eb" },
            { key: "nova",      label: "Nové",        color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
            { key: "potvrzena", label: "Potvrzené",   color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
            { key: "zrusena",   label: "Zrušené",     color: "#9f1239", bg: "#fff1f2", border: "#fecdd3" },
          ] as { key: StavFilter; label: string; color: string; bg: string; border: string }[]).map(({ key, label, color, bg, border }) => (
            <button
              key={key}
              onClick={() => setFiltr(key)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px", borderRadius: 10, cursor: "pointer",
                border: `1.5px solid ${filtr === key ? border : "#e5e7eb"}`,
                background: filtr === key ? bg : "white",
                color: filtr === key ? color : "#6b7280",
                fontWeight: filtr === key ? 700 : 500,
                fontSize: 13, transition: "all .12s",
                boxShadow: filtr === key ? `0 0 0 2px ${border}` : "none",
              }}
            >
              {label}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                background: filtr === key ? "rgba(0,0,0,.08)" : "#f3f4f6",
                color: filtr === key ? color : "#9ca3af",
              }}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* Obsah */}
        {loading ? (
          <div style={{ color: "#9ca3af", fontSize: 14, padding: "40px 0", textAlign: "center" }}>Načítám…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
              {filtr === "vse" ? "Zatím žádné schůzky" : "Žádné schůzky v tomto filtru"}
            </div>
            <div style={{ fontSize: 13.5, color: "#9ca3af" }}>
              Schůzky se zobrazí po vyplnění formuláře klientem
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {budouci.length > 0 && (
              <section>
                <SekceHeader pocet={budouci.length} budouci />
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {budouci.map(s => (
                    <SchuzkaKarta key={s.id} s={s} zakazka={najdiSvatbu(s, zakazky)}
                      onStav={handleStav} onDelete={handleDelete} onTermin={handleTermin} />
                  ))}
                </div>
              </section>
            )}

            {minule.length > 0 && (
              <section>
                <SekceHeader pocet={minule.length} budouci={false} />
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {minule.map(s => (
                    <SchuzkaKarta key={s.id} s={s} zakazka={najdiSvatbu(s, zakazky)}
                      onStav={handleStav} onDelete={handleDelete} onTermin={handleTermin} />
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

function SekceHeader({ pocet, budouci }: { pocet: number; budouci: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: budouci ? "#be123c" : "#d1d5db",
      }} />
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: ".1em", color: budouci ? "#be123c" : "#9ca3af",
      }}>
        {budouci ? "Nadcházející" : "Proběhlé"} · {pocet}
      </span>
      <div style={{ flex: 1, height: 1, background: budouci ? "#fecdd3" : "#f3f4f6" }} />
    </div>
  )
}
