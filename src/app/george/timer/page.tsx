"use client"

// Standalone timer okno — otevírá se přes window.open() jako mini-popup
// URL: /george/timer
// Doporučená velikost okna: 360 × 680 px

import { useEffect, useRef, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"

type Zakaznik = { id: number; jmeno: string; prijmeni: string; firma?: string | null; projekty: string[] | null }
type Kategorie = { id: number; name: string; barva: string; sazba_typ: string; sazba: number }
type Zaznam    = { id: number; zakaznik_id: number | null; kategorie_id: number | null; nazev: string; start_at: string; end_at: string | null; poznamka: string }

const RING_R    = 72
const RING_CIRC = 2 * Math.PI * RING_R

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
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
}
function formatDuration(start: string, end: string | null) {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
  return formatElapsed(Math.max(0, ms))
}
function isoDate(iso: string) { return iso.slice(0, 10) }
function isoToDate(iso: string) {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}
function isoToTime(iso: string) {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
function localToIso(date: string, time: string) { return new Date(`${date}T${time}`).toISOString() }

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
  edit:  ["M12 20h9", "M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
  close: "M18 6L6 18M6 6l12 12",
}

export default function TimerPopup() {
  const [zakaznici, setZakaznici] = useState<Zakaznik[]>([])
  const [kategorie, setKategorie] = useState<Kategorie[]>([])
  const [zaznamy,   setZaznamy]   = useState<Zaznam[]>([])
  const [loading,   setLoading]   = useState(true)

  const [running, setRunning] = useState<Zaznam | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [paused,  setPaused]  = useState(false)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const pauseOffsetRef = useRef(0)
  const pausedAtRef    = useRef<number | null>(null)

  const [nazev,       setNazev]       = useState("")
  const [zakaznikId,  setZakaznikId]  = useState<number | null>(null)
  const [kategorieId, setKategorieId] = useState<number | null>(null)

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt: () => void } | null>(null)
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as Event & { prompt: () => void }) }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  // Nastavit title okna
  useEffect(() => { document.title = "Timer · George Studio" }, [])

  const loadData = useCallback(async () => {
    const [{ data: zak }, { data: kat }, { data: zzn }] = await Promise.all([
      supabase.from("zakaznici").select("id, jmeno, prijmeni, firma, projekty").order("prijmeni"),
      supabase.from("george_kategorie").select("*").order("sort_order"),
      supabase.from("george_zaznamy").select("*").order("start_at", { ascending: false }).limit(20),
    ])
    setZakaznici(zak ?? [])
    setKategorie(kat ?? [])
    const all: Zaznam[] = zzn ?? []
    setZaznamy(all)
    const live = all.find(z => !z.end_at) ?? null
    if (live) {
      setRunning(live); setNazev(live.nazev); setZakaznikId(live.zakaznik_id); setKategorieId(live.kategorie_id)
      pauseOffsetRef.current = 0
      setElapsed(Date.now() - new Date(live.start_at).getTime())
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (running && !paused) {
      intervalRef.current = setInterval(() => {
        const totalPause = pauseOffsetRef.current + (pausedAtRef.current ? Date.now() - pausedAtRef.current : 0)
        setElapsed(Date.now() - new Date(running.start_at).getTime() - totalPause)
      }, 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, paused])

  // Sync title s časem
  useEffect(() => {
    if (running) document.title = `${formatClock(elapsed)} · Timer`
    else document.title = "Timer · George Studio"
  }, [elapsed, running])

  async function handleStart() {
    if (!nazev.trim()) return
    const db = createClient()
    const { data, error } = await db.from("george_zaznamy").insert({
      nazev: nazev.trim(), zakaznik_id: zakaznikId, kategorie_id: kategorieId,
      start_at: new Date().toISOString(),
    }).select().single()
    if (error || !data) return
    pauseOffsetRef.current = 0; pausedAtRef.current = null
    setPaused(false); setRunning(data); setElapsed(0)
    setZaznamy(prev => [data, ...prev])
  }

  async function handleStop() {
    if (!running) return
    const db = createClient()
    const end = new Date().toISOString()
    await db.from("george_zaznamy").update({ end_at: end }).eq("id", running.id)
    setZaznamy(prev => prev.map(z => z.id === running.id ? { ...z, end_at: end } : z))
    setRunning(null); setElapsed(0); setPaused(false)
    pauseOffsetRef.current = 0; pausedAtRef.current = null
    setNazev("")
  }

  function handlePause() {
    if (paused) {
      if (pausedAtRef.current !== null) { pauseOffsetRef.current += Date.now() - pausedAtRef.current; pausedAtRef.current = null }
      setPaused(false)
    } else { pausedAtRef.current = Date.now(); setPaused(true) }
  }

  async function handleDelete(id: number) {
    const db = createClient()
    await db.from("george_zaznamy").delete().eq("id", id)
    setZaznamy(prev => prev.filter(z => z.id !== id))
    if (running?.id === id) { setRunning(null); setElapsed(0); setPaused(false); pauseOffsetRef.current = 0; pausedAtRef.current = null }
  }

  const studioZakaznici = zakaznici.filter(z => Array.isArray(z.projekty) && z.projekty.includes("Studio"))
  const katAktivni      = kategorie.find(k => k.id === kategorieId)
  const ringProgress    = running ? Math.min((elapsed % 3_600_000) / 3_600_000, 1) : 0
  const ringOffset      = RING_CIRC * (1 - ringProgress)
  const lastTen         = zaznamy.filter(z => z.end_at).slice(0, 10)

  const todayStr      = new Date().toISOString().slice(0, 10)
  const todayZaznamy  = zaznamy.filter(z => z.end_at && isoDate(z.start_at) === todayStr)
  const todaySeconds  = todayZaznamy.reduce((acc, z) =>
    acc + (new Date(z.end_at!).getTime() - new Date(z.start_at).getTime()) / 1000, 0)

  if (loading) return (
    <div style={{ background: "#0e0f14", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "#3a3b44", fontSize: 13 }}>Načítám…</span>
    </div>
  )

  return (
    <div style={{
      background: "#0e0f14", minHeight: "100vh", overflowY: "auto",
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #0e0f14; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin  { to{transform:rotate(360deg)} }
        select option { background: #15161c; }
      `}</style>

      {/* ── Hlavička ── */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#0a0b10",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            background: "conic-gradient(from 220deg, #6366f1, #f97316, #6366f1)",
            display: "grid", placeItems: "center",
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#5a5b66", letterSpacing: ".1em", textTransform: "uppercase" }}>
            George Studio · Timer
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {installPrompt && (
            <button onClick={() => { installPrompt.prompt(); setInstallPrompt(null) }} style={{
              background: "rgba(99,102,241,.15)", border: "1px solid rgba(99,102,241,.35)",
              borderRadius: 7, padding: "4px 10px", color: "#818cf8", fontSize: 11,
              fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
            }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v13M7 11l5 5 5-5" /><rect x="3" y="18" width="18" height="3" rx="1.5" fill="currentColor" stroke="none" />
              </svg>
              Nainstalovat
            </button>
          )}
          <span style={{ fontSize: 11, color: "#3a3b44", fontVariantNumeric: "tabular-nums" }}>
            Dnes: {formatElapsed(todaySeconds * 1000)}
          </span>
        </div>
      </div>

      {/* ── Ring ── */}
      <div style={{ padding: "20px 20px 14px", display: "flex", flexDirection: "column", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ position: "relative", width: 180, height: 180 }}>
          <svg viewBox="0 0 180 180" width="180" height="180" style={{ transform: "rotate(-90deg)" }}>
            <defs>
              <linearGradient id="arcGrad2" gradientUnits="userSpaceOnUse" x1="0" y1="90" x2="180" y2="90">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#f97316" />
              </linearGradient>
            </defs>
            <circle cx="90" cy="90" r={RING_R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="9" />
            {ringProgress > 0 && (
              <circle cx="90" cy="90" r={RING_R} fill="none"
                stroke={paused ? "rgba(99,102,241,.35)" : "url(#arcGrad2)"}
                strokeWidth="9" strokeLinecap="round"
                strokeDasharray={RING_CIRC} strokeDashoffset={ringOffset}
                style={{ transition: "stroke-dashoffset .9s ease" }}
              />
            )}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              fontSize: running ? 26 : 20, fontWeight: 700, letterSpacing: "-.02em",
              color: running ? "#eaeaf0" : "#3a3b44", fontVariantNumeric: "tabular-nums",
              fontFamily: "ui-monospace, monospace",
            }}>
              {running ? formatClock(elapsed) : "00:00"}
            </div>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", marginTop: 4,
              color: paused ? "#f97316" : running ? "#818cf8" : "#2e2f38",
            }}>
              {paused ? "Pauza" : running ? "Běží" : "Připraven"}
            </div>
          </div>
        </div>

        {running && (
          <button onClick={handlePause} style={{
            marginTop: 12,
            background: paused ? "rgba(99,102,241,.18)" : "rgba(255,255,255,.06)",
            border: `1px solid ${paused ? "rgba(99,102,241,.4)" : "rgba(255,255,255,.1)"}`,
            borderRadius: 99, padding: "6px 20px",
            color: paused ? "#818cf8" : "#7a7b85",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Ico d={paused ? IC.play : IC.pause} size={12} />
            {paused ? "Pokračovat" : "Pauza"}
          </button>
        )}
      </div>

      {/* ── Formulář ── */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".16em", color: "#3a3b44", marginBottom: 12, fontFamily: "ui-monospace, monospace" }}>
          Nová aktivita
        </div>

        <input value={nazev} onChange={e => setNazev(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !running) handleStart() }}
          placeholder="Co právě děláš?" disabled={!!running}
          style={{
            width: "100%", padding: "9px 11px", borderRadius: 9, marginBottom: 10,
            border: "1px solid rgba(255,255,255,.08)", fontSize: 13.5,
            color: "#eaeaf0", outline: "none",
            background: running ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.05)",
          }}
        />

        <select value={zakaznikId ?? ""} onChange={e => setZakaznikId(e.target.value ? Number(e.target.value) : null)}
          disabled={!!running}
          style={{
            width: "100%", padding: "8px 11px", borderRadius: 9, marginBottom: 10,
            border: "1px solid rgba(255,255,255,.08)", fontSize: 13,
            color: "#a9aab5", outline: "none", background: "#15161c",
          }}>
          <option value="">— bez zákazníka —</option>
          {studioZakaznici.map(z => (
            <option key={z.id} value={z.id}>{z.firma?.trim() || `${z.jmeno} ${z.prijmeni}`.trim()}</option>
          ))}
        </select>

        <select value={kategorieId ?? ""} onChange={e => setKategorieId(e.target.value ? Number(e.target.value) : null)}
          disabled={!!running}
          style={{
            width: "100%", padding: "8px 11px", borderRadius: 9, marginBottom: 14,
            border: `1px solid ${katAktivni ? katAktivni.barva + "66" : "rgba(255,255,255,.08)"}`,
            fontSize: 13, outline: "none",
            background: katAktivni ? katAktivni.barva + "1a" : "#15161c",
            color: katAktivni ? katAktivni.barva : "#a9aab5",
            fontWeight: katAktivni ? 600 : 400,
          }}>
          <option value="">— bez kategorie —</option>
          {kategorie.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>

        {running ? (
          <button onClick={handleStop} style={{
            width: "100%", padding: "11px", borderRadius: 11, border: "none", cursor: "pointer",
            background: "#ef4444", color: "white", fontSize: 14, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
            <Ico d={IC.stop} size={14} /> Zastavit
          </button>
        ) : (
          <button onClick={handleStart} disabled={!nazev.trim()} style={{
            width: "100%", padding: "11px", borderRadius: 11, border: "none",
            cursor: nazev.trim() ? "pointer" : "default",
            background: nazev.trim() ? "linear-gradient(135deg, #6366f1, #f97316)" : "rgba(255,255,255,.06)",
            color: nazev.trim() ? "white" : "#5a5b66",
            fontSize: 14, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            boxShadow: nazev.trim() ? "0 4px 14px rgba(99,102,241,.35)" : "none",
          }}>
            <Ico d={IC.play} size={14} /> Spustit
          </button>
        )}
      </div>

      {/* ── Poslední záznamy ── */}
      {lastTen.length > 0 && (
        <div style={{ padding: "14px 16px 24px", marginTop: 14, borderTop: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".16em", color: "#3a3b44", marginBottom: 10, fontFamily: "ui-monospace, monospace" }}>
            Poslední záznamy
          </div>
          {lastTen.map(z => {
            const kat = kategorie.find(k => k.id === z.kategorie_id)
            const zak = zakaznici.find(c => c.id === z.zakaznik_id)
            const zakName = zak ? (zak.firma?.trim() || `${zak.jmeno} ${zak.prijmeni}`.trim()) : null
            return (
              <div key={z.id} style={{ padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: kat?.barva ?? "#3a3b44" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#a9aab5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {z.nazev || "(bez názvu)"}
                  </div>
                  {zakName && <div style={{ fontSize: 10.5, color: "#5a5b66" }}>{zakName}</div>}
                </div>
                <span style={{ fontSize: 11, color: "#5a5b66", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {formatDuration(z.start_at, z.end_at)}
                </span>
                <button onClick={() => handleDelete(z.id)} title="Smazat" style={{
                  background: "none", border: "none", cursor: "pointer", padding: "2px 3px",
                  color: "#3a3b44", borderRadius: 4, flexShrink: 0, lineHeight: 1,
                }}>
                  <Ico d={IC.trash} size={11} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
