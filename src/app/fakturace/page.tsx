"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import AppShell, { AppModule } from "@/components/AppShell"

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
  zakaznici: { jmeno: string; prijmeni: string; firma: string | null } | null
}

type StanyFaktura = {
  id: number
  created_at: string
  invoice_no: string
  pdf_url: string | null
  castka: number | null
  vs: string | null
  pujcovna_rezervace: { customer: string } | null
}

type RadekFaktury =
  | { zdroj: "gs";    data: GSFaktura }
  | { zdroj: "stany"; data: StanyFaktura }

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
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
  const [stanyData, setStanyData] = useState<StanyFaktura[]>([])
  const [loading,   setLoading]   = useState(true)
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [stornoId,  setStornoId]  = useState<number | null>(null)
  const [actionMsg, setActionMsg] = useState<{ key: string; ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const [{ data: gs }, { data: stany }] = await Promise.all([
      supabase.from("george_faktury")
        .select("*, zakaznici(jmeno, prijmeni, firma)")
        .order("created_at", { ascending: false }),
      supabase.from("pujcovna_rezervace_historie")
        .select("id, created_at, invoice_no, pdf_url, castka, vs, pujcovna_rezervace(customer)")
        .not("invoice_no", "is", null)
        .order("created_at", { ascending: false }),
    ])
    setGsData((gs ?? []) as GSFaktura[])
    setStanyData((stany ?? []) as unknown as StanyFaktura[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Sloučený seznam seřazený dle data sestupně
  const rows: RadekFaktury[] = [
    ...gsData.map(d => ({ zdroj: "gs" as const, data: d })),
    ...stanyData.map(d => ({ zdroj: "stany" as const, data: d })),
  ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime())

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

  return (
    <AppShell module={from}>
      <div style={{ padding: "24px 24px 48px", maxWidth: 1040, margin: "0 auto" }}>

        {/* Nadpis */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Fakturace</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>Vystavené faktury napříč všemi projekty</p>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "var(--muted)", fontSize: 14 }}>
            Zatím žádné faktury.
          </div>
        ) : (
          <div style={{ background: "white", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-1)", border: "1px solid var(--line)", overflow: "hidden" }}>
            {/* Tabulka header */}
            <div style={{
              display: "grid", gridTemplateColumns: "110px 1fr 130px 110px 80px auto",
              padding: "9px 16px", borderBottom: "1px solid var(--line)",
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)",
              gap: 8,
            }}>
              <span>Datum</span>
              <span>Zákazník</span>
              <span>Č. faktury</span>
              <span>Celkem s DPH</span>
              <span>Projekt</span>
              <span>Akce</span>
            </div>

            {rows.map((row, i) => {
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
                    <div style={{
                      display: "grid", gridTemplateColumns: "110px 1fr 130px 110px 80px auto",
                      padding: "11px 16px", alignItems: "center", gap: 8,
                      borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none",
                      background: busy ? "rgba(0,0,0,.02)" : "white",
                    }}>
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
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#6366f1" }}>{f.sf_no}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                        {f.celkem_sdph != null ? f.celkem_sdph.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč" : "—"}
                      </div>
                      <div>
                        <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(99,102,241,.1)", color: "#6366f1" }}>GS</span>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        {f.pdf_url && (
                          <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" style={{
                            padding: "4px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                            border: "1px solid var(--line)", background: "white", color: "var(--ink)", textDecoration: "none",
                          }}>PDF</a>
                        )}
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
                      </div>
                    </div>
                  </div>
                )
              } else {
                const f   = row.data
                const key = `stany-${f.id}`
                const zak = (f.pujcovna_rezervace as { customer?: string } | null)?.customer ?? "—"
                return (
                  <div key={key} style={{
                    display: "grid", gridTemplateColumns: "110px 1fr 130px 110px 80px auto",
                    padding: "11px 16px", alignItems: "center", gap: 8,
                    borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none",
                  }}>
                    <div style={{ fontSize: 12.5, color: "var(--ink)" }}>{formatDate(f.created_at)}</div>
                    <div style={{ fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {zak}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#2dd4a6" }}>{f.invoice_no}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                      {f.castka != null ? f.castka.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč" : "—"}
                    </div>
                    <div>
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(45,212,166,.12)", color: "#059669" }}>Stany</span>
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {f.pdf_url && (
                        <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" style={{
                          padding: "4px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                          border: "1px solid var(--line)", background: "white", color: "var(--ink)", textDecoration: "none",
                        }}>PDF</a>
                      )}
                    </div>
                  </div>
                )
              }
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
