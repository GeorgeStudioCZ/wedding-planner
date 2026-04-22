"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import AppShell from "@/components/AppShell"

type Polozka = {
  id: number
  name: string
  category: string
  sort_order: number
  cena_typ: "fixni" | "stupnovana" | "kusova"
  cena_fixni: number | null
}

type Stupen = {
  id?: number
  polozka_id: number
  dni_od: number
  dni_do: number | null
  cena_za_den: number
}

const VYCHOZI_STUPNE: Omit<Stupen, "polozka_id">[] = [
  { dni_od: 2, dni_do: 4,    cena_za_den: 0 },
  { dni_od: 5, dni_do: 7,    cena_za_den: 0 },
  { dni_od: 8, dni_do: null, cena_za_den: 0 },
]

// Category accent colours
const KAT_COLOR: Record<string, string> = {
  "Stany":          "var(--van-grad-a)",
  "Příčníky":       "#6366f1",
  "Paddleboardy":   "#0ea5e9",
  "Markýzy":        "#f59e0b",
  "Sedátka":        "#ec4899",
  "Napájení":       "#f97316",
  "Ledničky":       "#14b8a6",
  "Redukce":        "#8b5cf6",
  "Camping sety":   "#10b981",
  "Stolky":         "#64748b",
  "Vařiče":         "#ef4444",
  "Reproduktory":   "#3b82f6",
  "Ostatní":        "#94a3b8",
}

function getAccent(kat: string) {
  return KAT_COLOR[kat] ?? "var(--van-grad-a)"
}

