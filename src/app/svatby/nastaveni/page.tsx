"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import AppShell from "@/components/AppShell"

// ── Typy ──────────────────────────────────────────────────────────────────────
// klíč = ISO weekday (1=Po … 7=Ne), hodnota = seřazené dostupné hodiny
type Dostupnost = Record<string, number[]>

const DNY: { iso: number; label: string; zkratka: string }[] = [
  { iso: 1, label: "Pondělí",  zkratka: "Po" },
  { iso: 2, label: "Úterý",    zkratka: "Út" },
  { iso: 3, label: "Středa",   zkratka: "St" },
  { iso: 4, label: "Čtvrtek",  zkratka: "Čt" },
  { iso: 5, label: "Pátek",    zkratka: "Pá" },
  { iso: 6, label: "Sobota",   zkratka: "So" },
  { iso: 7, label: "Neděle",   zkratka: "Ne" },
]

// Zobrazujeme hodiny 6 – 21 (každá = slot XX:00 – XX+1:00)
const VSECHNY_HODINY = Array.from({ length: 16 }, (_, i) => i + 6)

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NastaveniPage() {
  const [dostupnost, setDostupnost] = useState<Dostupnost>({})
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)

  useEffect(() => {
    createClient()
      .from("schuzky_nastaveni")
      .select("dostupnost")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data?.dostupnost) setDostupnost(data.dostupnost as Dostupnost)
        setLoading(false)
      })
  }, [])

  function toggleHodina(iso: number, hod: number) {
    setDostupnost(prev => {
      const key = String(iso)
      const current = prev[key] ?? []
      const next = current.includes(hod)
        ? current.filter(h => h !== hod)
        : [...current, hod].sort((a, b) => a - b)
      return { ...prev, [key]: next }
    })
    setSaved(false)
  }

  // Zapnout / vypnout celý den
  function toggleDen(iso: number) {
    setDostupnost(prev => {
      const key = String(iso)
      const current = prev[key] ?? []
      return { ...prev, [key]: current.length > 0 ? [] : [] } // jen reset — uživatel musí vybrat hodiny
    })
    setSaved(false)
  }

  // Rychlé přidání rozsahu (např. 8–10 = hodiny 8,9)
  function pridejRozsah(iso: number, od: number, do_: number) {
    const hodiny = Array.from({ length: do_ - od }, (_, i) => od + i)
    setDostupnost(prev => {
      const key = String(iso)
      const current = new Set(prev[key] ?? [])
      hodiny.forEach(h => current.add(h))
      return { ...prev, [key]: Array.from(current).sort((a, b) => a - b) }
    })
    setSaved(false)
  }

  function vymazDen(iso: number) {
    setDostupnost(prev => ({ ...prev, [String(iso)]: [] }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const db = createClient()
    // Upsert — row s id=1 vždy existuje (nebo ji vytvoříme)
    const { error } = await db
      .from("schuzky_nastaveni")
      .upsert({ id: 1, dostupnost, updated_at: new Date().toISOString() })
    setSaving(false)
    if (!error) setSaved(true)
  }

  const celkemSlotu = Object.values(dostupnost).reduce((s, arr) => s + arr.length, 0)

  return (
    <AppShell module="wed">
      <div style={{ padding: "28px", maxWidth: 780 }}>

        {/* Hlavička */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Nastavení</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "4px 0 0" }}>
              Dostupné termíny pro rezervaci schůzky
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {saved && (
              <span style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>✓ Uloženo</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "9px 22px", borderRadius: 10, border: "none", cursor: saving ? "default" : "pointer",
                background: "linear-gradient(135deg, var(--wed-grad-a), var(--wed-grad-b))",
                color: "white", fontSize: 14, fontWeight: 600, opacity: saving ? .7 : 1,
              }}
            >
              {saving ? "Ukládám…" : "Uložit nastavení"}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</div>
        ) : (
          <>
            {/* Info */}
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
              Naklikej hodiny, ve kterých si zákazníci mohou rezervovat schůzku.
              Každý slot = 1 hodina (např. <strong>9:00</strong> = schůzka od 9:00 do 10:00).
              {celkemSlotu > 0 && <> Celkem: <strong>{celkemSlotu} slotů / týden</strong>.</>}
            </div>

            {/* Grid dnů */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

              {/* Záhlaví hodin */}
              <div style={{ display: "flex", gap: 4, paddingLeft: 116 }}>
                {VSECHNY_HODINY.map(h => (
                  <div key={h} style={{
                    width: 36, textAlign: "center", fontSize: 10.5, fontWeight: 600,
                    color: "#9ca3af", flexShrink: 0,
                  }}>
                    {h}
                  </div>
                ))}
              </div>

              {DNY.map(den => {
                const hodiny = dostupnost[String(den.iso)] ?? []
                const maHodiny = hodiny.length > 0

                return (
                  <div key={den.iso} style={{ display: "flex", alignItems: "center", gap: 4, background: "white", borderRadius: 12, padding: "8px 12px", boxShadow: "var(--shadow-1)", border: "1px solid var(--line)" }}>

                    {/* Název dne */}
                    <div style={{ width: 80, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: maHodiny ? "var(--ink)" : "#9ca3af" }}>
                        {den.label}
                      </div>
                      {maHodiny ? (
                        <button
                          onClick={() => vymazDen(den.iso)}
                          style={{ fontSize: 10.5, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >
                          vymazat
                        </button>
                      ) : (
                        <span style={{ fontSize: 10.5, color: "#d1d5db" }}>nedostupný</span>
                      )}
                    </div>

                    {/* Hodiny */}
                    {VSECHNY_HODINY.map(h => {
                      const aktivni = hodiny.includes(h)
                      return (
                        <button
                          key={h}
                          onClick={() => toggleHodina(den.iso, h)}
                          title={`${h}:00–${h + 1}:00`}
                          style={{
                            width: 36, height: 32, borderRadius: 7, border: "1.5px solid", cursor: "pointer",
                            flexShrink: 0, fontSize: 11, fontWeight: aktivni ? 700 : 400,
                            borderColor: aktivni ? "var(--wed-grad-a)" : "#e5e7eb",
                            background: aktivni
                              ? "linear-gradient(135deg, var(--wed-grad-a), var(--wed-grad-b))"
                              : "#fafaf9",
                            color: aktivni ? "white" : "#d1d5db",
                            transition: "all .12s",
                          }}
                        >
                          {aktivni ? "✓" : h}
                        </button>
                      )
                    })}

                    {/* Rychlé rozsahy */}
                    <div style={{ marginLeft: 8, display: "flex", gap: 4, flexShrink: 0 }}>
                      {[
                        { label: "ráno", od: 8, do: 12 },
                        { label: "odp.", od: 13, do: 18 },
                        { label: "večer", od: 18, do: 21 },
                      ].map(r => (
                        <button
                          key={r.label}
                          onClick={() => pridejRozsah(den.iso, r.od, r.do)}
                          title={`Přidat ${r.od}:00–${r.do}:00`}
                          style={{
                            padding: "4px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                            border: "1px solid #e5e7eb", background: "white", color: "#6b7280",
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          +{r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Týdenní přehled */}
            <div style={{ marginTop: 20, background: "white", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-1)", border: "1px solid var(--line)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#9ca3af", marginBottom: 12 }}>
                Přehled dostupnosti
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {DNY.map(den => {
                  const hodiny = dostupnost[String(den.iso)] ?? []
                  if (hodiny.length === 0) return (
                    <div key={den.iso} style={{ fontSize: 12.5, color: "#d1d5db", minWidth: 90 }}>
                      <strong style={{ color: "#9ca3af" }}>{den.zkratka}</strong> —
                    </div>
                  )
                  // Skupinuj po sobě jdoucí hodiny do rozsahů
                  const ranges: string[] = []
                  let start = hodiny[0], prev = hodiny[0]
                  for (let i = 1; i <= hodiny.length; i++) {
                    if (i < hodiny.length && hodiny[i] === prev + 1) { prev = hodiny[i]; continue }
                    ranges.push(start === prev ? `${start}:00` : `${start}:00–${prev + 1}:00`)
                    if (i < hodiny.length) { start = hodiny[i]; prev = hodiny[i] }
                  }
                  return (
                    <div key={den.iso} style={{ fontSize: 12.5, color: "var(--ink-2)", minWidth: 90 }}>
                      <strong>{den.zkratka}</strong> {ranges.join(", ")}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
