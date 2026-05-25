"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import AppShell, { AppModule } from "@/components/AppShell"
import { createClient } from "@/lib/supabase-browser"
import SablonaEditor from "./SablonaEditor"

type Email = {
  id: number
  created_at: string
  sluzba: string
  typ: string
  to_email: string
  to_name: string | null
  subject: string
  html: string
  status: string
  kanal: string | null   // "email" | "sms" | null (starší záznamy)
}

const SLUZBA_LABEL: Record<string, string> = {
  stany: "Autostany",
  svatby: "Svatby",
  george: "George",
}

const SLUZBA_COLOR: Record<string, { bg: string; text: string }> = {
  stany:  { bg: "rgba(16,185,129,.12)",  text: "#059669" },
  svatby: { bg: "rgba(225,29,72,.1)",    text: "#e11d48" },
  george: { bg: "rgba(99,102,241,.12)",  text: "#6366f1" },
}

const TYP_LABEL: Record<string, string> = {
  "rezervace-pujcovna":   "Rezervace",
  "rezervace-notifikace": "Rezervace (notif.)",
  "storno-pujcovna":      "Storno",
  "zmena-logistiky":      "Změna logistiky",
  "platba-reminder":      "Upomínka platby",
  "schuzka-zadost":       "Schůzka žádost",
  "schuzka-potvrzeni":    "Schůzka potvrzení",
  "schuzka-notifikace":   "Schůzka (notif.)",
  // SMS
  "sms-rezervace":        "SMS: Rezervace",
  "sms-upominka":         "SMS: Upomínka",
  "sms-platba":           "SMS: Platba přijata",
  "sms-logistika":        "SMS: Změna logistiky",
}

