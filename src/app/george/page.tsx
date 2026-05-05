"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import AppShell from "@/components/AppShell"

// ── Types ────────────────────────────────────────────────────────────────────
type Zakaznik = { id: number; jmeno: string; prijmeni: string }
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

function formatDuration(start: string, end: string | null) {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
  return formatElapsed(Math.max(0, ms))
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
}

function isoDate(iso: string) {
  return iso.slice(0, 10)
}

function dateLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (isoDate(d.toISOString()) === isoDate(today.toISOString())) return "Dnes"
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
  clock: ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 6v6l4 2"],
  trash: ["M3 6h18","M8 6V4h8v2","M19 6l-1 14H6L5 6"],
  edit:  ["M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7","M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"],
  x:     ["M18 6L6 18","M6 6l12 12"],
}

// ── ZaznamRadek ───────────────────────────────────────────────────────────────
function ZaznamRadek({
  z, kategorie, zakaznici, onDelete,
}: { z: Zaznam; kategorie: Kategorie[]; zakaznici: Zakaznik[]; onDelete: (id: number) => void }) {
  const kat = kategorie.find(k => k.id === z.kategorie_id)
  const zak = zakaznici.find(c => c.id === z.zakaznik_id)
  const earnings = calcEarnings(z, kategorie)
  const dur = z.end_at ? formatDuration(z.start_at, z.end_at) : null

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 0", borderBottom: "1px solid var(--line)",
    }}>
      {/* Color dot */}
      <span style={{
        width: 10, height: 10, borderRadius: 99, flexShrink: 0,
        background: kat?.barva ?? "#8a8a96",
      }} />

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {z.nazev || <span style={{ color: "var(--muted)" }}>(bez názvu)</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {kat && <span>{kat.name}</span>}
          {zak && <span>· {zak.jmeno} {zak.prijmeni}</span>}
          <span>· {formatTime(z.start_at)}{z.end_at ? ` – ${formatTime(z.end_at)}` : ""}</span>
        </div>
      </div>

      {/* Duration */}
      {dur && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{dur}</div>
          {earnings > 0 && <div style={{ fontSize: 11, color: "var(--studio-ink, #4338ca)", marginTop: 1 }}>{earnings.toLocaleString("cs-CZ")} Kč</div>}
        </div>
      )}

      {/* Delete */}
      <button onClick={() => onDelete(z.id)}
        style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: 6, flexShrink: 0 }}>
        <Ico d={IC.trash} size={14} />
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GeorgePage() {
  const [zakaznici, setZakaznici] = useState<Zakaznik[]>([])
  const [kategorie, setKategorie] = useState<Kategorie[]>([])
  const [zaznamy, setZaznamy] = useState<Zaznam[]>([])
  const [loading, setLoading] = useState(true)

  // Timer state
  const [running, setRunning] = useState<Zaznam | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Right panel form
  const [nazev, setNazev] = useState("")
  const [zakaznikId, setZakaznikId] = useState<number | null>(null)
  const [kategorieId, setKategorieId] = useState<number | null>(null)

  // KPI
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayZaznamy = zaznamy.filter(z => z.end_at && isoDate(z.start_at) === todayStr)
  const todaySeconds = todayZaznamy.reduce((acc, z) => {
    return acc + (new Date(z.end_at!).getTime() - new Date(z.start_at).getTime()) / 1000
  }, 0)
  const todayEarnings = todayZaznamy.reduce((acc, z) => acc + calcEarnings(z, kategorie), 0)

  // Group entries by date
  const grouped: { date: string; items: Zaznam[] }[] = []
  for (const z of zaznamy.filter(z => z.end_at)) {
    const d = isoDate(z.start_at)
    const group = grouped.find(g => g.date === d)
    if (group) group.items.push(z)
    else grouped.push({ date: d, items: [z] })
  }

  // ── Data load ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [{ data: zak }, { data: kat }, { data: zzn }] = await Promise.all([
      supabase.from("zakaznici").select("id, jmeno, prijmeni").order("prijmeni"),
      supabase.from("george_kategorie").select("*").order("sort_order"),
      supabase.from("george_zaznamy").select("*").order("start_at", { ascending: false }).limit(200),
    ])
    setZakaznici(zak ?? [])
    setKategorie(kat ?? [])
    const all: Zaznam[] = zzn ?? []
    setZaznamy(all)
    // detect running
    const live = all.find(z => !z.end_at) ?? null
    if (live) {
      setRunning(live)
      setNazev(live.nazev)
      setZakaznikId(live.zakaznik_id)
      setKategorieId(live.kategorie_id)
      setElapsed(Date.now() - new Date(live.start_at).getTime())
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Interval tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - new Date(running.start_at).getTime())
      }, 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  // ── Start timer ────────────────────────────────────────────────────────────
  async function handleStart() {
    if (!nazev.trim()) return
    const db = createClient()
    const { data, error } = await db.from("george_zaznamy").insert({
      nazev: nazev.trim(),
      zakaznik_id: zakaznikId,
      kategorie_id: kategorieId,
      start_at: new Date().toISOString(),
    }).select().single()
    if (error || !data) return
    setRunning(data)
    setElapsed(0)
    setZaznamy(prev => [data, ...prev])
  }

  // ── Stop timer ─────────────────────────────────────────────────────────────
  async function handleStop() {
    if (!running) return
    const db = createClient()
    const end = new Date().toISOString()
    await db.from("george_zaznamy").update({ end_at: end }).eq("id", running.id)
    setZaznamy(prev => prev.map(z => z.id === running.id ? { ...z, end_at: end } : z))
    setRunning(null)
    setElapsed(0)
    setNazev("")
  }

  // ── Delete entry ──────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    const db = createClient()
    await db.from("george_zaznamy").delete().eq("id", id)
    setZaznamy(prev => prev.filter(z => z.id !== id))
    if (running?.id === id) { setRunning(null); setElapsed(0) }
  }

  if (loading) {
    return (
      <AppShell module="studio">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
          <span style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</span>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell module="studio">
      <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

        {/* ── Left panel — entries ── */}
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          <div style={{ padding: "24px 24px 0" }}>

            {/* KPI row */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              {[
                { label: "Dnes odpracováno", value: formatElapsed(todaySeconds * 1000) },
                { label: "Dnes výdělek", value: `${todayEarnings.toLocaleString("cs-CZ")} Kč` },
                { label: "Záznamy dnes", value: String(todayZaznamy.length) },
              ].map(kpi => (
                <div key={kpi.label} style={{
                  flex: "1 1 140px",
                  background: "white",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 16px",
                  boxShadow: "var(--shadow-1)",
                  border: "1px solid var(--line)",
                }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>{kpi.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Running entry banner */}
            {running && (
              <div style={{
                background: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))",
                borderRadius: "var(--radius-md)",
                padding: "14px 18px",
                marginBottom: 24,
                display: "flex", alignItems: "center", gap: 14,
                color: "white",
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: 99,
                  background: "white", opacity: .9,
                  animation: "pulse 1.5s infinite",
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{running.nazev}</div>
                  <div style={{ fontSize: 12, opacity: .8, marginTop: 2 }}>
                    Spuštěno {formatTime(running.start_at)}
                    {kategorie.find(k => k.id === running.kategorie_id)?.name ? ` · ${kategorie.find(k => k.id === running.kategorie_id)!.name}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>
                  {formatElapsed(elapsed)}
                </div>
              </div>
            )}

            {/* Entries grouped by date */}
            {grouped.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}>
                <Ico d={IC.clock} size={36} />
                <div style={{ marginTop: 12, fontSize: 15 }}>Zatím žádné záznamy</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Vyplň úkol vpravo a stiskni Start</div>
              </div>
            ) : grouped.map(g => {
              const groupEarnings = g.items.reduce((acc, z) => acc + calcEarnings(z, kategorie), 0)
              const groupMs = g.items.reduce((acc, z) => {
                return acc + (new Date(z.end_at!).getTime() - new Date(z.start_at).getTime())
              }, 0)
              return (
                <div key={g.date} style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>{dateLabel(g.date + "T12:00:00")}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {formatElapsed(groupMs)}
                      {groupEarnings > 0 ? ` · ${groupEarnings.toLocaleString("cs-CZ")} Kč` : ""}
                    </span>
                  </div>
                  {g.items.map(z => (
                    <ZaznamRadek key={z.id} z={z} kategorie={kategorie} zakaznici={zakaznici} onDelete={handleDelete} />
                  ))}
                </div>
              )
            })}
          </div>
          <div style={{ height: 32 }} />
        </div>

        {/* ── Right panel — timer ── */}
        <div className="hidden ipad:flex flex-col" style={{
          width: 280,
          borderLeft: "1px solid rgba(255,255,255,.05)",
          background: "#0e0f14",
          overflowY: "auto",
          flexShrink: 0,
        }}>
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".14em", color: "#5a5b66", marginBottom: 16, fontFamily: "var(--font-mono)" }}>
              Nová aktivita
            </div>

            {/* Task name */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#7a7b85", display: "block", marginBottom: 4 }}>Název úkolu</label>
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
                  fontSize: 14, color: "#eaeaf0", outline: "none",
                  background: "rgba(255,255,255,.04)",
                }}
              />
            </div>

            {/* Zákazník */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#7a7b85", display: "block", marginBottom: 4 }}>Zákazník</label>
              <select
                value={zakaznikId ?? ""}
                onChange={e => setZakaznikId(e.target.value ? Number(e.target.value) : null)}
                disabled={!!running}
                style={{
                  width: "100%", padding: "9px 11px", borderRadius: 9,
                  border: "1px solid rgba(255,255,255,.08)",
                  fontSize: 13, color: "#eaeaf0", outline: "none",
                  background: "#15161c",
                }}>
                <option value="">— bez zákazníka —</option>
                {zakaznici.map(z => (
                  <option key={z.id} value={z.id}>{z.jmeno} {z.prijmeni}</option>
                ))}
              </select>
            </div>

            {/* Kategorie — color pills */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: "#7a7b85", display: "block", marginBottom: 6 }}>Kategorie</label>
              {kategorie.length === 0 ? (
                <p style={{ fontSize: 12, color: "#5a5b66" }}>Přidej kategorie v Ceníku služeb.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {kategorie.map(k => {
                    const active = kategorieId === k.id
                    return (
                      <button
                        key={k.id}
                        onClick={() => !running && setKategorieId(active ? null : k.id)}
                        disabled={!!running}
                        style={{
                          padding: "5px 10px", borderRadius: 99, fontSize: 12, cursor: running ? "default" : "pointer",
                          border: `1.5px solid ${active ? k.barva : "rgba(255,255,255,.1)"}`,
                          background: active ? k.barva + "33" : "rgba(255,255,255,.04)",
                          color: active ? k.barva : "#a9aab5",
                          fontWeight: active ? 600 : 400,
                          transition: "all .12s",
                        }}>
                        {k.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Elapsed display */}
            {running && (
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 36, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-.04em", color: "#eaeaf0" }}>
                  {formatElapsed(elapsed)}
                </div>
              </div>
            )}

            {/* Start / Stop button */}
            {running ? (
              <button onClick={handleStop} style={{
                width: "100%", padding: "12px",
                borderRadius: 11, border: "none", cursor: "pointer",
                background: "#ef4444", color: "white",
                fontSize: 15, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                <Ico d={IC.stop} size={16} />
                Stop
              </button>
            ) : (
              <button onClick={handleStart} disabled={!nazev.trim()} style={{
                width: "100%", padding: "12px",
                borderRadius: 11, border: "none", cursor: nazev.trim() ? "pointer" : "default",
                background: nazev.trim()
                  ? "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))"
                  : "rgba(255,255,255,.06)",
                color: nazev.trim() ? "white" : "#5a5b66",
                fontSize: 15, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all .15s",
                boxShadow: nazev.trim() ? "0 4px 14px rgba(99,102,241,.35)" : "none",
              }}>
                <Ico d={IC.play} size={16} />
                Start
              </button>
            )}

            {/* Sazba hint */}
            {kategorieId && (() => {
              const k = kategorie.find(x => x.id === kategorieId)
              if (!k || !k.sazba) return null
              return (
                <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "#7a7b85" }}>
                  {k.sazba.toLocaleString("cs-CZ")} Kč / {k.sazba_typ === "kus" ? "kus" : "hod"}
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .4; }
        }
      `}</style>
    </AppShell>
  )
}
