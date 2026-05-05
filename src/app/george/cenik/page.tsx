"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import AppShell from "@/components/AppShell"

type Kategorie = {
  id: number
  name: string
  barva: string
  sazba_typ: "hodina" | "kus"
  sazba: number
  sort_order: number
}

// ── Preset colors ─────────────────────────────────────────────────────────────
const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f59e0b", "#10b981", "#0ea5e9", "#64748b",
]

// ── Inline SVG ────────────────────────────────────────────────────────────────
function Ico({ d, size = 16 }: { d: string | string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}
const IC = {
  plus:  ["M12 5v14","M5 12h14"],
  trash: ["M3 6h18","M8 6V4h8v2","M19 6l-1 14H6L5 6"],
  save:  ["M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z","M17 21v-8H7v8","M7 3v5h8"],
  x:     ["M18 6L6 18","M6 6l12 12"],
}

// ── KategorieRadek ─────────────────────────────────────────────────────────────
function KategorieRadek({
  k, onDelete,
}: { k: Kategorie; onDelete: (id: number) => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "12px 16px",
      background: "white",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-1)",
      border: "1px solid var(--line)",
    }}>
      <span style={{ width: 14, height: 14, borderRadius: 99, flexShrink: 0, background: k.barva }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>{k.name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
          {k.sazba_typ === "kus" ? "Za kus" : "Za hodinu"}
        </div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
        {k.sazba.toLocaleString("cs-CZ")} Kč
      </div>
      <button onClick={() => onDelete(k.id)}
        style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, flexShrink: 0 }}>
        <Ico d={IC.trash} size={14} />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CenikPage() {
  const [kategorie, setKategorie] = useState<Kategorie[]>([])
  const [loading, setLoading] = useState(true)

  // new row form
  const [name, setName] = useState("")
  const [barva, setBarva] = useState(COLORS[0])
  const [sazbaTyp, setSazbaTyp] = useState<"hodina" | "kus">("hodina")
  const [sazba, setSazba] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function load() {
    const { data } = await supabase.from("george_kategorie").select("*").order("sort_order")
    setKategorie(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!name.trim()) { setError("Vyplň název kategorie"); return }
    const val = parseFloat(sazba.replace(",", "."))
    if (isNaN(val) || val < 0) { setError("Zadej platnou cenu"); return }
    setError("")
    setSaving(true)
    const db = createClient()
    const { data, error: err } = await db.from("george_kategorie").insert({
      name: name.trim(),
      barva,
      sazba_typ: sazbaTyp,
      sazba: val,
      sort_order: kategorie.length,
    }).select().single()
    setSaving(false)
    if (err || !data) { setError("Chyba při ukládání"); return }
    setKategorie(prev => [...prev, data])
    setName("")
    setSazba("")
  }

  async function handleDelete(id: number) {
    const db = createClient()
    await db.from("george_kategorie").delete().eq("id", id)
    setKategorie(prev => prev.filter(k => k.id !== id))
  }

  return (
    <AppShell module="studio">
      <div style={{ padding: "24px", maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Ceník služeb</h1>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Definuj kategorie a sazby pro automatický výpočet odměny.</p>

        {/* Add form */}
        <div style={{
          background: "white",
          borderRadius: "var(--radius-md)",
          padding: 20,
          boxShadow: "var(--shadow-1)",
          border: "1px solid var(--line)",
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 14 }}>Nová kategorie</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>Název</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
                placeholder="např. Programování"
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "9px 11px", borderRadius: 9,
                  border: "1px solid var(--line-strong)",
                  fontSize: 14, color: "var(--ink)", outline: "none",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>Cena</label>
              <input
                value={sazba}
                onChange={e => setSazba(e.target.value)}
                placeholder="0"
                inputMode="numeric"
                style={{
                  width: 90, padding: "9px 11px", borderRadius: 9,
                  border: "1px solid var(--line-strong)",
                  fontSize: 14, color: "var(--ink)", outline: "none",
                }}
              />
            </div>
          </div>

          {/* Typ + barva row */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>Typ sazby</label>
              <div style={{ display: "flex", gap: 6 }}>
                {(["hodina", "kus"] as const).map(t => (
                  <button key={t} onClick={() => setSazbaTyp(t)} style={{
                    padding: "6px 12px", borderRadius: 99, fontSize: 12, cursor: "pointer",
                    border: "1.5px solid",
                    borderColor: sazbaTyp === t ? "var(--studio)" : "var(--line-strong)",
                    background: sazbaTyp === t ? "var(--studio-soft)" : "white",
                    color: sazbaTyp === t ? "var(--studio-ink)" : "var(--ink-2)",
                    fontWeight: sazbaTyp === t ? 600 : 400,
                  }}>
                    {t === "hodina" ? "Za hodinu" : "Za kus"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>Barva</label>
              <div style={{ display: "flex", gap: 5 }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setBarva(c)} style={{
                    width: 22, height: 22, borderRadius: 99, background: c, border: "none", cursor: "pointer",
                    boxShadow: barva === c ? `0 0 0 2px white, 0 0 0 3.5px ${c}` : "none",
                    transition: "box-shadow .12s",
                  }} />
                ))}
              </div>
            </div>

            <button onClick={handleAdd} disabled={saving} style={{
              marginLeft: "auto",
              padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))",
              color: "white", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              opacity: saving ? .6 : 1,
            }}>
              <Ico d={IC.plus} size={14} />
              Přidat
            </button>
          </div>

          {error && <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>{error}</div>}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</div>
        ) : kategorie.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 14 }}>
            Zatím žádné kategorie
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {kategorie.map(k => (
              <KategorieRadek key={k.id} k={k} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