function formatDatumCas(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function KomunikaceInner() {
  const searchParams = useSearchParams()
  const from = (searchParams.get("from") ?? "wed") as AppModule

  const [view, setView]         = useState<"zpravy" | "sablony">("zpravy")
  const [emails, setEmails]     = useState<Email[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState("vse")
  const [search, setSearch]     = useState("")
  const [preview, setPreview]   = useState<Email | null>(null)
  const [resending, setResending] = useState<number | null>(null)

  const supabase = createClient()

  async function loadEmails() {
    setLoading(true)
    const { data } = await supabase
      .from("komunikace_emaily")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
    setEmails(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadEmails() }, [])

  async function resend(email: Email) {
    setResending(email.id)
    try {
      const res  = await fetch("/api/mail/resend", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: email.id }),
      })
      const json = await res.json()
      if (json.ok) {
        await loadEmails()
      } else {
        alert("Chyba při odesílání: " + json.error)
      }
    } finally {
      setResending(null)
    }
  }

  const filtered = emails
    .filter(e => {
      if (filter === "vse") return true
      if (filter === "upominky") return e.typ === "platba-reminder" || e.typ === "sms-upominka"
      if (filter === "sms") return e.kanal === "sms"
      return e.sluzba === filter
    })
    .filter(e => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        e.to_email.toLowerCase().includes(q) ||
        (e.to_name ?? "").toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q)
      )
    })

  const counts: Record<string, number> = { vse: emails.length }
  for (const e of emails) {
    counts[e.sluzba] = (counts[e.sluzba] ?? 0) + 1
    if (e.typ === "platba-reminder" || e.typ === "sms-upominka") counts["upominky"] = (counts["upominky"] ?? 0) + 1
    if (e.kanal === "sms") counts["sms"] = (counts["sms"] ?? 0) + 1
  }

  return (
    <AppShell module={from}>
      <div style={{ padding: "28px 32px" }}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>
              Komunikace
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink-2)" }}>
              {view === "sablony" ? "Šablony SMS zpráv — editujte texty odesílané zákazníkům" : "Historie odeslaných e-mailů napříč všemi projekty"}
            </p>
          </div>
          {/* Přepínač zobrazení */}
          <div style={{ display: "flex", background: "var(--bg-2, #f3f4f6)", borderRadius: 10, padding: 3, flexShrink: 0 }}>
            {([["zpravy", "📬 Zprávy"], ["sablony", "📝 Šablony SMS"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                style={{
                  padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: view === v ? 600 : 400,
                  background: view === v ? "white" : "transparent",
                  color: view === v ? "var(--ink)" : "var(--ink-2)",
                  boxShadow: view === v ? "0 1px 3px rgba(0,0,0,.1)" : "none",
                  transition: "all .15s",
                }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Šablony SMS */}
        {view === "sablony" && <SablonaEditor />}

        {/* Controls + Table (only in zpravy view) */}
        {view === "zpravy" && (<>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, background: "var(--bg-2, #f3f4f6)", borderRadius: 10, padding: 3 }}>
            {[
              { key: "vse",      label: "Vše" },
              { key: "stany",    label: "Autostany" },
              { key: "svatby",   label: "Svatby" },
              { key: "george",   label: "George" },
              { key: "upominky", label: "⏰ Upomínky" },
              { key: "sms",      label: "💬 SMS" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{
                  padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: filter === f.key ? 600 : 400,
                  background: filter === f.key ? "white" : "transparent",
                  color: filter === f.key ? "var(--ink)" : "var(--ink-2)",
                  boxShadow: filter === f.key ? "0 1px 3px rgba(0,0,0,.1)" : "none",
                  transition: "all .15s",
                }}>
                {f.label}
                {counts[f.key] != null && (
                  <span style={{ marginLeft: 5, fontSize: 11, color: filter === f.key ? "var(--ink-2)" : "#9ca3af" }}>
                    {counts[f.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Hledat e-mail, jméno, předmět…"
            style={{
              flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 9,
              border: "1px solid var(--line)", fontSize: 13.5,
              color: "var(--ink)", background: "white", outline: "none",
            }}
          />

          <button onClick={loadEmails}
            style={{
              padding: "8px 14px", borderRadius: 9, border: "1px solid var(--line)",
              background: "white", fontSize: 13, color: "var(--ink-2)", cursor: "pointer",
            }}>
            ↺ Obnovit
          </button>
        </div>

        {/* Table */}
        <div style={{ background: "white", borderRadius: 14, border: "1px solid var(--line)", overflow: "hidden", overflowX: "auto" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-2)", fontSize: 14 }}>
              Načítám…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-2)", fontSize: 14 }}>
              Žádné e-maily
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafaf9", borderBottom: "1px solid var(--line)" }}>
                  {["Datum a čas", "Kanál", "Projekt", "Typ", "Příjemce", "Předmět", ""].map((h, i) => (
                    <th key={i} style={{
                      padding: "10px 12px", textAlign: "left",
                      fontSize: 11, fontWeight: 600, letterSpacing: ".07em",
                      textTransform: "uppercase", color: "#9ca3af",
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((email, i) => {
                  const isSms = email.kanal === "sms"
                  const sc   = SLUZBA_COLOR[email.sluzba] ?? { bg: "#f3f4f6", text: "#6b7280" }
                  return (
                    <tr key={email.id}
                      style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--line)" : "none" }}
                      onMouseOver={e => (e.currentTarget.style.background = "#fafaf9")}
                      onMouseOut={e => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Datum */}
                      <td style={{ padding: "11px 12px", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                        {formatDatumCas(email.created_at)}
                      </td>

                      {/* Kanál — nový sloupec */}
                      <td style={{ padding: "11px 12px", whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                          background: email.status === "error" ? "rgba(239,68,68,.1)"
                                    : isSms ? "rgba(99,102,241,.1)" : "rgba(16,185,129,.1)",
                          color:      email.status === "error" ? "#dc2626"
                                    : isSms ? "#4f46e5"            : "#059669",
                        }}>
                          {email.status === "error" ? "❌ Chyba" : isSms ? "💬 SMS" : "✉️ Email"}
                        </span>
                      </td>

                      {/* Projekt */}
                      <td style={{ padding: "11px 12px" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 6,
                          fontSize: 11.5, fontWeight: 600,
                          background: sc.bg, color: sc.text,
                        }}>
                          {SLUZBA_LABEL[email.sluzba] ?? email.sluzba}
                        </span>
                      </td>

                      {/* Typ */}
                      <td style={{ padding: "11px 12px", fontSize: 12.5, color: "#374151", whiteSpace: "nowrap" }}>
                        {TYP_LABEL[email.typ] ?? email.typ}
                      </td>

                      {/* Příjemce */}
                      <td style={{ padding: "11px 12px" }}>
                        {email.to_name && (
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                            {email.to_name}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {isSms ? "📱 " : ""}{email.to_email}
                        </div>
                      </td>

                      {/* Předmět / text SMS */}
                      <td style={{ padding: "11px 12px", fontSize: 13, color: "var(--ink)", maxWidth: 300 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {email.subject}
                        </div>
                      </td>

                      {/* Akce */}
                      <td style={{ padding: "11px 12px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => setPreview(email)}
                            style={{
                              padding: "5px 11px", borderRadius: 7,
                              border: "1px solid var(--line)", background: "white",
                              fontSize: 12, color: "var(--ink-2)", cursor: "pointer",
                            }}>
                            Náhled
                          </button>
                          {!isSms && (
                            <button
                              onClick={() => resend(email)}
                              disabled={resending === email.id}
                              style={{
                                padding: "5px 11px", borderRadius: 7,
                                border: "none",
                                background: resending === email.id ? "#e5e7eb" : "#111827",
                                fontSize: 12, color: resending === email.id ? "#9ca3af" : "white",
                                cursor: resending === email.id ? "default" : "pointer",
                                fontWeight: 500,
                              }}>
                              {resending === email.id ? "Odesílám…" : "↺ Znovu"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        </>)}

      </div>

      {/* Preview modal */}
      {preview && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(0,0,0,.45)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 24,
          }}
          onClick={() => setPreview(null)}
        >
          <div
            style={{
              background: "white", borderRadius: 16, width: "100%", maxWidth: 640,
              maxHeight: "90vh", display: "flex", flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              padding: "16px 20px", borderBottom: "1px solid var(--line)",
              display: "flex", alignItems: "flex-start", gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 2 }}>
                  {preview.subject}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {preview.to_name ? `${preview.to_name} <${preview.to_email}>` : preview.to_email}
                  {" · "}
                  {formatDatumCas(preview.created_at)}
                </div>
              </div>
              <button onClick={() => setPreview(null)}
                style={{
                  width: 28, height: 28, borderRadius: 8, border: "1px solid var(--line)",
                  background: "white", cursor: "pointer", display: "grid", placeItems: "center",
                  fontSize: 16, color: "var(--ink-2)", flexShrink: 0,
                }}>×</button>
            </div>

            {/* Preview — iframe pro email, plain text pro SMS */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {preview.kanal === "sms" ? (
                <div style={{ padding: "28px 32px" }}>
                  <div style={{
                    background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12,
                    padding: "16px 20px", fontSize: 15, color: "#111827", lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}>
                    💬 {preview.subject}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: "#9ca3af" }}>
                    Odesláno na: {preview.to_email}
                  </div>
                </div>
              ) : (
                <iframe
                  srcDoc={preview.html}
                  sandbox="allow-same-origin"
                  style={{ width: "100%", height: "100%", minHeight: 500, border: "none" }}
                  title="Náhled e-mailu"
                />
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              padding: "12px 20px", borderTop: "1px solid var(--line)",
              display: "flex", justifyContent: "flex-end", gap: 8,
            }}>
              <button onClick={() => setPreview(null)}
                style={{
                  padding: "7px 16px", borderRadius: 8, border: "1px solid var(--line)",
                  background: "white", fontSize: 13, color: "var(--ink-2)", cursor: "pointer",
                }}>
                Zavřít
              </button>
              {preview.kanal !== "sms" && (
                <button
                  onClick={() => { resend(preview); setPreview(null) }}
                  disabled={resending === preview.id}
                  style={{
                    padding: "7px 16px", borderRadius: 8, border: "none",
                    background: "#111827", fontSize: 13, color: "white",
                    cursor: "pointer", fontWeight: 500,
                  }}>
                  ↺ Odeslat znovu
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default function KomunikacePage() {
  return (
    <Suspense>
      <KomunikaceInner />
    </Suspense>
  )
}
