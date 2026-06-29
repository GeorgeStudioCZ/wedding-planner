"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Zakaznik  = { id: number; jmeno: string; prijmeni: string; firma?: string | null; ico?: string | null; dic?: string | null; email?: string | null; telefon?: string | null }
type Kategorie = { id: number; name: string; barva: string; sazba: number; typ: string | null }
type Zaznam    = { id: number; zakaznik_id: number | null; kategorie_id: number | null; nazev: string; start_at: string; end_at: string | null; poznamka: string; pocet: number | null; cena_prodej_kus: number | null }

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
}
function isoDate(iso: string) { return iso.slice(0, 10) }

function calcBezDPH(z: Zaznam, kat: Kategorie | undefined): number {
  if (z.pocet != null) return Math.round((z.pocet * (z.cena_prodej_kus ?? kat?.sazba ?? 0)) * 100) / 100
  if (!z.end_at || !kat) return 0
  const hours = (new Date(z.end_at).getTime() - new Date(z.start_at).getTime()) / 3_600_000
  return Math.round(hours * kat.sazba * 100) / 100
}

export default function PrintPage() {
  return <Suspense fallback={<div style={{ padding: 40, fontFamily: "system-ui" }}>Načítám…</div>}><PrintPageInner /></Suspense>
}

function PrintPageInner() {
  const params = useSearchParams()
  const zakaznikId = params.get("zakaznik") ? Number(params.get("zakaznik")) : null
  const od         = params.get("od") ?? ""
  const do_        = params.get("do") ?? ""
  const faktura    = params.get("faktura") ?? "vse"  // vse | ano | ne
  const invoiceNo  = params.get("invoice") ?? ""

  const [zakaznik,  setZakaznik]  = useState<Zakaznik | null>(null)
  const [kategorie, setKategorie] = useState<Kategorie[]>([])
  const [zaznamy,   setZaznamy]   = useState<Zaznam[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!zakaznikId) { setLoading(false); return }
    Promise.all([
      supabase.from("zakaznici").select("id, jmeno, prijmeni, firma, ico, dic, email, telefon").eq("id", zakaznikId).single(),
      supabase.from("george_kategorie").select("*"),
      supabase.from("george_zaznamy").select("*").eq("zakaznik_id", zakaznikId).order("start_at", { ascending: true }),
    ]).then(([{ data: zak }, { data: kat }, { data: zzn }]) => {
      setZakaznik(zak ?? null)
      setKategorie(kat ?? [])
      setZaznamy((zzn ?? []).map(z => ({ ...z, fakturovano: (z as Record<string,unknown>).fakturovano ?? false })) as Zaznam[])
      setLoading(false)
    })
  }, [zakaznikId])

  const katMap = useMemo(() => Object.fromEntries(kategorie.map(k => [k.id, k])), [kategorie])

  const filtered = useMemo(() => {
    return zaznamy.filter(z => {
      if (!z.end_at && z.pocet == null) return false
      const den = isoDate(z.start_at)
      if (od && den < od) return false
      if (do_ && den > do_) return false
      const fak = (z as unknown as Record<string,unknown>).fakturovano as boolean
      if (faktura === "ano" && !fak) return false
      if (faktura === "ne"  &&  fak) return false
      return true
    })
  }, [zaznamy, od, do_, faktura])

  const grouped = useMemo(() => {
    const map = new Map<string, Zaznam[]>()
    for (const z of filtered) {
      const d = isoDate(z.start_at)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(z)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const totalMs = filtered.filter(z => z.pocet == null && z.end_at).reduce(
    (a, z) => a + new Date(z.end_at!).getTime() - new Date(z.start_at).getTime(), 0
  )
  const totalBezDPH = filtered.reduce((a, z) => a + calcBezDPH(z, z.kategorie_id ? katMap[z.kategorie_id] : undefined), 0)
  const totalSDPH   = Math.round(totalBezDPH * 1.21 * 100) / 100

  const today = new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })

  if (loading) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#555" }}>Načítám…</div>
  if (!zakaznik) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#555" }}>Zákazník nenalezen.</div>

  const zakName = zakaznik.firma?.trim() || `${zakaznik.jmeno} ${zakaznik.prijmeni}`.trim()
  const rozsah  = od && do_ ? `${formatDate(od + "T00:00")} – ${formatDate(do_ + "T00:00")}` : "Celé období"

  return (
    <>
      <style>{`
        @page { margin: 18mm 16mm; size: A4; }
        @media print { .no-print { display: none !important; } body { background: white; } }
        body { margin: 0; background: #f5f5f5; font-family: system-ui, -apple-system, sans-serif; }
        * { box-sizing: border-box; }
      `}</style>

      {/* Tisk tlačítko */}
      <div className="no-print" style={{ background: "#0e0f14", padding: "12px 24px", display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
        <span style={{ color: "#5a5b66", fontSize: 12, flex: 1 }}>Tisk / Uložit jako PDF — použijte Ctrl+P nebo tlačítko níže</span>
        <button onClick={() => window.print()} style={{
          background: "linear-gradient(135deg, #6366f1, #f97316)", border: "none", borderRadius: 8,
          padding: "8px 18px", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          Tisk / PDF
        </button>
        <button onClick={() => window.close()} style={{
          background: "none", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8,
          padding: "8px 14px", color: "#9ca3af", fontSize: 13, cursor: "pointer",
        }}>
          Zavřít
        </button>
      </div>

      {/* Stránka A4 */}
      <div style={{ maxWidth: 794, margin: "24px auto 40px", background: "white", padding: "36px 40px", boxShadow: "0 2px 20px rgba(0,0,0,.12)" }}>

        {/* Hlavička */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, paddingBottom: 20, borderBottom: "2px solid #0e0f14" }}>
          <div>
            {/* Logo jako text */}
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.03em", color: "#0e0f14" }}>
              GEORGE <span style={{ background: "linear-gradient(90deg,#6366f1,#f97316)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STUDIO</span>
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, letterSpacing: ".1em" }}>VÝKAZ PRÁCE</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, color: "#374151" }}>Datum vystavení: <strong>{today}</strong></div>
            {invoiceNo && <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>Faktura č.: <strong>{invoiceNo}</strong></div>}
            <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>Období: <strong>{rozsah}</strong></div>
          </div>
        </div>

        {/* Zákazník */}
        <div style={{ marginBottom: 28, padding: "14px 16px", background: "#f9fafb", borderRadius: 8, borderLeft: "3px solid #6366f1" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#9ca3af", marginBottom: 6 }}>Zákazník</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0e0f14" }}>{zakName}</div>
          {zakaznik.ico && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>IČO: {zakaznik.ico}{zakaznik.dic ? ` · DIČ: ${zakaznik.dic}` : ""}</div>}
          {zakaznik.email && <div style={{ fontSize: 12, color: "#6b7280" }}>{zakaznik.email}{zakaznik.telefon ? ` · ${zakaznik.telefon}` : ""}</div>}
        </div>

        {/* Záznamy po dnech */}
        {grouped.map(([den, zzn]) => {
          const denMs  = zzn.filter(z => z.pocet == null && z.end_at).reduce((a, z) => a + new Date(z.end_at!).getTime() - new Date(z.start_at).getTime(), 0)
          const denBezDPH = zzn.reduce((a, z) => a + calcBezDPH(z, z.kategorie_id ? katMap[z.kategorie_id] : undefined), 0)
          return (
            <div key={den} style={{ marginBottom: 18 }}>
              {/* Datum nadpis */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", background: "#f3f4f6", padding: "5px 10px", borderRadius: 5, marginBottom: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{formatDate(den + "T12:00")}</span>
                <span style={{ fontSize: 11, color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>
                  {denMs > 0 && <>{formatElapsed(denMs)} · </>}
                  {denBezDPH.toLocaleString("cs-CZ")} Kč bez DPH
                </span>
              </div>

              {/* Řádky */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {zzn.map((z, i) => {
                    const kat = z.kategorie_id ? katMap[z.kategorie_id] : undefined
                    const bezDPH = calcBezDPH(z, kat)
                    const sDPH = Math.round(bezDPH * 1.21 * 100) / 100
                    const jeMaterial = z.pocet != null
                    return (
                      <tr key={z.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "7px 10px", verticalAlign: "top" }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{z.nazev || "(bez názvu)"}</div>
                          {kat && <span style={{ fontSize: 11, color: kat.barva, fontWeight: 600 }}>{kat.name}</span>}
                          {!jeMaterial && z.end_at && (
                            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: kat ? 6 : 0, fontVariantNumeric: "tabular-nums" }}>
                              {formatTime(z.start_at)} – {formatTime(z.end_at)}
                            </span>
                          )}
                          {jeMaterial && z.pocet != null && (
                            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: kat ? 6 : 0 }}>{z.pocet}×</span>
                          )}
                          {z.poznamka && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, fontStyle: "italic" }}>{z.poznamka}</div>}
                        </td>
                        <td style={{ padding: "7px 10px", verticalAlign: "top", textAlign: "right", whiteSpace: "nowrap" }}>
                          {!jeMaterial && z.end_at && (
                            <div style={{ fontSize: 11, color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
                              {formatElapsed(new Date(z.end_at).getTime() - new Date(z.start_at).getTime())}
                            </div>
                          )}
                          {bezDPH > 0 && <>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", fontVariantNumeric: "tabular-nums" }}>{sDPH.toLocaleString("cs-CZ")} Kč</div>
                            <div style={{ fontSize: 10, color: "#9ca3af" }}>bez DPH {bezDPH.toLocaleString("cs-CZ")} Kč</div>
                          </>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}

        {/* Celkový souhrn */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "2px solid #0e0f14" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
            {/* Shrnutí hodin */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#9ca3af", marginBottom: 6 }}>Celkem odpracováno</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#0e0f14", fontVariantNumeric: "tabular-nums" }}>{formatElapsed(totalMs)}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{filtered.length} záznamů</div>
            </div>
            {/* Celková cena */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#9ca3af", marginBottom: 6 }}>Celková cena</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#0e0f14", fontVariantNumeric: "tabular-nums" }}>
                {totalSDPH.toLocaleString("cs-CZ")} Kč
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                bez DPH {totalBezDPH.toLocaleString("cs-CZ")} Kč · DPH 21 % {(totalSDPH - totalBezDPH).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč
              </div>
            </div>
          </div>
        </div>

        {/* Patička */}
        <div style={{ marginTop: 32, paddingTop: 12, borderTop: "1px solid #e5e7eb", fontSize: 10, color: "#9ca3af", textAlign: "center" }}>
          George Studio · výkaz práce generován {today}
        </div>
      </div>
    </>
  )
}
