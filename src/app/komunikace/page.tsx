"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import AppShell, { AppModule } from "@/components/AppShell"
import { createClient } from "@/lib/supabase-browser"

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
  "schuzka-zadost":       "Schůzka žádost",
  "schuzka-potvrzeni":    "Schůzka potvrzení",
  "schuzka-notifikace":   "Schůzka (notif.)",
}

function formatDatumCas(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function KomunikaceInner() {
  const searchParams = useSearchParams()
  const from = (searchParams.get("from") ?? "wed") as AppModule

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
    .filter(e => filter === "vse" || e.sluzba === filter)
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
  for (const e of emails) counts[e.sluzba] = (counts[e.sluzba] ?? 0) + 1

  return (
    <AppShell module={from}>
      <div style={{ padding: "28px 32px", maxWidth: 1100 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>
            Komunikace
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink-2)" }}>
            Historie odeslaných e-mailů napříč všemi projekty
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, background: "var(--bg-2, #f3f4f6)", borderRadius: 10, padding: 3 }}>
            {[
              { key: "vse",    label: "Vše" },
              { key: "stany",  label: "Autostany" },
              { key: "svatby", label: "Svatby" },
              { key: "george", label: "George" },
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
        <div style={{ background: "white", borderRadius: 14, border: "1px solid var(--line)", overflow: "hidden" }}>
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
                  {["Datum a čas", "Projekt", "Typ", "Příjemce", "Předmět", ""].map((h, i) => (
                    <th key={i} style={{
                      padding: "10px 16px", textAlign: "left",
                      fontSize: 11, fontWeight: 600, letterSpacing: ".07em",
                      textTransform: "uppercase", color: "#9ca3af",
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((email, i) => {
                  const sc = SLUZBA_COLOR[email.sluzba] ?? { bg: "#f3f4f6", text: "#6b7280" }
                  return (
                    <tr key={email.id}
                      style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--line)" : "none" }}
                      onMouseOver={e => (e.currentTarget.style.background = "#fafaf9")}
                      onMouseOut={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "12px 16px", fontSize: 12.5, color: "#6b7280", whiteSpace: "nowrap" }}>
                        {formatDatumCas(email.created_at)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 6,
                          fontSize: 11.5, fontWeight: 600,
                          background: sc.bg, color: sc.text,
                        }}>
                          {SLUZBA_LABEL[email.sluzba] ?? email.sluzba}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12.5, color: "#374151", whiteSpace: "nowrap" }}>
                        {TYP_LABEL[email.typ] ?? email.typ}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {email.to_name && (
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                            {email.to_name}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{email.to_email}</div>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--ink)", maxWidth: 320 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {email.subject}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => setPreview(email)}
                            style={{
                              padding: "5px 11px", borderRadius: 7,
                              border: "1px solid var(--line)", background: "white",
                              fontSize: 12, color: "var(--ink-2)", cursor: "pointer",
                            }}>
                            Náhled
                          </button>
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
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

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

            {/* Iframe preview */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <iframe
                srcDoc={preview.html}
                sandbox="allow-same-origin"
                style={{ width: "100%", height: "100%", minHeight: 500, border: "none" }}
                title="Náhled e-mailu"
              />
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
