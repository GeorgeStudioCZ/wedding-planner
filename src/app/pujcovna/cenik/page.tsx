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
  { dni_od: 2, dni_do: 4,   cena_za_den: 0 },
  { dni_od: 5, dni_do: 7,   cena_za_den: 0 },
  { dni_od: 8, dni_do: null, cena_za_den: 0 },
]

export default function Cenik() {
  const [polozky, setPolozky] = useState<Polozka[]>([])
  const [stupne, setStupne] = useState<Record<number, Stupen[]>>({})
  const [loading, setLoading] = useState(true)
  const [ukladam, setUkladam] = useState<number | null>(null)

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
      setStupne(prev => ({
        ...prev,
        [id]: VYCHOZI_STUPNE.map(s => ({ ...s, polozka_id: id }))
      }))
    }
  }

  function updateStupen(polozkaId: number, index: number, cena: number) {
    setStupne(prev => {
      const aktualni = prev[polozkaId] ?? VYCHOZI_STUPNE.map(s => ({ ...s, polozka_id: polozkaId }))
      const nove = aktualni.map((s, i) => i === index ? { ...s, cena_za_den: cena } : s)
      return { ...prev, [polozkaId]: nove }
    })
  }

  const kategorie = [...new Set(polozky.map(p => p.category))]

  const inputCls = "border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 w-28 text-right"

  return (
    <AppShell module="van">

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="text-center text-gray-400 py-12">Načítám...</div>
        ) : (
          kategorie.map(kat => (
            <div key={kat} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gray-800 px-5 py-3">
                <h2 className="text-white text-sm font-bold uppercase tracking-wider">{kat}</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {polozky.filter(p => p.category === kat).map(p => {
                  const stPolozky = stupne[p.id] ?? VYCHOZI_STUPNE.map(s => ({ ...s, polozka_id: p.id }))
                  return (
                    <div key={p.id} className="p-5">
                      {/* Název + přepínač typu */}
                      <div className="flex items-center justify-between mb-3 gap-4">
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 shrink-0">
                          <button
                            onClick={() => updatePolozka(p.id, { cena_typ: "fixni" })}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${p.cena_typ === "fixni" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            Fixní / den
                          </button>
                          <button
                            onClick={() => updatePolozka(p.id, { cena_typ: "stupnovana" })}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${p.cena_typ === "stupnovana" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            Stupňovaná
                          </button>
                          <button
                            onClick={() => updatePolozka(p.id, { cena_typ: "kusova" })}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${p.cena_typ === "kusova" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            Kusová
                          </button>
                        </div>
                      </div>

                      {/* Cena */}
                      {p.cena_typ === "fixni" && (
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500 w-20">1 den</span>
                          <input
                            type="number"
                            value={p.cena_fixni ?? ""}
                            onChange={e => updatePolozka(p.id, { cena_fixni: Number(e.target.value) || null })}
                            placeholder="0"
                            className={inputCls}
                          />
                          <span className="text-sm text-gray-400">Kč / den</span>
                        </div>
                      )}
                      {p.cena_typ === "kusova" && (
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500 w-20">1 ks</span>
                          <input
                            type="number"
                            value={p.cena_fixni ?? ""}
                            onChange={e => updatePolozka(p.id, { cena_fixni: Number(e.target.value) || null })}
                            placeholder="0"
                            className={inputCls}
                          />
                          <span className="text-sm text-gray-400">Kč / ks</span>
                        </div>
                      )}
                      {p.cena_typ === "stupnovana" && (
                        <div className="space-y-2">
                          {stPolozky.map((s, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <span className="text-sm text-gray-500 w-20">
                                {s.dni_do ? `${s.dni_od}–${s.dni_do} dní` : `${s.dni_od}+ dní`}
                              </span>
                              <input
                                type="number"
                                value={s.cena_za_den || ""}
                                onChange={e => updateStupen(p.id, i, Number(e.target.value) || 0)}
                                placeholder="0"
                                className={inputCls}
                              />
                              <span className="text-sm text-gray-400">Kč / den</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Uložit */}
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => ulozPolozku(p)}
                          disabled={ukladam === p.id}
                          className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
                        >
                          {ukladam === p.id ? "Ukládám..." : "Uložit"}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  )
}
