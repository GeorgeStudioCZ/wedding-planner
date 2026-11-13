"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import AppShell, { AppModule } from "@/components/AppShell"

// Stránka zobrazuje jen doklady vystavené přes CRM (ne vše, co je v SuperFaktuře):
//  - George Studio: tabulka george_faktury
//  - Půjčovna: tabulka faktury (zálohy, faktury, dobropisy)
//  - Svatby: tabulka svatby_faktury

// ── Typy ─────────────────────────────────────────────────────────────────────

type GSFaktura = {
  id: number
  sf_id: number
  sf_no: string
  zakaznik_id: number | null
  pdf_url: string | null
  celkem_sdph: number | null
  created_at: string
  odeslano: boolean
  odeslano_at: string | null
  sf_legacy?: boolean | null
  zakaznici: { jmeno: string; prijmeni: string; firma: string | null } | null
}

// Doklady půjčovny a svateb (z /api/fakturace)
type Doklad = {
  key: string
  modul: "pujcovna" | "svatby"
  typ: "zaloha" | "faktura" | "dobropis"
  datum: string
  zakaznik: string
  cislo: string | null
  vs: string | null
  castka: number | null
  pdf_url: string | null
  stara_firma: boolean
  zaplaceno: boolean | null
  odkaz: string | null
}

type Modul = "gs" | "pujcovna" | "svatby"
type Typ   = "zaloha" | "faktura" | "dobropis"

type Radek =
  | { zdroj: "gs";     modul: "gs";  typ: "faktura"; datum: string; stara: boolean; data: GSFaktura }
  | { zdroj: "doklad"; modul: Modul; typ: Typ;       datum: string; stara: boolean; data: Doklad }

const TYP_LABEL: Record<Typ, string> = { zaloha: "Záloha", faktura: "Faktura", dobropis: "Dobropis" }
const MODUL_STYL: Record<Modul, { label: string; bg: string; fg: string }> = {
  gs:       { label: "GS",     bg: "rgba(99,102,241,.1)",  fg: "#6366f1" },
  pujcovna: { label: "Stany",  bg: "rgba(45,212,166,.12)", fg: "#059669" },
  svatby:   { label: "Svatby", bg: "rgba(244,63,94,.1)",   fg: "#e11d48" },
}
const GRID = "100px minmax(0,1fr) 130px 84px 100px 70px auto"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
function formatKc(c: number | null) {
  return c != null ? c.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč" : "—"
}

// ── Page wrapper (Suspense kvůli useSearchParams) ─────────────────────────────

export default function FakturacePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, fontFamily: "system-ui", color: "#555" }}>Načítám…</div>}>
      <FakturaPageInner />
    </Suspense>
  )
}

