"use client"

import { useState, useEffect } from "react"
import {
  SMS_TYPY, SMS_NAZVY, SMS_IKONY, SMS_PROMENNE, SMS_PREVIEW_VARS, SMS_FALLBACK,
  renderTemplate, SmsTyp,
} from "@/lib/sms-templates"

interface Sablona {
  typ:        SmsTyp
  nazev:      string
  text:       string
  fallback:   string
  is_custom:  boolean
  updated_at: string | null
}

export default function SablonaEditor() {
  const [sablony, setSablony]   = useState<Sablona[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<SmsTyp | null>(null)
  const [edited, setEdited]     = useState<Partial<Record<SmsTyp, string>>>({})

  async function load() {
    setLoading(true)
    const res  = await fetch("/api/pujcovna/sms-sablony")
    const json = await res.json()
    if (json.ok) setSablony(json.sablony)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save(typ: SmsTyp) {
    const text = edited[typ] ?? sablony.find(s => s.typ === typ)?.text ?? ""
    setSaving(typ)
    try {
      const res  = await fetch("/api/pujcovna/sms-sablony", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ typ, text }),
      })
      const json = await res.json()
      if (json.ok) {
        setEdited(e => { const n = { ...e }; delete n[typ]; return n })
        await load()
      } else {
        alert("Chyba: " + json.error)
      }
    } finally {
      setSaving(null)
    }
  }

  async function reset(typ: SmsTyp) {
    if (!confirm("Obnovit výchozí text šablony?")) return
    setSaving(typ)
    try {
      const text = SMS_FALLBACK[typ]
      const res  = await fetch("/api/pujcovna/sms-sablony", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ typ, text }),
      })
      const json = await res.json()
      if (json.ok) {
        setEdited(e => { const n = { ...e }; delete n[typ]; return n })
        await load()
      }
    } finally {
      setSaving(null)
    }
  }

  function insertVar(typ: SmsTyp, variable: string) {
    const current = edited[typ] ?? sablony.find(s => s.typ === typ)?.text ?? ""
    setEdited(e => ({ ...e, [typ]: current + variable }))
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--ink-2)", fontSize: 14 }}>
        Načítám šablony…
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {SMS_TYPY.map(typ => {
        const sablona    = sablony.find(s => s.typ === typ)
        const currentText = edited[typ] ?? sablona?.text ?? SMS_FALLBACK[typ]
        const hasChanges  = edited[typ] !== undefined && edited[typ] !== sablona?.text
        const charCount   = currentText.length
        const charColor   = charCount > 160 ? "#dc2626" : charCount > 140 ? "#f59e0b" : "#6b7280"
        const preview     = renderTemplate(currentText, SMS_PREVIEW_VARS[typ])
        const isSaving    = saving === typ

        return (
          <div key={typ} style={{
            background: "white",
            borderRadius: 14,
            border: `1px solid ${hasChanges ? "#f59e0b" : "var(--line)"}`,
            overflow: "hidden",
            transition: "border-color .2s",
          }}>
            {/* Hlavička */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px",
              background: "#fafaf9",
              borderBottom: "1px solid var(--line)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{SMS_IKONY[typ]}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>
                    {SMS_NAZVY[typ]}
                  </div>
                  {sablona?.updated_at && (
                    <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 1 }}>
                      Upraveno: {new Date(sablona.updated_at).toLocaleString("cs-CZ", {
                        day: "numeric", month: "numeric", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {hasChanges && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px",
                    borderRadius: 6, background: "rgba(245,158,11,.12)", color: "#b45309",
                  }}>
                    ● Neuloženo
                  </span>
                )}
                {sablona?.is_custom && !hasChanges && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px",
                    borderRadius: 6, background: "rgba(99,102,241,.1)", color: "#4f46e5",
                  }}>
                    Vlastní
                  </span>
                )}
              </div>
            </div>

            <div style={{ padding: "16px 20px" }}>
              {/* Proměnné */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                  Dostupné proměnné — kliknutím vložíte
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {SMS_PROMENNE[typ].map(v => (
                    <button
                      key={v}
                      onClick={() => insertVar(typ, v)}
                      style={{
                        padding: "3px 9px", borderRadius: 6, border: "1px solid #e5e7eb",
                        background: "#f9fafb", fontSize: 12, fontFamily: "monospace",
                        color: "#4f46e5", cursor: "pointer",
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <textarea
                value={currentText}
                onChange={e => setEdited(ed => ({ ...ed, [typ]: e.target.value }))}
                rows={4}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "10px 12px", borderRadius: 9,
                  border: `1px solid ${hasChanges ? "#f59e0b" : "var(--line)"}`,
                  fontSize: 13.5, lineHeight: 1.6,
                  color: "var(--ink)", resize: "vertical", outline: "none",
                  fontFamily: "system-ui, sans-serif",
                  transition: "border-color .2s",
                }}
              />

              {/* Počítadlo znaků */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <div style={{ fontSize: 11.5, color: charColor, fontWeight: charCount > 140 ? 600 : 400 }}>
                  {charCount} znaků
                  {charCount > 160 && " — bude odeslána jako 2 SMS!"}
                  {charCount > 140 && charCount <= 160 && " — blízko limitu 160"}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  1 SMS = max 160 znaků
                </div>
              </div>

              {/* Náhled */}
              <div style={{
                marginTop: 12,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 9,
                padding: "10px 14px",
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#166534", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  Náhled s ukázkovými daty
                </div>
                <div style={{ fontSize: 13, color: "#15803d", lineHeight: 1.6 }}>
                  {preview}
                </div>
              </div>

              {/* Tlačítka */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                <button
                  onClick={() => reset(typ)}
                  disabled={isSaving}
                  style={{
                    padding: "7px 14px", borderRadius: 8,
                    border: "1px solid var(--line)", background: "white",
                    fontSize: 13, color: "var(--ink-2)", cursor: "pointer",
                  }}
                >
                  ↺ Výchozí
                </button>
                <button
                  onClick={() => save(typ)}
                  disabled={isSaving || !hasChanges}
                  style={{
                    padding: "7px 18px", borderRadius: 8, border: "none",
                    background: hasChanges && !isSaving ? "#4f46e5" : "#e5e7eb",
                    color:      hasChanges && !isSaving ? "white" : "#9ca3af",
                    fontSize: 13, fontWeight: 600, cursor: hasChanges ? "pointer" : "default",
                    transition: "all .15s",
                  }}
                >
                  {isSaving ? "Ukládám…" : "💾 Uložit"}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
