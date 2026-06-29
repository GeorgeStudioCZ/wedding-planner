"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import AppShell from "@/components/AppShell"
import { bezDPH } from "@/lib/dph"

type Zakaznik  = { id: number; jmeno: string; prijmeni: string; firma?: string | null; projekty: string[] | null }
type Kategorie = { id: number; name: string; barva: string; sazba_typ: string; sazba: number; typ: string | null }
type Zaznam    = {
  id: number
  zakaznik_id: number | null
  kategorie_id: number | null
  nazev: string
  start_at: string
  end_at: string | null
  poznamka: string
  pocet: number | null
  cena_prodej_kus: number | null
  cena_nakup_kus: number | null
  fakturovano: boolean
  sf_faktura_id: number | null
  sf_faktura_no: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}
function formatDuration(start: string, end: string) {
  return formatElapsed(Math.max(0, new Date(end).getTime() - new Date(start).getTime()))
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
}
function isoDate(iso: string) { return iso.slice(0, 10) }

function dateLabel(iso: string) {
  const d = new Date(iso)
  const today     = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (isoDate(d.toISOString()) === isoDate(today.toISOString()))     return "Dnes"
  if (isoDate(d.toISOString()) === isoDate(yesterday.toISOString())) return "Včera"
  return d.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

function zformatCena(kc: number) {
  return kc.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč"
}

function zaznamCena(z: Zaznam, kat: Kategorie | undefined): number {
  if (z.pocet != null && z.cena_prodej_kus != null) return z.pocet * z.cena_prodej_kus
  if (!z.end_at || !kat) return 0
  const hours = (new Date(z.end_at).getTime() - new Date(z.start_at).getTime()) / 3_600_000
  return Math.round(hours * kat.sazba * 100) / 100
}

// ── Výchozí rozsah — aktuální měsíc ───────────────────────────────────────────
function defaultDateRange() {
  const now = new Date()
  const od  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const do_ = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { od, do: do_ }
}

// ── Rychlé rozsahy ────────────────────────────────────────────────────────────
function quickRanges() {
  const now  = new Date()
  const y    = now.getFullYear()
  const m    = now.getMonth()
  return [
    { label: "Tento měsíc",    od: new Date(y, m, 1).toISOString().slice(0, 10),     do: new Date(y, m + 1, 0).toISOString().slice(0, 10) },
    { label: "Minulý měsíc",   od: new Date(y, m - 1, 1).toISOString().slice(0, 10), do: new Date(y, m, 0).toISOString().slice(0, 10) },
    { label: "Tento rok",      od: `${y}-01-01`,                                      do: `${y}-12-31` },
    { label: "Vše",            od: "2020-01-01",                                      do: new Date(y + 1, 0, 0).toISOString().slice(0, 10) },
  ]
}

export default function ReportyPage() {
  const router = useRouter()
  const [zakaznici, setZakaznici] = useState<Zakaznik[]>([])
  const [kategorie, setKategorie] = useState<Kategorie[]>([])
  const [zaznamy,   setZaznamy]   = useState<Zaznam[]>([])
  const [loading,   setLoading]   = useState(true)
  const [fakturaLoading, setFakturaLoading] = useState(false)
  const [fakturaError,   setFakturaError]   = useState<string | null>(null)
  const [fakturaOk,      setFakturaOk]      = useState(false)

  // ── Filtry ────────────────────────────────────────────────────────────────
  const def = defaultDateRange()
  const [filterZakaznik,  setFilterZakaznik]  = useState<number | "">("")
  const [filterOd,        setFilterOd]        = useState(def.od)
  const [filterDo,        setFilterDo]        = useState(def.do)
  const [filterFaktura,   setFilterFaktura]   = useState<"vse" | "ano" | "ne">("vse")

  const loadData = useCallback(async () => {
    const [{ data: zak }, { data: kat }, { data: zzn }] = await Promise.all([
      supabase.from("zakaznici").select("id, jmeno, prijmeni, firma, projekty").order("prijmeni"),
      supabase.from("george_kategorie").select("*").order("sort_order"),
      supabase.from("george_zaznamy").select("*").order("start_at", { ascending: false }),
    ])
    setZakaznici(zak ?? [])
    setKategorie(kat ?? [])
    setZaznamy((zzn ?? []).map(z => ({ ...z, fakturovano: z.fakturovano ?? false, sf_faktura_id: z.sf_faktura_id ?? null, sf_faktura_no: z.sf_faktura_no ?? null })))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Filtrace ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return zaznamy.filter(z => {
      if (!z.end_at) return false                                 // probíhající
      if (filterZakaznik !== "" && z.zakaznik_id !== filterZakaznik) return false
      const den = isoDate(z.start_at)
      if (den < filterOd || den > filterDo) return false
      if (filterFaktura === "ano" && !z.fakturovano)  return false
      if (filterFaktura === "ne"  &&  z.fakturovano)  return false
      return true
    })
  }, [zaznamy, filterZakaznik, filterOd, filterDo, filterFaktura])

  // ── KPI ───────────────────────────────────────────────────────────────────
  const katMap = useMemo(() => Object.fromEntries(kategorie.map(k => [k.id, k])), [kategorie])

  const kpi = useMemo(() => {
    let ms = 0; let celkemKc = 0
    for (const z of filtered) {
      if (z.end_at && z.pocet == null) ms += new Date(z.end_at).getTime() - new Date(z.start_at).getTime()
      celkemKc += zaznamCena(z, z.kategorie_id ? katMap[z.kategorie_id] : undefined)
    }
    return { ms, celkemKc, pocet: filtered.length }
  }, [filtered, katMap])

  // ── Skupiny podle dne ─────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, Zaznam[]>()
    for (const z of filtered) {
      const d = isoDate(z.start_at)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(z)
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  // ── Vystavit fakturu ─────────────────────────────────────────────────────
  async function vytvorFakturu() {
    if (filterZakaznik === "" || filteredNevyfakt.length === 0) return
    setFakturaLoading(true); setFakturaError(null); setFakturaOk(false)
    try {
      const res = await fetch("/api/george/vytvor-fakturu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zaznamyIds: filteredNevyfakt.map(z => z.id), zakaznikId: filterZakaznik }),
      })
      const json = await res.json() as { ok: boolean; sf_id?: number; invoice_no?: string; error?: string }
      if (!json.ok) throw new Error(json.error ?? "Neznámá chyba")
      setFakturaOk(true)
      // Obnov záznamy z DB (stavy fakturovano se změnily)
      const { data } = await supabase.from("george_zaznamy").select("*").order("start_at", { ascending: false })
      if (data) setZaznamy(data.map(z => ({ ...z, fakturovano: z.fakturovano ?? false, sf_faktura_id: z.sf_faktura_id ?? null, sf_faktura_no: z.sf_faktura_no ?? null })))
    } catch (e) {
      setFakturaError(e instanceof Error ? e.message : String(e))
    }
    setFakturaLoading(false)
  }

  // Jen nevyfakturované z filtru — tyto jdou do faktury
  const filteredNevyfakt = useMemo(() => filtered.filter(z => !z.fakturovano), [filtered])

  function otevritReport() {
    const params = new URLSearchParams()
    if (filterZakaznik !== "") params.set("zakaznik", String(filterZakaznik))
    if (filterOd) params.set("od", filterOd)
    if (filterDo) params.set("do", filterDo)
    params.set("faktura", filterFaktura)
    window.open(`/george/reporty/print?${params.toString()}`, "_blank")
  }

  const studioZak = useMemo(
    () => zakaznici.filter(z => Array.isArray(z.projekty) && z.projekty.includes("Studio")),
    [zakaznici]
  )

  if (loading) return (
    <AppShell module="studio">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
        <span style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</span>
      </div>
    </AppShell>
  )

  const inp: React.CSSProperties = {
    padding: "8px 11px", borderRadius: 8, border: "1px solid var(--line)",
    fontSize: 13, color: "var(--ink)", background: "white", outline: "none",
  }

  return (
    <AppShell module="studio">
      <div style={{ padding: "24px 24px 48px", maxWidth: 960, margin: "0 auto" }}>

        {/* ── Nadpis ── */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Reporty</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>Přehled odpracovaného času a výdělků</p>
        </div>

        {/* ── Filtry ── */}
        <div style={{
          background: "white", borderRadius: "var(--radius-md)", padding: "16px 20px",
          boxShadow: "var(--shadow-1)", border: "1px solid var(--line)", marginBottom: 20,
        }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>

            {/* Zákazník */}
            <div style={{ flex: "1 1 180px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Zákazník</div>
              <select value={filterZakaznik} onChange={e => setFilterZakaznik(e.target.value ? Number(e.target.value) : "")} style={{ ...inp, width: "100%" }}>
                <option value="">— všichni —</option>
                {studioZak.map(z => (
                  <option key={z.id} value={z.id}>{z.firma?.trim() || `${z.jmeno} ${z.prijmeni}`.trim()}</option>
                ))}
              </select>
            </div>

            {/* Datum od */}
            <div style={{ flex: "1 1 130px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Od</div>
              <input type="date" value={filterOd} onChange={e => setFilterOd(e.target.value)} style={{ ...inp, width: "100%", colorScheme: "light" }} />
            </div>

            {/* Datum do */}
            <div style={{ flex: "1 1 130px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Do</div>
              <input type="date" value={filterDo} onChange={e => setFilterDo(e.target.value)} style={{ ...inp, width: "100%", colorScheme: "light" }} />
            </div>

            {/* Fakturace */}
            <div style={{ flex: "1 1 160px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Fakturace</div>
              <div style={{ display: "flex", gap: 6 }}>
                {([["vse", "Vše"], ["ne", "Nevyfakturované"], ["ano", "Vyfakturované"]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setFilterFaktura(v)} style={{
                    flex: 1, padding: "8px 6px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600,
                    border: "1.5px solid", transition: "all .12s",
                    borderColor: filterFaktura === v ? "var(--studio-grad-a)" : "var(--line)",
                    background: filterFaktura === v ? "rgba(99,102,241,.08)" : "white",
                    color: filterFaktura === v ? "var(--studio-grad-a)" : "var(--muted)",
                  }}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Rychlé rozsahy */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {quickRanges().map(r => (
              <button key={r.label} onClick={() => { setFilterOd(r.od); setFilterDo(r.do) }} style={{
                padding: "4px 10px", borderRadius: 20, border: "1px solid var(--line)",
                background: (filterOd === r.od && filterDo === r.do) ? "var(--ink)" : "white",
                color: (filterOd === r.od && filterDo === r.do) ? "white" : "var(--muted)",
                fontSize: 11.5, fontWeight: 500, cursor: "pointer", transition: "all .12s",
              }}>{r.label}</button>
            ))}
          </div>
        </div>

        {/* ── KPI ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Celkem odpracováno", value: formatElapsed(kpi.ms) },
            { label: "Celkem s DPH",       value: zformatCena(kpi.celkemKc) },
            { label: "Bez DPH",            value: zformatCena(bezDPH(kpi.celkemKc)) },
            { label: "Počet záznamů",      value: String(kpi.pocet) },
          ].map(k => (
            <div key={k.label} style={{
              flex: "1 1 150px", background: "white", borderRadius: "var(--radius-md)",
              padding: "14px 16px", boxShadow: "var(--shadow-1)", border: "1px solid var(--line)",
            }}>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* ── Akce ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          {/* PDF report */}
          <button
            onClick={() => otevritReport()}
            disabled={filtered.length === 0 || filterZakaznik === ""}
            style={{
              padding: "9px 18px", borderRadius: 9, border: "1px solid var(--line)",
              background: "white", color: "var(--ink)", fontSize: 13, fontWeight: 600,
              cursor: filtered.length > 0 && filterZakaznik !== "" ? "pointer" : "default",
              opacity: filtered.length === 0 || filterZakaznik === "" ? .4 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
            PDF report
          </button>

          {/* Vystavit fakturu — jen nevyfakturované záznamy */}
          <button
            onClick={vytvorFakturu}
            disabled={fakturaLoading || filteredNevyfakt.length === 0 || filterZakaznik === ""}
            style={{
              padding: "9px 18px", borderRadius: 9, border: "none",
              background: filteredNevyfakt.length > 0 && filterZakaznik !== "" && !fakturaLoading
                ? "linear-gradient(135deg, #6366f1, #f97316)" : "var(--line)",
              color: filteredNevyfakt.length > 0 && filterZakaznik !== "" && !fakturaLoading ? "white" : "var(--muted)",
              fontSize: 13, fontWeight: 600,
              cursor: filteredNevyfakt.length > 0 && filterZakaznik !== "" && !fakturaLoading ? "pointer" : "default",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6M9 15l3 3 3-3"/></svg>
            {fakturaLoading ? "Vystavuji…" : `Vystavit fakturu SF (${filteredNevyfakt.length} pol.)`}
          </button>

          {filterZakaznik === "" && filtered.length > 0 && (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Vyberte zákazníka pro vystavení faktury</span>
          )}
        </div>

        {/* Faktura vystavena */}
        {fakturaOk && (
          <div style={{
            marginBottom: 20, padding: "12px 18px", borderRadius: "var(--radius-md)",
            background: "#f0fdf4", border: "1px solid #86efac", display: "flex", gap: 12, alignItems: "center",
          }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#15803d", flex: 1 }}>Faktura úspěšně vystavena</span>
            <button onClick={() => router.push("/george/fakturace")} style={{
              padding: "5px 12px", borderRadius: 7, background: "#16a34a", color: "white",
              fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
            }}>Přejít na Fakturace →</button>
          </div>
        )}

        {/* Chyba faktury */}
        {fakturaError && (
          <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: "var(--radius-md)", background: "#fef2f2", border: "1px solid #fca5a5", fontSize: 13, color: "#dc2626" }}>
            ⚠ Chyba při vystavování faktury: {fakturaError}
          </div>
        )}

        {/* ── Záznamy ── */}
        {grouped.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)", fontSize: 14 }}>
            Žádné záznamy pro vybrané filtry
          </div>
        ) : grouped.map(([den, zzn]) => {
          const denMs  = zzn.filter(z => z.pocet == null && z.end_at).reduce((a, z) => a + new Date(z.end_at!).getTime() - new Date(z.start_at).getTime(), 0)
          const denKc  = zzn.reduce((a, z) => a + zaznamCena(z, z.kategorie_id ? katMap[z.kategorie_id] : undefined), 0)
          return (
            <div key={den} style={{ marginBottom: 16 }}>
              {/* Den header */}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, padding: "0 2px" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{dateLabel(den + "T12:00:00")}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                  {denMs > 0 && <>{formatElapsed(denMs)} · </>}
                  <strong style={{ color: "var(--ink)" }}>{zformatCena(denKc)}</strong>
                  <span style={{ color: "var(--muted)" }}> (bez DPH {zformatCena(bezDPH(denKc))})</span>
                </span>
              </div>

              {/* Řádky */}
              <div style={{ background: "white", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-1)", border: "1px solid var(--line)", overflow: "hidden" }}>
                {zzn.map((z, i) => {
                  const kat = z.kategorie_id ? katMap[z.kategorie_id] : undefined
                  const zak = zakaznici.find(x => x.id === z.zakaznik_id)
                  const zakName = zak ? (zak.firma?.trim() || `${zak.jmeno} ${zak.prijmeni}`.trim()) : null
                  const cena = zaznamCena(z, kat)
                  const jeMaterial = z.pocet != null
                  return (
                    <div key={z.id} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                      borderBottom: i < zzn.length - 1 ? "1px solid var(--line)" : "none",
                    }}>
                      {/* Typ badge */}
                      <div style={{
                        width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                        background: kat?.barva ? kat.barva + "22" : "var(--line)",
                        border: `1.5px solid ${kat?.barva ?? "var(--line)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 800, color: kat?.barva ?? "var(--muted)",
                      }}>
                        {jeMaterial ? "M" : "S"}
                      </div>

                      {/* Název + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {z.nazev || "(bez názvu)"}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>
                          {kat?.name && <span style={{ color: kat.barva, fontWeight: 600 }}>{kat.name}</span>}
                          {zakName && <span style={{ color: "var(--muted)" }}> · {zakName}</span>}
                          {z.end_at && !jeMaterial && (
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>
                              {" · "}{formatTime(z.start_at)} – {formatTime(z.end_at)}
                            </span>
                          )}
                          {jeMaterial && z.pocet != null && (
                            <span> · {z.pocet}× {kat?.name}</span>
                          )}
                        </div>
                      </div>

                      {/* Trvání */}
                      {z.end_at && !jeMaterial && (
                        <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                          {formatDuration(z.start_at, z.end_at)}
                        </span>
                      )}

                      {/* Cena */}
                      {cena > 0 && (
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{zformatCena(cena)}</div>
                          <div style={{ fontSize: 10.5, color: "var(--muted)" }}>bez DPH {zformatCena(bezDPH(cena))}</div>
                        </div>
                      )}

                      {/* Stav fakturace — pouze informativní, nelze měnit kliknutím */}
                      <span style={{
                        flexShrink: 0, padding: "4px 9px", borderRadius: 20,
                        border: "1.5px solid", fontSize: 11, fontWeight: 600,
                        borderColor: z.fakturovano ? "#10b981" : "var(--line)",
                        background:  z.fakturovano ? "rgba(16,185,129,.1)" : "white",
                        color:       z.fakturovano ? "#10b981" : "var(--muted)",
                      }} title={z.sf_faktura_no ?? undefined}>
                        {z.fakturovano ? `✓ ${z.sf_faktura_no ?? "Vyfakt."}` : "Nevyfakt."}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