function FakturaPageInner() {
  const params = useSearchParams()
  const from   = (params.get("from") ?? "studio") as AppModule

  const [gsData,    setGsData]    = useState<GSFaktura[]>([])
  const [doklady,   setDoklady]   = useState<Doklad[]>([])
  const [loading,   setLoading]   = useState(true)
  const [chyba,     setChyba]     = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [stornoId,  setStornoId]  = useState<number | null>(null)
  const [actionMsg, setActionMsg] = useState<{ key: string; ok: boolean; text: string } | null>(null)

  // Filtry
  const [fModul, setFModul] = useState<Modul | "vse">("vse")
  const [fTyp,   setFTyp]   = useState<Typ | "vse">("vse")
  const [skrytStare, setSkrytStare] = useState(false)

  const load = useCallback(async () => {
    const [{ data: gs, error: gsErr }, dokRes] = await Promise.all([
      supabase.from("george_faktury").select("*").order("created_at", { ascending: false }),
      fetch("/api/fakturace").then(r => r.json()).catch(() => ({ ok: false, error: "Nepodařilo se načíst doklady" })),
    ])
    const chyby: string[] = []
    if (gsErr) chyby.push(`George Studio: ${gsErr.message}`)
    if (!dokRes.ok) chyby.push(`Půjčovna a svatby: ${dokRes.error ?? "chyba načtení"}`)
    setChyba(chyby.length ? chyby.join(" · ") : null)

    // Zákazníky načteme zvlášť — nezávisí na FK constraint
    const zakIds = [...new Set((gs ?? []).map(f => f.zakaznik_id).filter(Boolean))]
    const { data: zaksList } = zakIds.length
      ? await supabase.from("zakaznici").select("id, jmeno, prijmeni, firma").in("id", zakIds)
      : { data: [] }
    const zakMap = Object.fromEntries((zaksList ?? []).map(z => [z.id, z]))
    setGsData((gs ?? []).map(f => ({
      ...f,
      zakaznici: f.zakaznik_id ? (zakMap[f.zakaznik_id] ?? null) : null,
    })) as GSFaktura[])
    setDoklady((dokRes.doklady ?? []) as Doklad[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Sloučený seznam seřazený dle data sestupně
  const vsechny: Radek[] = [
    ...gsData.map(d => ({ zdroj: "gs" as const, modul: "gs" as const, typ: "faktura" as const, datum: d.created_at, stara: !!d.sf_legacy, data: d })),
    ...doklady.map(d => ({ zdroj: "doklad" as const, modul: d.modul as Modul, typ: d.typ, datum: d.datum, stara: d.stara_firma, data: d })),
  ].sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())

  const rows = vsechny.filter(r =>
    (fModul === "vse" || r.modul === fModul) &&
    (fTyp === "vse" || r.typ === fTyp) &&
    (!skrytStare || !r.stara)
  )
  const pocetStarych = vsechny.filter(r => r.stara).length

  async function odeslat(f: GSFaktura) {
    const key = `gs-${f.sf_id}`
    setSendingId(f.sf_id); setActionMsg(null)
    try {
      const res  = await fetch("/api/george/odeslat-fakturu", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sfId: f.sf_id }),
      })
      const json = await res.json() as { ok: boolean; email?: string; error?: string }
      if (!json.ok) throw new Error(json.error ?? "Chyba při odesílání")
      setGsData(prev => prev.map(x => x.sf_id === f.sf_id
        ? { ...x, odeslano: true, odeslano_at: new Date().toISOString() } : x))
      setActionMsg({ key, ok: true, text: `Odesláno na ${json.email}` })
    } catch (e) {
      setActionMsg({ key, ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    setSendingId(null)
  }

  async function storno(f: GSFaktura) {
    if (!confirm(`Opravdu zrušit fakturu ${f.sf_no} v SuperFaktura a vrátit záznamy na nevyfakturované?`)) return
    const key = `gs-${f.sf_id}`
    setStornoId(f.sf_id); setActionMsg(null)
    try {
      const res  = await fetch("/api/george/zrus-fakturu", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sfId: f.sf_id }),
      })
      const json = await res.json() as { ok: boolean; error?: string }
      if (!json.ok) throw new Error(json.error ?? "Chyba při rušení faktury")
      setGsData(prev => prev.filter(x => x.sf_id !== f.sf_id))
    } catch (e) {
      setActionMsg({ key, ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    setStornoId(null)
  }

  const gsZakName = (f: GSFaktura) =>
    f.zakaznici?.firma?.trim() ||
    `${f.zakaznici?.jmeno ?? ""} ${f.zakaznici?.prijmeni ?? ""}`.trim() || "—"

  if (loading) return (
    <AppShell module={from}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
        <span style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</span>
      </div>
    </AppShell>
  )

  const selStyle: React.CSSProperties = {
    padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--line)",
    fontSize: 12.5, color: "var(--ink)", background: "white", fontFamily: "inherit",
  }
  const pdfStyle: React.CSSProperties = {
    padding: "4px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
    border: "1px solid var(--line)", background: "white", color: "var(--ink)", textDecoration: "none",
  }
  const stitek = (text: string, bg: string, fg: string) => (
    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color: fg, whiteSpace: "nowrap" }}>{text}</span>
  )

  return (
    <AppShell module={from}>
      <div style={{ padding: "24px 24px 48px", maxWidth: 1100, margin: "0 auto" }}>

        {/* Nadpis */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Fakturace</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>
            Zálohy, faktury a dobropisy vystavené přes CRM napříč všemi projekty
          </p>
        </div>

        {chyba && (
          <div style={{ marginBottom: 12, padding: "9px 14px", borderRadius: "var(--radius-md)", background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13 }}>
            ⚠ Část dokladů se nepodařilo načíst — {chyba}
          </div>
        )}

        {/* Filtry */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <select value={fModul} onChange={e => setFModul(e.target.value as Modul | "vse")} style={selStyle}>
            <option value="vse">Všechny projekty</option>
            <option value="gs">George Studio</option>
            <option value="pujcovna">Půjčovna (Stany)</option>
            <option value="svatby">Svatby</option>
          </select>
          <select value={fTyp} onChange={e => setFTyp(e.target.value as Typ | "vse")} style={selStyle}>
            <option value="vse">Všechny doklady</option>
            <option value="zaloha">Zálohy</option>
            <option value="faktura">Faktury</option>
            <option value="dobropis">Dobropisy</option>
          </select>
          {pocetStarych > 0 && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink)", cursor: "pointer" }}>
              <input type="checkbox" checked={skrytStare} onChange={e => setSkrytStare(e.target.checked)} />
              Skrýt doklady staré firmy ({pocetStarych})
            </label>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--muted)" }}>
            {rows.length} z {vsechny.length} dokladů
          </span>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "var(--muted)", fontSize: 14 }}>
            {vsechny.length === 0 ? "Zatím žádné doklady." : "Filtru neodpovídá žádný doklad."}
          </div>
        ) : (
          <div style={{ background: "white", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-1)", border: "1px solid var(--line)", overflowX: "auto" }}>
            <div style={{ minWidth: 760 }}>
              {/* Tabulka header */}
              <div style={{
                display: "grid", gridTemplateColumns: GRID,
                padding: "9px 16px", borderBottom: "1px solid var(--line)",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)",
                gap: 8,
              }}>
                <span>Datum</span>
                <span>Zákazník</span>
                <span>Č. dokladu</span>
                <span>Typ</span>
                <span>Celkem</span>
                <span>Projekt</span>
                <span>Akce</span>
              </div>

              {rows.map((row, i) => {
                const ms = MODUL_STYL[row.modul]
                const radekStyle: React.CSSProperties = {
                  display: "grid", gridTemplateColumns: GRID,
                  padding: "11px 16px", alignItems: "center", gap: 8,
                  borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none",
                }

                if (row.zdroj === "gs") {
                  const f   = row.data
                  const key = `gs-${f.sf_id}`
                  const busy = sendingId === f.sf_id || stornoId === f.sf_id
                  return (
                    <div key={key}>
                      {actionMsg?.key === key && (
                        <div style={{
                          padding: "7px 16px", fontSize: 12, fontWeight: 500,
                          background: actionMsg.ok ? "#f0fdf4" : "#fef2f2",
                          color: actionMsg.ok ? "#15803d" : "#dc2626",
                          borderBottom: "1px solid var(--line)",
                        }}>
                          {actionMsg.ok ? "✓ " : "⚠ "}{actionMsg.text}
                        </div>
                      )}
                      <div style={{ ...radekStyle, background: busy ? "rgba(0,0,0,.02)" : "white" }}>
                        <div>
                          <div style={{ fontSize: 12.5, color: "var(--ink)" }}>{formatDate(f.created_at)}</div>
                          {f.odeslano && f.odeslano_at
                            ? <div style={{ fontSize: 10.5, color: "#10b981", marginTop: 1 }}>✓ Odesláno {formatDateTime(f.odeslano_at)}</div>
                            : <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>Neodesláno</div>
                          }
                        </div>
                        <div style={{ fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {gsZakName(f)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: ms.fg }}>{f.sf_no}</div>
                          {row.stara && <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>stará firma</div>}
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--ink)" }}>{TYP_LABEL.faktura}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                          {formatKc(f.celkem_sdph)}
                        </div>
                        <div>{stitek(ms.label, ms.bg, ms.fg)}</div>
                        <div style={{ display: "flex", gap: 5 }}>
                          {f.pdf_url && <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" style={pdfStyle}>PDF</a>}
                          {!row.stara && (
                            <>
                              <button onClick={() => odeslat(f)} disabled={busy} style={{
                                padding: "4px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer",
                                border: "1px solid", borderColor: f.odeslano ? "#10b981" : "#6366f1",
                                background: f.odeslano ? "rgba(16,185,129,.08)" : "rgba(99,102,241,.08)",
                                color: f.odeslano ? "#059669" : "#6366f1",
                                opacity: sendingId === f.sf_id ? .5 : 1,
                              }}>
                                {sendingId === f.sf_id ? "…" : f.odeslano ? "Znovu" : "Odeslat"}
                              </button>
                              <button onClick={() => storno(f)} disabled={busy} style={{
                                padding: "4px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer",
                                border: "1px solid #fca5a5", background: "white", color: "#dc2626",
                                opacity: stornoId === f.sf_id ? .5 : 1,
                              }}>
                                {stornoId === f.sf_id ? "…" : "Storno"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }

                const d = row.data
                return (
                  <div key={d.key} style={radekStyle}>
                    <div>
                      <div style={{ fontSize: 12.5, color: "var(--ink)" }}>{formatDate(d.datum)}</div>
                      {d.zaplaceno != null && (
                        <div style={{ fontSize: 10.5, marginTop: 1, color: d.zaplaceno ? "#10b981" : "#b45309" }}>
                          {d.zaplaceno ? "✓ Zaplaceno" : "Nezaplaceno"}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.odkaz
                        ? <Link href={d.odkaz} style={{ color: "var(--ink)", textDecoration: "underline", textDecorationColor: "var(--line)" }}>{d.zakaznik}</Link>
                        : d.zakaznik}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: ms.fg }}>
                        {d.cislo ?? (d.vs ? `VS ${d.vs}` : "—")}
                      </div>
                      {d.stara_firma && <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>stará firma</div>}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--ink)" }}>{TYP_LABEL[d.typ]}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                      {formatKc(d.castka)}
                    </div>
                    <div>{stitek(ms.label, ms.bg, ms.fg)}</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {d.pdf_url && <a href={d.pdf_url} target="_blank" rel="noopener noreferrer" style={pdfStyle}>PDF</a>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
