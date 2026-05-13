"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import AppShell from "@/components/AppShell"
import { bezDPH, castDPH } from "@/lib/dph"

// ── Types ─────────────────────────────────────────────────────────────────────
type Zakaznik = { id: number; jmeno: string; prijmeni: string; firma?: string | null; projekty: string[] | null }
type Kategorie = { id: number; name: string; barva: string; sazba_typ: string; sazba: number }
type Zaznam = {
  id: number
  zakaznik_id: number | null
  kategorie_id: number | null
  nazev: string
  start_at: string
  end_at: string | null
  poznamka: string
}

// ── SVG ring constants ────────────────────────────────────────────────────────
const RING_R    = 72
const RING_CIRC = 2 * Math.PI * RING_R  // ≈ 452.4

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

function formatClock(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

function formatDuration(start: string, end: string | null) {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
  return formatElapsed(Math.max(0, ms))
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
}

function isoDate(iso: string) { return iso.slice(0, 10) }

function isoToDate(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}
function isoToTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localToIso(date: string, time: string) {
  return new Date(`${date}T${time}`).toISOString()
}

function dateLabel(iso: string) {
  const d = new Date(iso)
  const today     = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (isoDate(d.toISOString()) === isoDate(today.toISOString()))     return "Dnes"
  if (isoDate(d.toISOString()) === isoDate(yesterday.toISOString())) return "Včera"
  return d.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })
}