export default function Cenik() {
  const [polozky, setPolozky]   = useState<Polozka[]>([])
  const [stupne, setStupne]     = useState<Record<number, Stupen[]>>({})
  const [loading, setLoading]   = useState(true)
  const [ukladam, setUkladam]   = useState<number | null>(null)
  const [aktivniKat, setAktivniKat] = useState<string | null>(null)

  useEffect(() => {
    async function nacti() {
      const sb = createClient()
      const [{ data: pol }, { data: st }] = await Promise.all([
        sb.from("pujcovna_polozky").select("id, name, category, sort_order, cena_typ, cena_fixni").order("sort_order"),
        sb.from("pujcovna_ceny_stupne").select("*").order("dni_od"),
      ])
      setPolozky(pol ?? [])
      const mapa: Record<number, Stupen[]> = {}
      for (const s of (st ?? [])) {
        if (!mapa[s.polozka_id]) mapa[s.polozka_id] = []
        mapa[s.polozka_id].push(s)
      }
      setStupne(mapa)
      setLoading(false)
    }
    nacti()
  }, [])

  async function ulozPolozku(p: Polozka) {
    setUkladam(p.id)
    const sb = createClient()
    await sb.from("pujcovna_polozky")
      .update({ cena_typ: p.cena_typ, cena_fixni: p.cena_fixni })
      .eq("id", p.id)
    if (p.cena_typ === "stupnovana") {
      const stPolozky = stupne[p.id] ?? VYCHOZI_STUPNE.map(s => ({ ...s, polozka_id: p.id }))
      await sb.from("pujcovna_ceny_stupne").delete().eq("polozka_id", p.id)
      await sb.from("pujcovna_ceny_stupne").insert(
        stPolozky.map(s => ({ polozka_id: p.id, dni_od: s.dni_od, dni_do: s.dni_do, cena_za_den: s.cena_za_den }))
      )
    } else {
      await sb.from("pujcovna_ceny_stupne").delete().eq("polozka_id", p.id)
    }
    setUkladam(null)
  }

  function updatePolozka(id: number, changes: Partial<Polozka>) {
    setPolozky(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p))
    if (changes.cena_typ === "stupnovana" && !stupne[id]) {
      setStupne(prev => ({ ...prev, [id]: VYCHOZI_STUPNE.map(s => ({ ...s, polozka_id: id })) }))
    }
  }

  function updateStupen(polozkaId: number, index: number, cena: number) {
    setStupne(prev => {
      const aktualni = prev[polozkaId] ?? VYCHOZI_STUPNE.map(s => ({ ...s, polozka_id: polozkaId }))
      return { ...prev, [polozkaId]: aktualni.map((s, i) => i === index ? { ...s, cena_za_den: cena } : s) }
    })
  }

  const kategorie = [...new Set(polozky.map(p => p.category))]
  const viditelneKategorie = aktivniKat ? [aktivniKat] : kategorie

  const inputCls = [
    "flex-1 min-w-0 border rounded-lg px-2.5 py-1.5 text-sm font-mono text-right",
    "focus:outline-none focus:ring-2 bg-white",
  ].join(" ")

  if (loading) {
    return (
      <AppShell module="van">
        <div className="flex items-center justify-center h-64 text-[var(--muted)]">Načítám…</div>
      </AppShell>
    )
  }

  return (
    <AppShell module="van">

      {/* ── Page header ── */}
      <div style={{ padding: "28px 32px 0" }}>
        <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--muted)", marginBottom: 4 }}>
          Autostany · Nastavení
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontStyle: "normal", fontWeight: 700, fontSize: 26, color: "var(--ink)", margin: 0 }}>
            Ceník půjčovny
          </h1>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>
            {polozky.length} položek v {kategorie.length} kategoriích
          </p>
        </div>
      </div>

      {/* ── Category filter tabs ── */}
      <div style={{ padding: "20px 32px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          onClick={() => setAktivniKat(null)}
          style={{
            padding: "5px 14px", borderRadius: 99, border: "1px solid",
            fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all .15s",
            background: !aktivniKat ? "var(--ink)" : "white",
            color: !aktivniKat ? "white" : "var(--ink-2)",
            borderColor: !aktivniKat ? "var(--ink)" : "var(--line-strong)",
          }}
        >
          Vše
        </button>
        {kategorie.map(kat => {
          const active = aktivniKat === kat
          const accent = getAccent(kat)
          return (
            <button
              key={kat}
              onClick={() => setAktivniKat(active ? null : kat)}
              style={{
                padding: "5px 14px", borderRadius: 99, border: "1px solid",
                fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all .15s",
                background: active ? accent : "white",
                color: active ? "white" : "var(--ink-2)",
                borderColor: active ? accent : "var(--line-strong)",
              }}
            >
              {kat}
            </button>
          )
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "24px 32px 56px", display: "flex", flexDirection: "column", gap: 40 }}>
        {viditelneKategorie.map(kat => {
          const items = polozky.filter(p => p.category === kat)
          if (items.length === 0) return null
          const accent = getAccent(kat)

          return (
            <section key={kat}>
              {/* Category header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 3, height: 16, borderRadius: 99, background: accent, flexShrink: 0 }} />
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase",
                  fontFamily: "var(--font-mono)", color: "var(--ink-2)",
                }}>
                  {kat}
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  — {items.length} {items.length === 1 ? "položka" : items.length < 5 ? "položky" : "položek"}
                </span>
              </div>

              {/* Items grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}>
                {items.map(p => {
                  const stPolozky = stupne[p.id] ?? VYCHOZI_STUPNE.map(s => ({ ...s, polozka_id: p.id }))
                  const saving = ukladam === p.id

                  return (
                    <div key={p.id} style={{
                      background: "white",
                      border: "1px solid var(--line)",
                      borderRadius: 14,
                      overflow: "hidden",
                      boxShadow: "var(--shadow-1)",
                      display: "flex",
                      flexDirection: "column",
                    }}>
                      {/* Top colour stripe */}
                      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent}, transparent 80%)` }} />

                      <div style={{ padding: "14px 16px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>

                        {/* Name */}
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.3 }}>
                          {p.name}
                        </div>

                        {/* Type switcher */}
                        <div style={{
                          display: "flex", background: "var(--bg)", borderRadius: 8, padding: 2,
                        }}>
                          {(["fixni", "stupnovana", "kusova"] as const).map(typ => (
                            <button
                              key={typ}
                              onClick={() => updatePolozka(p.id, { cena_typ: typ })}
                              style={{
                                flex: 1, padding: "4px 0", border: "none", cursor: "pointer",
                                borderRadius: 6, fontSize: 10, fontWeight: 600, letterSpacing: ".03em",
                                transition: "all .15s",
                                background: p.cena_typ === typ ? "white" : "transparent",
                                color: p.cena_typ === typ ? "var(--ink)" : "var(--muted)",
                                boxShadow: p.cena_typ === typ ? "0 1px 3px rgba(0,0,0,.12)" : "none",
                              }}
                            >
                              {typ === "fixni" ? "Fixní" : typ === "stupnovana" ? "Stupňovaná" : "Kusová"}
                            </button>
                          ))}
                        </div>

                        {/* Price inputs */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>

                          {p.cena_typ === "fixni" && (
                            <PriceRow
                              label="1 den"
                              value={p.cena_fixni ?? ""}
                              unit="Kč/den"
                              onChange={v => updatePolozka(p.id, { cena_fixni: v || null })}
                              accent={accent}
                              inputCls={inputCls}
                            />
                          )}

                          {p.cena_typ === "kusova" && (
                            <PriceRow
                              label="1 ks"
                              value={p.cena_fixni ?? ""}
                              unit="Kč/ks"
                              onChange={v => updatePolozka(p.id, { cena_fixni: v || null })}
                              accent={accent}
                              inputCls={inputCls}
                            />
                          )}

                          {p.cena_typ === "stupnovana" && stPolozky.map((s, i) => (
                            <PriceRow
                              key={i}
                              label={s.dni_do ? `${s.dni_od}–${s.dni_do} dní` : `${s.dni_od}+ dní`}
                              value={s.cena_za_den || ""}
                              unit="Kč/den"
                              onChange={v => updateStupen(p.id, i, v ?? 0)}
                              accent={accent}
                              inputCls={inputCls}
                            />
                          ))}
                        </div>

                        {/* Save button */}
                        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
                          <button
                            onClick={() => ulozPolozku(p)}
                            disabled={saving}
                            style={{
                              background: saving
                                ? "var(--muted)"
                                : `linear-gradient(135deg, ${accent}, var(--van-grad-b))`,
                              border: "none", borderRadius: 8,
                              color: "white", fontSize: 11, fontWeight: 600,
                              padding: "6px 16px",
                              cursor: saving ? "default" : "pointer",
                              opacity: saving ? 0.6 : 1,
                              transition: "opacity .15s",
                              letterSpacing: ".03em",
                            }}
                          >
                            {saving ? "Ukládám…" : "Uložit"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </AppShell>
  )
}

// ── Helper component ──────────────────────────────────────────────────────────
function PriceRow({
  label, value, unit, onChange, accent, inputCls,
}: {
  label: string
  value: number | string
  unit: string
  onChange: (v: number | null) => void
  accent: string
  inputCls: string
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        fontSize: 11, color: "var(--muted)", width: 60, flexShrink: 0,
        fontFamily: "var(--font-mono)",
      }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value) || null)}
        placeholder="0"
        className={inputCls}
        style={{
          borderColor: "var(--line-strong)",
          // @ts-expect-error css var
          "--tw-ring-color": accent + "66",
        }}
      />
      <span style={{
        fontSize: 11, color: "var(--muted)", width: 44, flexShrink: 0,
        textAlign: "right", fontFamily: "var(--font-mono)",
      }}>
        {unit}
      </span>
    </div>
  )
}
