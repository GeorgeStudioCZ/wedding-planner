"use client"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import AppShell from "@/components/AppShell"

type Faktura = {
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function FakturacePage() {
  const [faktury,        setFaktury]        = useState<Faktura[]>([])
  const [loading,        setLoading]        = useState(true)
  const [sendingId,      setSendingId]      = useState<number | null>(null)
  const [stornoId,       setStornoId]       = useState<number | null>(null)
  const [actionMsg,      setActionMsg]      = useState<{ id: number; ok: boolean; text: string } | null>(null)

  const loadFaktury = useCallback(async () => {
    const { data } = await supabase
      .from("george_faktury")
      .select("*, zakaznici(jmeno, prijmeni, firma)")
      .order("created_at", { ascending: false })
    setFaktury((data ?? []) as Faktura[])
    setLoading(false)
  }, [])

  useEffect(() => { loadFaktury() }, [loadFaktury])

  async function odeslat(f: Faktura) {
    setSendingId(f.sf_id); setActionMsg(null)
    try {
      const res  = await fetch("/api/george/odeslat-fakturu", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sfId: f.sf_id }),
      })
      const json = await res.json() as { ok: boolean; email?: string; error?: string }
      if (!json.ok) throw new Error(json.error ?? "Chyba při odesílání")
      setFaktury(prev => prev.map(x => x.sf_id === f.sf_id
        ? { ...x, odeslano: true, odeslano_at: new Date().toISOString() }
        : x))
      setActionMsg({ id: f.sf_id, ok: true, text: `Odesláno na ${json.email}` })
    } catch (e) {
      setActionMsg({ id: f.sf_id, ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    setSendingId(null)
  }

  async function storno(f: Faktura) {
    if (!confirm(`Opravdu zrušit fakturu ${f.sf_no} v SuperFaktura a vrátit záznamy na nevyfakturované?`)) return
    setStornoId(f.sf_id); setActionMsg(null)
    try {
      const res  = await fetch("/api/george/zrus-fakturu", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sfId: f.sf_id }),
      })
      const json = await res.json() as { ok: boolean; error?: string }
      if (!json.ok) throw new Error(json.error ?? "Chyba při rušení faktury")
      setFaktury(prev => prev.filter(x => x.sf_id !== f.sf_id))
    } catch (e) {
      setActionMsg({ id: f.sf_id, ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    setStornoId(null)
  }

  const zakName = (f: Faktura) =>
    f.zakaznici?.firma?.trim() ||
    `${f.zakaznici?.jmeno ?? ""} ${f.zakaznici?.prijmeni ?? ""}`.trim() ||
    "—"

  if (loading) return (
    <AppShell module="studio">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
        <span style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</span>
      </div>
    </AppShell>
  )

  return (
    <AppShell module="studio">
      <div style={{ padding: "24px 24px 48px", maxWidth: 960, margin: "0 auto" }}>

        {/* Nadpis */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Fakturace</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>Vystavené faktury George Studio</p>
        </div>

        {faktury.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "var(--muted)", fontSize: 14 }}>
            Zatím žádné faktury — vystavte první v Reportech.
          </div>
        ) : (
          <div style={{ background: "white", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-1)", border: "1px solid var(--line)", overflow: "hidden" }}>
            {/* Hlavička tabulky */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 120px 120px auto",
              padding: "10px 16px", borderBottom: "1px solid var(--line)",
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)",
            }}>
              <span>Datum</span>
              <span>Zákazník</span>
              <span>Č. faktury</span>
              <span>Celkem s DPH</span>
              <span>Akce</span>
            </div>

            {faktury.map((f, i) => (
              <div key={f.id}>
                {/* Chybová / OK zpráva pro tuto fakturu */}
                {actionMsg?.id === f.sf_id && (
                  <div style={{
                    padding: "8px 16px", fontSize: 12, fontWeight: 500,
                    background: actionMsg.ok ? "#f0fdf4" : "#fef2f2",
                    color: actionMsg.ok ? "#15803d" : "#dc2626",
                    borderBottom: "1px solid var(--line)",
                  }}>
                    {actionMsg.ok ? "✓ " : "⚠ "}{actionMsg.text}
                  </div>
                )}

                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 120px 120px auto",
                  padding: "12px 16px", alignItems: "center",
                  borderBottom: i < faktury.length - 1 ? "1px solid var(--line)" : "none",
                  background: stornoId === f.sf_id || sendingId === f.sf_id ? "rgba(0,0,0,.02)" : "white",
                }}>
                  {/* Datum */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{formatDate(f.created_at)}</div>
                    {f.odeslano && f.odeslano_at && (
                      <div style={{ fontSize: 11, color: "#10b981", marginTop: 2 }}>
                        ✓ Odesláno {formatDateTime(f.odeslano_at)}
                      </div>
                    )}
                    {!f.odeslano && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Neodesláno</div>
                    )}
                  </div>

                  {/* Zákazník */}
                  <div style={{ fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
                    {zakName(f)}
                  </div>

                  {/* Číslo faktury */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#6366f1", fontVariantNumeric: "tabular-nums" }}>
                    {f.sf_no}
                  </div>

                  {/* Celkem */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                    {f.celkem_sdph != null ? f.celkem_sdph.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč" : "—"}
                  </div>

                  {/* Akce */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {/* PDF */}
                    {f.pdf_url && (
                      <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" style={{
                        padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                        border: "1px solid var(--line)", background: "white", color: "var(--ink)",
                        textDecoration: "none", display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                        PDF
                      </a>
                    )}

                    {/* Odeslat */}
                    <button
                      onClick={() => odeslat(f)}
                      disabled={sendingId === f.sf_id || stornoId === f.sf_id}
                      title={f.odeslano ? `Znovu odeslat (již odesláno)` : "Odeslat zákazníkovi e-mailem"}
                      style={{
                        padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: "1px solid", transition: "all .12s",
                        borderColor: f.odeslano ? "#10b981" : "#6366f1",
                        background: f.odeslano ? "rgba(16,185,129,.08)" : "rgba(99,102,241,.08)",
                        color: f.odeslano ? "#059669" : "#6366f1",
                        opacity: sendingId === f.sf_id ? .5 : 1,
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      {sendingId === f.sf_id ? "Odesílám…" : f.odeslano ? "Znovu odeslat" : "Odeslat"}
                    </button>

                    {/* Storno */}
                    <button
                      onClick={() => storno(f)}
                      disabled={sendingId === f.sf_id || stornoId === f.sf_id}
                      style={{
                        padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: "1px solid #fca5a5", background: "white", color: "#dc2626",
                        opacity: stornoId === f.sf_id ? .5 : 1,
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
                      {stornoId === f.sf_id ? "Ruším…" : "Storno"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