function calcEarnings(z: Zaznam, kategorie: Kategorie[]) {
  const kat = kategorie.find(k => k.id === z.kategorie_id)
  if (!kat || !z.end_at) return 0
  if (kat.sazba_typ === "kus") return kat.sazba
  const hours = (new Date(z.end_at).getTime() - new Date(z.start_at).getTime()) / 3_600_000
  return Math.round(hours * kat.sazba)
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function Ico({ d, size = 16 }: { d: string | string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}
const IC = {
  play:  "M5 3l14 9-14 9V3z",
  stop:  "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1z",
  pause: ["M6 4h4v16H6z", "M14 4h4v16h-4z"],
  clock: ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 6v6l4 2"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
  edit:  ["M12 20h9", "M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"],
  close: "M18 6L6 18M6 6l12 12",
}

// ── ZaznamRadek ───────────────────────────────────────────────────────────────
function ZaznamRadek({ z, kategorie, zakaznici, onDelete, onEdit }: {
  z: Zaznam; kategorie: Kategorie[]; zakaznici: Zakaznik[]
  onDelete: (id: number) => void; onEdit: (z: Zaznam) => void
}) {
  const kat      = kategorie.find(k => k.id === z.kategorie_id)
  const zak      = zakaznici.find(c => c.id === z.zakaznik_id)
  const earnings = calcEarnings(z, kategorie)
  const dur      = z.end_at ? formatDuration(z.start_at, z.end_at) : null

  const iconBtn: React.CSSProperties = {
    color: "var(--muted)", background: "none", border: "none",
    cursor: "pointer", padding: "4px", borderRadius: 6, flexShrink: 0,
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ width: 10, height: 10, borderRadius: 99, flexShrink: 0, background: kat?.barva ?? "#8a8a96" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {z.nazev || <span style={{ color: "var(--muted)" }}>(bez názvu)</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {kat && <span>{kat.name}</span>}
          {zak && <span>· {zak.firma?.trim() || `${zak.jmeno} ${zak.prijmeni}`.trim()}</span>}
          <span>· {formatTime(z.start_at)}{z.end_at ? ` – ${formatTime(z.end_at)}` : ""}</span>
        </div>
      </div>
      {dur && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{dur}</div>
          {earnings > 0 && (
            <div style={{ fontSize: 11, color: "#4338ca", marginTop: 1 }}>
              {earnings.toLocaleString("cs-CZ")} Kč
              <span style={{ color: "var(--muted)", marginLeft: 4 }}>· bez DPH {Math.round(bezDPH(earnings)).toLocaleString("cs-CZ")} Kč</span>
            </div>
          )}
        </div>
      )}
      <button onClick={() => onEdit(z)} style={iconBtn} title="Upravit">
        <Ico d={IC.edit} size={14} />
      </button>
      <button onClick={() => onDelete(z.id)} style={iconBtn} title="Smazat">
        <Ico d={IC.trash} size={14} />
      </button>
    </div>
  )
}

// ── EditPopup ─────────────────────────────────────────────────────────────────
type EditForm = { nazev: string; datum: string; casOd: string; casDo: string; zakaznikId: string; kategorieId: string; poznamka: string }

function EditPopup({ zaznam, kategorie, zakaznici, onSave, onClose }: {
  zaznam: Zaznam; kategorie: Kategorie[]; zakaznici: Zakaznik[]
  onSave: (id: number, updates: Partial<Zaznam>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<EditForm>({
    nazev:       zaznam.nazev,
    datum:       isoToDate(zaznam.start_at),
    casOd:       isoToTime(zaznam.start_at),
    casDo:       zaznam.end_at ? isoToTime(zaznam.end_at) : "",
    zakaznikId:  zaznam.zakaznik_id  ? String(zaznam.zakaznik_id)  : "",
    kategorieId: zaznam.kategorie_id ? String(zaznam.kategorie_id) : "",
    poznamka:    zaznam.poznamka ?? "",
  })
  const [saving, setSaving] = useState(false)

  const studioZak = zakaznici.filter(z => Array.isArray(z.projekty) && z.projekty.includes("Studio"))
  const casDoInvalid = !!form.casDo && !!form.casOd && form.casDo <= form.casOd

  async function handleSave() {
    if (!form.datum || !form.casOd || casDoInvalid) return
    setSaving(true)
    await onSave(zaznam.id, {
      nazev:        form.nazev.trim(),
      start_at:     localToIso(form.datum, form.casOd),
      end_at:       form.casDo ? localToIso(form.datum, form.casDo) : null,
      zakaznik_id:  form.zakaznikId  ? Number(form.zakaznikId)  : null,
      kategorie_id: form.kategorieId ? Number(form.kategorieId) : null,
      poznamka:     form.poznamka,
    })
    setSaving(false)
  }

  function upd(patch: Partial<EditForm>) { setForm(prev => ({ ...prev, ...patch })) }

  const lbl: React.CSSProperties = { fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4, fontWeight: 500 }
  const inp: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "8px 11px",
    borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13.5,
    color: "#111827", outline: "none", fontFamily: "var(--font-sans)", background: "white",
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "white", borderRadius: 18, padding: "24px 26px",
        width: "min(500px, calc(100vw - 32px))",
        boxShadow: "0 24px 64px rgba(0,0,0,.3)",
        maxHeight: "calc(100vh - 60px)", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, color: "#111827" }}>Upravit záznam</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4, lineHeight: 1 }}>
            <Ico d={IC.close} size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Název */}
          <div>
            <label style={lbl}>Název úkolu</label>
            <input value={form.nazev} onChange={e => upd({ nazev: e.target.value })}
              placeholder="Název úkolu" style={inp} />
          </div>

          {/* Datum */}
          <div>
            <label style={lbl}>Datum</label>
            <input type="date" value={form.datum} onChange={e => upd({ datum: e.target.value })} style={inp} />
          </div>

          {/* Čas od | Čas do */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>Čas od</label>
              <input type="time" value={form.casOd} onChange={e => upd({ casOd: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={lbl}>Čas do</label>
              <input type="time" value={form.casDo} onChange={e => upd({ casDo: e.target.value })}
                style={{ ...inp, borderColor: casDoInvalid ? "#ef4444" : "#e5e7eb" }} />
              {casDoInvalid && (
                <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#ef4444" }}>
                  Čas do musí být pozdější než čas od
                </p>
              )}
            </div>
          </div>

          {/* Zákazník */}
          <div>
            <label style={lbl}>Zákazník</label>
            <select value={form.zakaznikId} onChange={e => upd({ zakaznikId: e.target.value })} style={inp}>
              <option value="">— bez zákazníka —</option>
              {studioZak.map(z => (
                <option key={z.id} value={z.id}>
                  {z.firma?.trim() || `${z.jmeno} ${z.prijmeni}`.trim() || "—"}
                </option>
              ))}
            </select>
          </div>

          {/* Kategorie */}
          <div>
            <label style={lbl}>Kategorie</label>
            <select value={form.kategorieId} onChange={e => upd({ kategorieId: e.target.value })} style={inp}>
              <option value="">— bez kategorie —</option>
              {kategorie.map(k => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          </div>

          {/* Poznámka */}
          <div>
            <label style={lbl}>Poznámka</label>
            <textarea value={form.poznamka} onChange={e => upd({ poznamka: e.target.value })}
              placeholder="Volitelná poznámka…" rows={3}
              style={{ ...inp, resize: "vertical" as const, lineHeight: 1.5 }} />
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={handleSave} disabled={saving || !form.datum || !form.casOd || casDoInvalid} style={{
              flex: 1, padding: "10px", borderRadius: 9, border: "none",
              cursor: saving ? "default" : "pointer",
              background: "linear-gradient(135deg, #6366f1, #f97316)",
              color: "white", fontSize: 14, fontWeight: 600,
              opacity: saving || !form.datum || !form.casOd || casDoInvalid ? .5 : 1, transition: "opacity .15s",
            }}>
              {saving ? "Ukládám…" : "Uložit"}
            </button>
            <button onClick={onClose} style={{
              padding: "10px 20px", borderRadius: 9, border: "1px solid #e5e7eb",
              background: "white", color: "#6b7280", fontSize: 14, fontWeight: 500, cursor: "pointer",
            }}>
              Zrušit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GeorgePage() {
  const [zakaznici, setZakaznici] = useState<Zakaznik[]>([])
  const [kategorie, setKategorie] = useState<Kategorie[]>([])
  const [zaznamy,   setZaznamy]   = useState<Zaznam[]>([])
  const [loading,   setLoading]   = useState(true)

  // Timer state
  const [running, setRunning] = useState<Zaznam | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [paused,  setPaused]  = useState(false)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const pauseOffsetRef = useRef(0)           // accumulated paused ms
  const pausedAtRef    = useRef<number | null>(null)  // when current pause started

  // Edit popup
  const [editingZaznam, setEditingZaznam] = useState<Zaznam | null>(null)

  // Form
  const [nazev,       setNazev]       = useState("")
  const [zakaznikId,  setZakaznikId]  = useState<number | null>(null)
  const [kategorieId, setKategorieId] = useState<number | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────
  const todayStr     = new Date().toISOString().slice(0, 10)
  const todayZaznamy = zaznamy.filter(z => z.end_at && isoDate(z.start_at) === todayStr)
  const todaySeconds = todayZaznamy.reduce((acc, z) =>
    acc + (new Date(z.end_at!).getTime() - new Date(z.start_at).getTime()) / 1000, 0)
  const todayEarnings = todayZaznamy.reduce((acc, z) => acc + calcEarnings(z, kategorie), 0)

  const grouped: { date: string; items: Zaznam[] }[] = []
  for (const z of zaznamy.filter(z => z.end_at)) {
    const d = isoDate(z.start_at)
    const g = grouped.find(g => g.date === d)
    if (g) g.items.push(z); else grouped.push({ date: d, items: [z] })
  }

  // Studio-only customers (projekty může být array nebo JSON string)
  const studioZakaznici = zakaznici.filter(z => {
    if (!z.projekty) return false
    const p = Array.isArray(z.projekty) ? z.projekty : []
    return p.includes("Studio")
  })

  // SVG ring — 1 revolution = 1 hour
  const ringProgress = running ? Math.min((elapsed % 3_600_000) / 3_600_000, 1) : 0
  const ringOffset   = RING_CIRC * (1 - ringProgress)

  const katAktivni = kategorie.find(k => k.id === kategorieId)
  const lastTen    = zaznamy.filter(z => z.end_at).slice(0, 10)

  // ── Data load ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [{ data: zak }, { data: kat }, { data: zzn }] = await Promise.all([
      supabase.from("zakaznici").select("id, jmeno, prijmeni, firma, projekty").order("prijmeni"),
      supabase.from("george_kategorie").select("*").order("sort_order"),
      supabase.from("george_zaznamy").select("*").order("start_at", { ascending: false }).limit(200),
    ])
    setZakaznici(zak ?? [])
    setKategorie(kat ?? [])
    const all: Zaznam[] = zzn ?? []
    setZaznamy(all)
    const live = all.find(z => !z.end_at) ?? null
    if (live) {
      setRunning(live)
      setNazev(live.nazev)
      setZakaznikId(live.zakaznik_id)
      setKategorieId(live.kategorie_id)
      pauseOffsetRef.current = 0
      setElapsed(Date.now() - new Date(live.start_at).getTime())
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Interval tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (running && !paused) {
      intervalRef.current = setInterval(() => {
        const totalPause = pauseOffsetRef.current +
          (pausedAtRef.current ? Date.now() - pausedAtRef.current : 0)
        setElapsed(Date.now() - new Date(running.start_at).getTime() - totalPause)
      }, 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, paused])

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleStart() {
    if (!nazev.trim()) return
    const db = createClient()
    const { data, error } = await db.from("george_zaznamy").insert({
      nazev: nazev.trim(), zakaznik_id: zakaznikId, kategorie_id: kategorieId,
      start_at: new Date().toISOString(),
    }).select().single()
    if (error || !data) return
    pauseOffsetRef.current = 0
    pausedAtRef.current    = null
    setPaused(false)
    setRunning(data)
    setElapsed(0)
    setZaznamy(prev => [data, ...prev])
  }

  async function handleStop() {
    if (!running) return
    const db  = createClient()
    const end = new Date().toISOString()
    await db.from("george_zaznamy").update({ end_at: end }).eq("id", running.id)
    setZaznamy(prev => prev.map(z => z.id === running.id ? { ...z, end_at: end } : z))
    setRunning(null); setElapsed(0); setPaused(false)
    pauseOffsetRef.current = 0; pausedAtRef.current = null
    setNazev("")
  }

  function handlePause() {
    if (paused) {
      if (pausedAtRef.current !== null) {
        pauseOffsetRef.current += Date.now() - pausedAtRef.current
        pausedAtRef.current = null
      }
      setPaused(false)
    } else {
      pausedAtRef.current = Date.now()
      setPaused(true)
    }
  }

  async function handleSaveEdit(id: number, updates: Partial<Zaznam>) {
    const db = createClient()
    const { data, error } = await db.from("george_zaznamy").update(updates).eq("id", id).select().single()
    if (!error && data) {
      setZaznamy(prev => prev.map(z => z.id === data.id ? data : z))
      if (running?.id === data.id) setRunning(data)
    }
    setEditingZaznam(null)
  }

  async function handleDelete(id: number) {
    const db = createClient()
    await db.from("george_zaznamy").delete().eq("id", id)
    setZaznamy(prev => prev.filter(z => z.id !== id))
    if (running?.id === id) {
      setRunning(null); setElapsed(0); setPaused(false)
      pauseOffsetRef.current = 0; pausedAtRef.current = null
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <AppShell module="studio">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
        <span style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</span>
      </div>
    </AppShell>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell module="studio">
      <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

        {/* ── Left panel — entries ──────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          <div style={{ padding: "24px 24px 0" }}>

            {/* KPI row */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              {[
                { label: "Dnes odpracováno", value: formatElapsed(todaySeconds * 1000) },
                { label: "Dnes výdělek (s DPH)", value: `${todayEarnings.toLocaleString("cs-CZ")} Kč` },
                { label: "Záznamy dnes",     value: String(todayZaznamy.length) },
              ].map(kpi => (
                <div key={kpi.label} style={{
                  flex: "1 1 140px", background: "white",
                  borderRadius: "var(--radius-md)", padding: "14px 16px",
                  boxShadow: "var(--shadow-1)", border: "1px solid var(--line)",
                }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>{kpi.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Running banner */}
            {running && (
              <div style={{
                background: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))",
                borderRadius: "var(--radius-md)", padding: "14px 18px", marginBottom: 24,
                display: "flex", alignItems: "center", gap: 14, color: "white",
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: 99, background: "white", opacity: .9,
                  animation: paused ? "none" : "pulse 1.5s infinite", flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{running.nazev}</div>
                  <div style={{ fontSize: 12, opacity: .8, marginTop: 2 }}>
                    {paused ? "⏸ Pozastaveno" : `Spuštěno ${formatTime(running.start_at)}`}
                    {kategorie.find(k => k.id === running.kategorie_id)?.name
                      ? ` · ${kategorie.find(k => k.id === running.kategorie_id)!.name}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>
                  {formatElapsed(elapsed)}
                </div>
              </div>
            )}

            {/* Grouped entries */}
            {grouped.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}>
                <Ico d={IC.clock} size={36} />
                <div style={{ marginTop: 12, fontSize: 15 }}>Zatím žádné záznamy</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Vyplň úkol vpravo a stiskni Spustit</div>
              </div>
            ) : grouped.map(g => {
              const gEarnings = g.items.reduce((a, z) => a + calcEarnings(z, kategorie), 0)
              const gMs       = g.items.reduce((a, z) =>
                a + (new Date(z.end_at!).getTime() - new Date(z.start_at).getTime()), 0)
              return (
                <div key={g.date} style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>{dateLabel(g.date + "T12:00:00")}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
                      {formatElapsed(gMs)}
                      {gEarnings > 0 && (
                        <>
                          {` · `}<span style={{ color: "#4338ca", fontWeight: 500 }}>{gEarnings.toLocaleString("cs-CZ")} Kč</span>
                          <span style={{ fontSize: 10.5, marginLeft: 4 }}>(bez DPH {Math.round(bezDPH(gEarnings)).toLocaleString("cs-CZ")} Kč)</span>
                        </>
                      )}
                    </span>
                  </div>
                  {g.items.map(z => (
                    <ZaznamRadek key={z.id} z={z} kategorie={kategorie} zakaznici={zakaznici}
                      onDelete={handleDelete} onEdit={setEditingZaznam} />
                  ))}
                </div>
              )
            })}
          </div>
          <div style={{ height: 32 }} />
        </div>

        {/* ── Right panel — timer ───────────────────────────────────────── */}
        <div className="hidden ipad:flex flex-col" style={{
          width: 340, flexShrink: 0,
          borderLeft: "1px solid rgba(255,255,255,.05)",
          background: "#0e0f14",
          overflowY: "auto",
        }}>

          {/* Tlačítko "otevřít v okně" */}
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 12px 0" }}>
            <button
              title="Otevřít timer v samostatném okně"
              onClick={() => window.open(
                "/george/timer",
                "GeorgeTimer",
                "width=360,height=680,resizable=yes,scrollbars=yes"
              )}
              style={{
                background: "none", border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 7, padding: "5px 9px", cursor: "pointer",
                color: "#5a5b66", display: "flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 500, transition: "all .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#a9aab5"; e.currentTarget.style.borderColor = "rgba(255,255,255,.2)" }}
              onMouseLeave={e => { e.currentTarget.style.color = "#5a5b66"; e.currentTarget.style.borderColor = "rgba(255,255,255,.08)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <path d="M15 3h6v6" />
                <path d="M10 14L21 3" />
              </svg>
              Otevřít v okně
            </button>
          </div>

          {/* ── Clock widget ── */}
          <div style={{
            padding: "28px 20px 22px",
            display: "flex", flexDirection: "column", alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,.06)",
          }}>
            {/* SVG ring */}
            <div style={{ position: "relative", width: 196, height: 196 }}>
              <svg viewBox="0 0 180 180" width="196" height="196"
                style={{ transform: "rotate(-90deg)" }}>
                <defs>
                  <linearGradient id="arcGrad" gradientUnits="userSpaceOnUse"
                    x1="0" y1="90" x2="180" y2="90">
                    <stop offset="0%"   stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#f97316" />
                  </linearGradient>
                </defs>
                {/* Track */}
                <circle cx="90" cy="90" r={RING_R} fill="none"
                  stroke="rgba(255,255,255,.07)" strokeWidth="9" />
                {/* Arc */}
                {ringProgress > 0 && (
                  <circle cx="90" cy="90" r={RING_R} fill="none"
                    stroke={paused ? "rgba(99,102,241,.35)" : "url(#arcGrad)"}
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRC}
                    strokeDashoffset={ringOffset}
                    style={{ transition: "stroke-dashoffset .9s ease, stroke .3s" }}
                  />
                )}
              </svg>

              {/* Center — time + label */}
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  fontSize: running ? 28 : 22,
                  fontWeight: 700,
                  color: running ? "#eaeaf0" : "#3a3b44",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-.02em",
                  fontFamily: "var(--font-mono)",
                  transition: "font-size .2s",
                }}>
                  {running ? formatClock(elapsed) : "00:00"}
                </div>
                <div style={{
                  fontSize: 8.5, fontWeight: 700, letterSpacing: ".22em",
                  textTransform: "uppercase", marginTop: 5,
                  color: paused ? "#f97316" : running ? "#818cf8" : "#2e2f38",
                  transition: "color .3s",
                }}>
                  {paused ? "Pauza" : running ? "Běží" : "Připraven"}
                </div>
              </div>
            </div>

            {/* Pause / Resume button */}
            {running && (
              <button onClick={handlePause} style={{
                marginTop: 18,
                background: paused ? "rgba(99,102,241,.18)" : "rgba(255,255,255,.06)",
                border: `1px solid ${paused ? "rgba(99,102,241,.4)" : "rgba(255,255,255,.1)"}`,
                borderRadius: 99,
                padding: "7px 24px",
                color: paused ? "#818cf8" : "#7a7b85",
                fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 7,
                transition: "all .15s",
              }}>
                <Ico d={paused ? IC.play : IC.pause} size={13} />
                {paused ? "Pokračovat" : "Pauza"}
              </button>
            )}
          </div>

          {/* ── Form ── */}
          <div style={{ padding: "18px 20px 0" }}>
            <div style={{
              fontSize: 9.5, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: ".16em", color: "#3a3b44", marginBottom: 14,
              fontFamily: "var(--font-mono)",
            }}>
              Nová aktivita
            </div>

            {/* Task name */}
            <div style={{ marginBottom: 11 }}>
              <label style={{ fontSize: 11.5, color: "#7a7b85", display: "block", marginBottom: 4 }}>Název úkolu</label>
              <input
                value={nazev}
                onChange={e => setNazev(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !running) handleStart() }}
                placeholder="Co právě děláš?"
                disabled={!!running}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "9px 11px", borderRadius: 9,
                  border: "1px solid rgba(255,255,255,.08)",
                  fontSize: 13.5, color: "#eaeaf0", outline: "none",
                  background: running ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.05)",
                }}
              />
            </div>

            {/* Zákazník — Studio customers only */}
            <div style={{ marginBottom: 11 }}>
              <label style={{ fontSize: 11.5, color: "#7a7b85", display: "block", marginBottom: 4 }}>Zákazník</label>
              <select
                value={zakaznikId ?? ""}
                onChange={e => setZakaznikId(e.target.value ? Number(e.target.value) : null)}
                disabled={!!running}
                style={{
                  width: "100%", padding: "9px 11px", borderRadius: 9,
                  border: "1px solid rgba(255,255,255,.08)",
                  fontSize: 13, color: "#eaeaf0", outline: "none",
                  background: "#15161c",
                }}
              >
                <option value="">— bez zákazníka —</option>
                {studioZakaznici.map(z => (
                  <option key={z.id} value={z.id}>
                    {z.firma?.trim() || `${z.jmeno} ${z.prijmeni}`.trim() || "—"}
                  </option>
                ))}
              </select>
            </div>

            {/* Kategorie — dropdown */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11.5, color: "#7a7b85", display: "block", marginBottom: 4 }}>Kategorie</label>
              {kategorie.length === 0 ? (
                <p style={{ fontSize: 12, color: "#5a5b66", margin: 0 }}>Přidej kategorie v Ceníku služeb.</p>
              ) : (
                <select
                  value={kategorieId ?? ""}
                  onChange={e => setKategorieId(e.target.value ? Number(e.target.value) : null)}
                  disabled={!!running}
                  style={{
                    width: "100%", padding: "9px 11px", borderRadius: 9,
                    border: `1px solid ${katAktivni ? katAktivni.barva + "66" : "rgba(255,255,255,.08)"}`,
                    fontSize: 13, outline: "none",
                    background: katAktivni ? katAktivni.barva + "1a" : "#15161c",
                    color: katAktivni ? katAktivni.barva : "#a9aab5",
                    fontWeight: katAktivni ? 600 : 400,
                    transition: "all .15s",
                  }}
                >
                  <option value="">— bez kategorie —</option>
                  {kategorie.map(k => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Sazba hint */}
            {katAktivni && katAktivni.sazba > 0 && (
              <div style={{ textAlign: "right", marginBottom: 12, fontSize: 11.5, color: "#5a5b66" }}>
                {katAktivni.sazba.toLocaleString("cs-CZ")} Kč / {katAktivni.sazba_typ === "kus" ? "kus" : "hod"}
              </div>
            )}

            {/* Start / Stop */}
            {running ? (
              <button onClick={handleStop} style={{
                width: "100%", padding: "11px", borderRadius: 11, border: "none", cursor: "pointer",
                background: "#ef4444", color: "white", fontSize: 14.5, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                <Ico d={IC.stop} size={15} />
                Zastavit
              </button>
            ) : (
              <button onClick={handleStart} disabled={!nazev.trim()} style={{
                width: "100%", padding: "11px", borderRadius: 11, border: "none",
                cursor: nazev.trim() ? "pointer" : "default",
                background: nazev.trim()
                  ? "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))"
                  : "rgba(255,255,255,.06)",
                color: nazev.trim() ? "white" : "#5a5b66",
                fontSize: 14.5, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all .15s",
                boxShadow: nazev.trim() ? "0 4px 14px rgba(99,102,241,.35)" : "none",
              }}>
                <Ico d={IC.play} size={15} />
                Spustit
              </button>
            )}
          </div>

          {/* ── Last 10 entries ── */}
          {lastTen.length > 0 && (
            <div style={{ padding: "16px 20px 28px", marginTop: 16, borderTop: "1px solid rgba(255,255,255,.05)" }}>
              <div style={{
                fontSize: 9.5, fontWeight: 600, textTransform: "uppercase",
                letterSpacing: ".16em", color: "#3a3b44", marginBottom: 10,
                fontFamily: "var(--font-mono)",
              }}>
                Poslední záznamy
              </div>
              {lastTen.map(z => {
                const kat = kategorie.find(k => k.id === z.kategorie_id)
                const zak = zakaznici.find(c => c.id === z.zakaznik_id)
                const zakName = zak
                  ? (zak.firma?.trim() || `${zak.jmeno} ${zak.prijmeni}`.trim())
                  : null
                const dur = formatDuration(z.start_at, z.end_at)
                const datumStr = new Date(z.start_at).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })
                const casOd  = formatTime(z.start_at)
                const casDo  = z.end_at ? formatTime(z.end_at) : "…"
                return (
                  <div key={z.id} style={{
                    padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)",
                  }}>
                    {/* Řádek 1: tečka + název + délka + edit */}
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: 99, flexShrink: 0, marginTop: 1,
                        background: kat?.barva ?? "#3a3b44",
                      }} />
                      <span style={{
                        flex: 1, fontSize: 12.5, fontWeight: 500, color: "#a9aab5",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {z.nazev || "(bez názvu)"}
                      </span>
                      <span style={{
                        fontSize: 11, color: "#5a5b66",
                        fontVariantNumeric: "tabular-nums", flexShrink: 0,
                      }}>
                        {dur}
                      </span>
                      <button onClick={() => setEditingZaznam(z)} title="Upravit" style={{
                        background: "none", border: "none", cursor: "pointer", padding: "2px 3px",
                        color: "#3a3b44", borderRadius: 4, flexShrink: 0, lineHeight: 1,
                        transition: "color .15s",
                      }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#818cf8")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#3a3b44")}
                      >
                        <Ico d={IC.edit} size={12} />
                      </button>
                    </div>
                    {/* Řádek 2: klient */}
                    {zakName && (
                      <div style={{ paddingLeft: 14, marginTop: 2, fontSize: 11, color: "#5a5b66", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {zakName}
                      </div>
                    )}
                    {/* Řádek 3: datum a čas */}
                    <div style={{ paddingLeft: 14, marginTop: 1, fontSize: 10.5, color: "#3e3f4a", fontVariantNumeric: "tabular-nums" }}>
                      {datumStr} · {casOd} – {casDo}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>{/* end right panel */}
      </div>

      {/* ── Edit popup ────────────────────────────────────────────────── */}
      {editingZaznam && (
        <EditPopup
          zaznam={editingZaznam}
          kategorie={kategorie}
          zakaznici={zakaznici}
          onSave={handleSaveEdit}
          onClose={() => setEditingZaznam(null)}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: .4; }
        }
      `}</style>
    </AppShell>
  )
}
