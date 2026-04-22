"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import MapaDashboard from "@/components/MapaDashboard"
import AppShell from "@/components/AppShell"

type Zakazka = {
  id: string
  jmeno_nevesty: string
  jmeno_zenicha: string
  datum_svatby: string
  typ_sluzby: string
  balicek: string
  cena: number
  adresa_obradu: string
  vzdalenost_km: number | null
  lat: number | null
  lng: number | null
  vystup_odevzdan: boolean
  rychlost_dodani: string
  stav: string
  videohovor_datum: string | null
}

// ── Stat Box ────────────────────────────────────────────────────────────────
function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--line)",
      borderRadius: "var(--radius-md)", padding: "14px 16px 16px",
      boxShadow: "var(--shadow-1)",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-serif), serif", fontStyle: "italic", fontSize: 30, fontWeight: 400, color: "var(--ink)", lineHeight: 1 }}>
        {value}
      </div>
    </div>
  )
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ tone, label, value, foot }: { tone: "rose" | "coral" | "plum" | "slate" | "mint" | "sky"; label: string; value: string; foot: React.ReactNode }) {
  const GRADS: Record<string, string> = {
    rose:  "linear-gradient(140deg, #ff7aa0 0%, #ff6a8b 45%, #ff9a6a 100%)",
    coral: "linear-gradient(140deg, #ff9f6a 0%, #ff7a86 100%)",
    plum:  "linear-gradient(140deg, #8b5cf6 0%, #ec6ad4 100%)",
    slate: "linear-gradient(140deg, #2a2b33 0%, #3c3e49 100%)",
    mint:  "linear-gradient(140deg, #36d7a8 0%, #5fcf7a 100%)",
    sky:   "linear-gradient(140deg, #5eb8ff 0%, #6aa6ff 100%)",
  }
  return (
    <div style={{ background: GRADS[tone], borderRadius: "var(--radius-lg)", padding: 18, color: "white", minHeight: 130, position: "relative", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", opacity: .82 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-serif), serif", fontStyle: "italic", fontSize: 42, lineHeight: 1, marginTop: 6, letterSpacing: "-.01em" }}>{value}</div>
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, opacity: .9 }}>{foot}</div>
    </div>
  )
}

// ── Mini Calendar ────────────────────────────────────────────────────────────
const MESICE_NAZVY = ["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"]
const DNY_NAZVY    = ["Po","Út","St","Čt","Pá","So","Ne"]

function MiniKalendar({ zakazky }: { zakazky: Zakazka[] }) {
  const today = new Date()
  const mesice = [0, 1, 2].map(offset => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const svatebniDny = new Set(
    zakazky.filter(z => z.datum_svatby).map(z => z.datum_svatby.slice(0, 10))
  )

  return (
    <div style={{ display: "flex", gap: 12 }}>
      {mesice.map(({ year, month }) => {
        const firstDay = new Date(year, month, 1)
        const startDow = (firstDay.getDay() + 6) % 7  // Po=0 … Ne=6
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const cells: (number | null)[] = [
          ...Array(startDow).fill(null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ]
        while (cells.length % 7 !== 0) cells.push(null)

        return (
          <div key={`${year}-${month}`} style={{ flex: 1, minWidth: 0 }}>
            {/* Název měsíce */}
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".1em",
              textTransform: "uppercase", color: "var(--ink-2)", fontWeight: 700,
              marginBottom: 8, textAlign: "center",
            }}>
              {MESICE_NAZVY[month].slice(0, 3)} · {year}
            </div>
            {/* Záhlaví dnů */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 3 }}>
              {DNY_NAZVY.map((d, i) => (
                <div key={d} style={{
                  textAlign: "center", fontSize: 8, fontFamily: "var(--font-mono)",
                  color: i >= 5 ? "#f43f5e" : "var(--muted)", paddingBottom: 3,
                }}>
                  {d}
                </div>
              ))}
            </div>
            {/* Buňky dnů */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
              {cells.map((day, i) => {
                if (day === null) return <div key={i} />
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                const isSvatba  = svatebniDny.has(dateStr)
                const isDnes    = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
                const colIndex  = (startDow + day - 1) % 7
                const isWeekend = colIndex >= 5
                return (
                  <div key={i} style={{
                    textAlign: "center", fontSize: 10.5, lineHeight: "22px",
                    borderRadius: 4,
                    background: isSvatba
                      ? "var(--wed-grad-a, #f43f5e)"
                      : isDnes
                        ? "rgba(0,0,0,.07)"
                        : "transparent",
                    color: isSvatba
                      ? "white"
                      : isWeekend
                        ? "#e11d48"
                        : "var(--ink-2)",
                    fontWeight: isSvatba || isDnes ? 700 : 400,
                    outline: isDnes && !isSvatba ? "1.5px solid var(--line-strong)" : "none",
                    outlineOffset: "-1.5px",
                  }}>
                    {day}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Home() {
  const [zakazky, setZakazky] = useState<Zakazka[]>([])
  const [loading, setLoading] = useState(true)
  const [chyba, setChyba] = useState<string | null>(null)
  const [cenaBenzinu, setCenaBenzinu] = useState<number | null>(null)
  const [filter, setFilter] = useState<"Vše" | "Zaplaceno" | "Čeká">("Vše")

  async function nactiZakazky() {
    const { data, error } = await supabase
      .from("zakazky")
      .select("id, jmeno_nevesty, jmeno_zenicha, datum_svatby, typ_sluzby, balicek, cena, adresa_obradu, vzdalenost_km, lat, lng, vystup_odevzdan, rychlost_dodani, stav, videohovor_datum")
      .order("datum_svatby", { ascending: true })

    if (error) {
      console.error("Supabase chyba:", error)
      setChyba(JSON.stringify(error))
      setLoading(false)
      return
    }

    const zakazky = data ?? []

    // Automatický přechod zaplaceno → po-svatbe po proběhlém datu
    const dnes = new Date()
    dnes.setHours(0, 0, 0, 0)
    const kAktualizaci = zakazky.filter(z => {
      if (z.stav !== "zaplaceno" || !z.datum_svatby) return false
      const d = new Date(z.datum_svatby)
      d.setHours(0, 0, 0, 0)
      return d < dnes
    })

    if (kAktualizaci.length > 0) {
      let aktualniCenaBenzinu: number | null = null
      try {
        const r = await fetch("/api/cena-benzinu")
        const d = await r.json()
        if (d.cena) aktualniCenaBenzinu = d.cena
      } catch {}

      await Promise.all(kAktualizaci.map(z =>
        supabase.from("zakazky").update({
          stav: "po-svatbe",
          ...(aktualniCenaBenzinu ? { cena_benzinu: aktualniCenaBenzinu } : {}),
        }).eq("id", z.id).then(() =>
          supabase.from("zakazky_historie").insert([{ zakazka_id: z.id, stav: "po-svatbe" }])
        )
      ))
      kAktualizaci.forEach(z => { z.stav = "po-svatbe" })
    }

    setZakazky(zakazky)
    setLoading(false)
  }

  useEffect(() => {
    nactiZakazky()
    fetch("/api/cena-benzinu")
      .then(r => r.json())
      .then(d => { if (d.cena) setCenaBenzinu(d.cena) })
      .catch(() => {})
  }, [])

  async function toggleOdevzdani(e: React.MouseEvent, id: string, aktualniStav: boolean) {
    e.preventDefault()
    e.stopPropagation()
    await supabase.from("zakazky").update({ vystup_odevzdan: !aktualniStav }).eq("id", id)
    setZakazky(prev => prev.map(z => z.id === id ? { ...z, vystup_odevzdan: !aktualniStav } : z))
  }

  const dnes = new Date()
  dnes.setHours(0, 0, 0, 0)

  const NEPOTVRZENE_STAVY = ["poptavka", "rozhoduje-se", "objednavka", "cekam-platbu"]
  const potvrzeneSvatby = zakazky.filter(z => !NEPOTVRZENE_STAVY.includes(z.stav))

  const probihaJednani = zakazky.filter(z =>
    ["poptavka", "rozhoduje-se"].includes(z.stav)
  )

  const vyplnenaObjednavka = zakazky.filter(z =>
    ["objednavka", "cekam-platbu"].includes(z.stav)
  )

  const nadchazejici = potvrzeneSvatby.filter(z => {
    if (!z.datum_svatby) return false
    const d = new Date(z.datum_svatby); d.setHours(0, 0, 0, 0)
    return d >= dnes && z.stav === "zaplaceno"
  })

  const realizovaneNeodevzdane = potvrzeneSvatby.filter(z => {
    if (!z.datum_svatby) return false
    const d = new Date(z.datum_svatby); d.setHours(0, 0, 0, 0)
    return d < dnes && !z.vystup_odevzdan
  })

  const realizovaneOdevzdane = potvrzeneSvatby.filter(z => {
    if (!z.datum_svatby) return false
    const d = new Date(z.datum_svatby); d.setHours(0, 0, 0, 0)
    return d < dnes && z.vystup_odevzdan
  })

  const letoscelkem = potvrzeneSvatby.filter(z => z.datum_svatby && new Date(z.datum_svatby).getFullYear() === new Date().getFullYear())

  const realizovano = potvrzeneSvatby.filter(z => {
    if (!z.datum_svatby) return false
    const d = new Date(z.datum_svatby); d.setHours(0, 0, 0, 0)
    return d < dnes
  })
  const cekaNaSestrizani = potvrzeneSvatby.filter(z => ["ve-strizne", "po-svatbe"].includes(z.stav) && !z.vystup_odevzdan)

  const celkemKm = Math.round(potvrzeneSvatby.reduce((sum, z) => sum + (z.vzdalenost_km ? z.vzdalenost_km * 2 : 0), 0))
  const ujetoKm = Math.round(potvrzeneSvatby.filter(z => {
    if (!z.datum_svatby) return false
    const d = new Date(z.datum_svatby); d.setHours(0, 0, 0, 0)
    return d < dnes
  }).reduce((sum, z) => sum + (z.vzdalenost_km ? z.vzdalenost_km * 2 : 0), 0))
  const zbyvaUjetKm = celkemKm - ujetoKm
  const celkovaCasJizdy = celkemKm > 0 ? `${Math.ceil(celkemKm / 80)} h` : "—"

  const celkemObrat = potvrzeneSvatby.reduce((sum, z) => sum + (z.cena || 0), 0)
  const nakladyBenzin = cenaBenzinu ? Math.round((ujetoKm / 100) * 9 * cenaBenzinu) : null
  const uhrazeneZalohy = potvrzeneSvatby.filter(z => z.stav === "zaplaceno").length * 2900
  const obratNadchazejicich = nadchazejici.reduce((sum, z) => sum + (z.cena || 0), 0)
  const zbyvaDoplatit = obratNadchazejicich - uhrazeneZalohy

  const bodyNaMape = potvrzeneSvatby.filter(z => z.lat && z.lng).map(z => ({
    id: z.id, lat: z.lat!, lng: z.lng!,
    jmeno_nevesty: z.jmeno_nevesty, jmeno_zenicha: z.jmeno_zenicha,
    datum_svatby: z.datum_svatby, adresa_obradu: z.adresa_obradu,
  }))

  const STAVY: { value: string; label: string; barva: string }[] = [
    { value: "poptavka",     label: "Poptávka",      barva: "bg-gray-100 text-gray-600" },
    { value: "rozhoduje-se", label: "Rozhoduje se",  barva: "bg-yellow-100 text-yellow-700" },
    { value: "objednavka",   label: "Objednávka",    barva: "bg-blue-100 text-blue-700" },
    { value: "cekam-platbu", label: "Čekám platbu",  barva: "bg-orange-100 text-orange-700" },
    { value: "zaplaceno",    label: "Zaplaceno",     barva: "bg-green-100 text-green-700" },
    { value: "ve-strizne",   label: "Ve střižně",    barva: "bg-purple-100 text-purple-700" },
    { value: "po-svatbe",    label: "Po svatbě",     barva: "bg-sky-100 text-sky-700" },
    { value: "ukonceno",     label: "Ukončeno",      barva: "bg-slate-100 text-slate-500" },
  ]

  function stavInfo(stav: string) {
    return STAVY.find(s => s.value === stav) ?? STAVY[0]
  }

  function deadlineDni(datum_svatby: string, rychlost_dodani: string): number | null {
    if (!datum_svatby) return null
    const svatba = new Date(datum_svatby)
    svatba.setHours(0, 0, 0, 0)
    const map: Record<string, number> = {
      "60-dnu": 60,
      "14-dnu": 14,
      "7-dnu": 7,
      "72-hodin": 3,
    }
    const dniNavic = map[rychlost_dodani] ?? 60
    const deadline = new Date(svatba)
    deadline.setDate(deadline.getDate() + dniNavic)
    const dnes2 = new Date()
    dnes2.setHours(0, 0, 0, 0)
    return Math.round((deadline.getTime() - dnes2.getTime()) / (1000 * 60 * 60 * 24))
  }

  function formatCena(cena: number) {
    if (!cena) return "—"
    return cena.toLocaleString("cs-CZ") + " Kč"
  }

  function typLabel(typ: string) {
    if (typ === "foto+video") return "Foto + Video"
    if (typ === "foto") return "Foto"
    if (typ === "video") return "Video"
    return typ ?? "—"
  }

  // ── WED_PILL ────────────────────────────────────────────────────────────────
  const WED_PILL: Record<string, { bg: string; color: string }> = {
    "poptavka":     { bg: "#f2f1ec", color: "var(--ink-2)" },
    "rozhoduje-se": { bg: "#fff9c4", color: "#7a5c00" },
    "objednavka":   { bg: "#e8f0fe", color: "#1a56db" },
    "cekam-platbu": { bg: "#fff2dd", color: "#8a5a00" },
    "zaplaceno":    { bg: "#e6f7ee", color: "#156a3a" },
    "ve-strizne":   { bg: "#f3e8ff", color: "#6b21a8" },
    "po-svatbe":    { bg: "#e0f2fe", color: "#0369a1" },
    "ukonceno":     { bg: "#f1f5f9", color: "#475569" },
  }

  const STAV_BORDER: Record<string, string> = {
    "poptavka":     "#9ca3af",
    "rozhoduje-se": "#fbbf24",
    "objednavka":   "#60a5fa",
    "cekam-platbu": "#fb923c",
    "zaplaceno":    "#4ade80",
    "ve-strizne":   "#c084fc",
    "po-svatbe":    "#38bdf8",
    "ukonceno":     "#94a3b8",
  }

  // ── ZakazkaRadek ────────────────────────────────────────────────────────────
  function ZakazkaRadek({ z }: { z: Zakazka }) {
    const svatba = z.datum_svatby ? new Date(z.datum_svatby) : null
    if (svatba) svatba.setHours(0, 0, 0, 0)
    const dniDo = svatba ? Math.round((svatba.getTime() - dnes.getTime()) / (1000 * 60 * 60 * 24)) : null
    const probehlo = dniDo !== null && dniDo < 0
    const borderColor = STAV_BORDER[z.stav] ?? "#9ca3af"

    function countdownMobile() {
      if (dniDo === null) return null
      if (dniDo === 0) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">Dnes!</span>
      if (probehlo && z.vystup_odevzdan) return (
        <button
          onClick={(e) => toggleOdevzdani(e, z.id, z.vystup_odevzdan)}
          className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200"
        >
          ✓ Odevzdáno
        </button>
      )
      if (probehlo && !z.vystup_odevzdan) {
        const zbyvaDni = deadlineDni(z.datum_svatby, z.rychlost_dodani)
        const cls = zbyvaDni !== null && zbyvaDni <= 3
          ? "bg-red-50 text-red-700 border border-red-200"
          : "bg-orange-50 text-orange-700 border border-orange-200"
        return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>odevzdat za {zbyvaDni !== null && zbyvaDni <= 0 ? "!" : `${zbyvaDni} dní`}</span>
      }
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">za {dniDo} dní</span>
    }

    function countdownDesktop() {
      if (dniDo === null) return <span style={{ color: "var(--muted)", fontSize: 13 }}>—</span>
      if (dniDo === 0) return <span style={{ fontWeight: 700, color: "var(--wed)", fontSize: 13 }}>Dnes!</span>
      if (probehlo && z.vystup_odevzdan) return (
        <button onClick={(e) => toggleOdevzdani(e, z.id, z.vystup_odevzdan)}
          style={{ fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 99, background: "#e6f7ee", color: "#156a3a", border: "none", cursor: "pointer" }}>
          ✓ Odevzdáno
        </button>
      )
      if (probehlo && !z.vystup_odevzdan) {
        const zbyvaDni = deadlineDni(z.datum_svatby, z.rychlost_dodani)
        const col = zbyvaDni !== null && zbyvaDni <= 3 ? "#dc2626" : "#d97706"
        return (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>Odevzdat do</div>
            <div style={{ fontFamily: "var(--font-serif), serif", fontStyle: "italic", fontSize: 22, lineHeight: 1, color: col }}>
              {zbyvaDni !== null ? (zbyvaDni <= 0 ? "!" : zbyvaDni) : "—"}
            </div>
            <div style={{ fontStyle: "normal", fontFamily: "var(--font-sans)", fontSize: 10.5, color: "var(--muted)" }}>dní</div>
          </div>
        )
      }
      return (
        <div style={{ textAlign: "right", minWidth: 44 }}>
          <div style={{ fontFamily: "var(--font-serif), serif", fontStyle: "italic", fontSize: 22, lineHeight: 1, color: "var(--wed)" }}>{dniDo}</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 10.5, color: "var(--muted)", letterSpacing: ".1em" }}>dní</div>
        </div>
      )
    }

    const cdMobile = countdownMobile()

    return (
      <Link href={`/svatby/zakazky/${z.id}`} className="block" style={{ textDecoration: "none" }}>
        {/* Mobile card */}
        <div className="flex flex-col px-4 py-3.5 gap-1.5 md:hidden border-l-4" style={{ borderColor }}>
          {/* Row 1: names + status */}
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 flex-1 truncate text-sm">
              {z.jmeno_nevesty || "—"} & {z.jmeno_zenicha || "—"}
            </p>
            <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${stavInfo(z.stav).barva}`}>
              {stavInfo(z.stav).label}
            </span>
          </div>
          {/* Row 2: date + address */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="font-medium text-gray-700 shrink-0">
              {z.datum_svatby
                ? `${String(new Date(z.datum_svatby).getDate()).padStart(2, "0")}.${String(new Date(z.datum_svatby).getMonth() + 1).padStart(2, "0")}. ${new Date(z.datum_svatby).getFullYear()}`
                : "—"}
            </span>
            {z.adresa_obradu && <><span className="text-gray-300">·</span><span className="truncate">{z.adresa_obradu}</span></>}
            {z.videohovor_datum && <span className="shrink-0">📹</span>}
          </div>
          {/* Row 3: type + price + countdown */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>{typLabel(z.typ_sluzby)}</span>
            {z.cena > 0 && <><span className="text-gray-300">·</span><span className="font-semibold text-gray-700">{formatCena(z.cena)}</span></>}
            {cdMobile && <span className="ml-auto">{cdMobile}</span>}
          </div>
        </div>

        {/* Desktop row */}
        <div className="hidden md:grid" style={{
          gridTemplateColumns: "72px 1fr auto auto auto",
          gap: 16, padding: "14px 18px",
          alignItems: "center",
          borderTop: "1px solid var(--line)",
        }}>
          {/* Date */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
            <div>{z.datum_svatby ? `${String(new Date(z.datum_svatby).getDate()).padStart(2, "0")}.${String(new Date(z.datum_svatby).getMonth() + 1).padStart(2, "0")}.` : "—"}</div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{z.datum_svatby ? new Date(z.datum_svatby).getFullYear() : ""}</div>
          </div>
          {/* Names + address */}
          <div>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{z.jmeno_nevesty || "—"} & {z.jmeno_zenicha || "—"}</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 2 }}>{z.adresa_obradu || "—"}</div>
          </div>
          {/* Status */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 9px", borderRadius: 99, fontSize: 11.5, fontWeight: 500,
            background: WED_PILL[z.stav]?.bg ?? "#f2f1ec",
            color: WED_PILL[z.stav]?.color ?? "var(--ink-2)",
            whiteSpace: "nowrap",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor", opacity: .8 }} />
            {stavInfo(z.stav).label}
          </span>
          {/* Price */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, textAlign: "right" }}>
            {z.cena > 0
              ? <>{z.cena.toLocaleString("cs-CZ")} <span style={{ fontSize: 11, color: "var(--muted)" }}>Kč</span></>
              : <span style={{ color: "var(--muted)" }}>—</span>}
          </div>
          {/* Countdown */}
          {countdownDesktop()}
        </div>
      </Link>
    )
  }

  // ── ZakazkyBlok ─────────────────────────────────────────────────────────────
  function ZakazkyBlok({ titulek, dot, zakazky, vychozi = true }: { titulek: string; dot: string; zakazky: Zakazka[]; vychozi?: boolean }) {
    const [open, setOpen] = useState(vychozi)
    if (zakazky.length === 0) return null
    const sorted = [...zakazky].sort((a, b) => (a.datum_svatby || "").localeCompare(b.datum_svatby || ""))
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)", marginTop: 16 }}>
        <button onClick={() => setOpen(o => !o)} style={{ width: "100%", padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: dot }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{titulek}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", background: "rgba(20,20,30,.06)", padding: "2px 8px", borderRadius: 99 }}>{zakazky.length}</span>
          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12, transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .2s" }}>▾</span>
        </button>
        {open && <div style={{ borderTop: "1px solid var(--line)" }}>{sorted.map(z => <ZakazkaRadek key={z.id} z={z} />)}</div>}
      </div>
    )
  }

  // ── KPI computed values ──────────────────────────────────────────────────────
  const ROK = new Date().getFullYear()
  const letosConfirmed = letoscelkem.length
  const pristiDni = nadchazejici.length > 0
    ? Math.round((new Date(nadchazejici.sort((a, b) => a.datum_svatby.localeCompare(b.datum_svatby))[0]?.datum_svatby).getTime() - dnes.getTime()) / 86400000)
    : null
  const tentoMesic = potvrzeneSvatby.filter(z => z.datum_svatby && new Date(z.datum_svatby).getMonth() === new Date().getMonth() && new Date(z.datum_svatby).getFullYear() === ROK).length
  const cashflowYTD = potvrzeneSvatby.filter(z => z.datum_svatby && new Date(z.datum_svatby).getFullYear() === ROK).reduce((s, z) => s + (z.cena || 0), 0)

  // ── Heatmap data ─────────────────────────────────────────────────────────────
  const HM_DAYS = [5, 6, 0]
  const HM_DAY_LABELS = ["Pá", "So", "Ne"]
  const HM_MONTHS = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"]
  const hmGrid = HM_DAYS.map(dow =>
    HM_MONTHS.map((_, m) =>
      potvrzeneSvatby.filter(z => {
        if (!z.datum_svatby) return false
        const d = new Date(z.datum_svatby)
        return d.getMonth() === m && d.getDay() === dow
      }).length
    )
  )
  const hmMax = Math.max(...hmGrid.flat(), 1)

  // ── Kanban ───────────────────────────────────────────────────────────────────
  const KANBAN_COLS: { key: string; label: string; color: string; items: Zakazka[] }[] = [
    { key: "poptavka",   label: "Poptávka",  color: "#8b5cf6", items: zakazky.filter(z => ["poptavka", "rozhoduje-se"].includes(z.stav)) },
    { key: "potvrzeno",  label: "Potvrzeno", color: "#5b8def", items: zakazky.filter(z => ["objednavka", "cekam-platbu"].includes(z.stav)) },
    { key: "realizace",  label: "Realizace", color: "#ff4d7e", items: zakazky.filter(z => z.stav === "zaplaceno" && z.datum_svatby && new Date(z.datum_svatby) >= dnes) },
    { key: "sestrizani", label: "Sestřih",   color: "#f5a524", items: zakazky.filter(z => ["ve-strizne", "po-svatbe"].includes(z.stav) || (z.stav === "zaplaceno" && z.datum_svatby && new Date(z.datum_svatby) < dnes)) },
  ]

  // ── Upcoming filtered ────────────────────────────────────────────────────────
  const filteredUpcoming = (
    filter === "Vše" ? nadchazejici :
    filter === "Zaplaceno" ? nadchazejici.filter(z => z.stav === "zaplaceno") :
    filter === "Čeká" ? nadchazejici.filter(z => z.stav === "cekam-platbu") :
    nadchazejici
  ).sort((a, b) => a.datum_svatby.localeCompare(b.datum_svatby))

  return (
    <AppShell module="wed">
      <div style={{ padding: "22px 28px 60px" }}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 20, gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>
              Wedding Planner · Sezóna {new Date().getFullYear()}
            </div>
            <h1 style={{ fontFamily: "var(--font-serif), serif", fontStyle: "italic", fontSize: 34, lineHeight: 1.05, letterSpacing: "-.01em", color: "var(--ink)", margin: "4px 0 0" }}>
              Přehled <span style={{ fontStyle: "normal", fontFamily: "var(--font-sans)", color: "var(--muted)", fontWeight: 400 }}>/ Dashboard</span>
            </h1>
          </div>
        </div>

        {/* ── Stat grid — 6 per row on xl (2 × 6 = 12) ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatBox label="Letos celkem"           value={String(letosConfirmed)} />
          <StatBox label="Nadcházející svatby"    value={String(nadchazejici.length)} />
          <StatBox label="Realizováno svateb"     value={String(realizovano.length)} />
          <StatBox label="Čeká na sestřihání"     value={String(cekaNaSestrizani.length)} />
          <StatBox label="Celkem km (tam+zpět)"   value={celkemKm > 0 ? `${celkemKm.toLocaleString("cs-CZ")} km` : "—"} />
          <StatBox label="Celková doba jízdy"     value={celkovaCasJizdy} />
          <StatBox label="Již ujeto km"           value={ujetoKm > 0 ? `${ujetoKm.toLocaleString("cs-CZ")} km` : "0 km"} />
          <StatBox label="Zbývá ujet km"          value={`${zbyvaUjetKm.toLocaleString("cs-CZ")} km`} />
          <StatBox label="Celkem obrat"           value={celkemObrat > 0 ? formatCena(celkemObrat) : "—"} />
          <StatBox label="Uhrazené zálohy"        value={uhrazeneZalohy > 0 ? formatCena(uhrazeneZalohy) : "—"} />
          <StatBox label="Zbývá doplatit"         value={zbyvaDoplatit > 0 ? formatCena(zbyvaDoplatit) : "—"} />
          <StatBox label="Náklady na benzín"      value={nakladyBenzin ? formatCena(nakladyBenzin) : "—"} />
        </div>

        {/* ── Mapa + Kalendář ── */}
        <div className="mt-4 grid xl:grid-cols-2 gap-3">

          {/* Levý sloupec — Mapa */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Mapa obřadů</h3>
              <span style={{ color: "var(--muted)", fontSize: 12.5, marginLeft: 4 }}>{bodyNaMape.length} lokací v ČR</span>
            </div>
            <div style={{ padding: "18px 20px" }}>
              {!loading && <MapaDashboard body={bodyNaMape} />}
              {loading && <div style={{ height: 280, background: "#f4f3ee", borderRadius: 14, display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13 }}>Načítám…</div>}
            </div>
          </div>

          {/* Pravý sloupec — Kalendář (aktuální + 2 měsíce) */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Kalendář</h3>
              <span style={{ color: "var(--muted)", fontSize: 12.5, marginLeft: 4 }}>3 měsíce</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--wed-grad-a, #f43f5e)", display: "inline-block" }} />
                svatba
              </span>
            </div>
            <div style={{ padding: "20px 22px", flex: 1, display: "flex", alignItems: "stretch" }}>
              <MiniKalendar zakazky={potvrzeneSvatby} />
            </div>
          </div>

        </div>

        {/* ── Upcoming list ── */}
        <div style={{ marginTop: 16 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)" }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Nadcházející svatby</h3>
              <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{filteredUpcoming.length} z {nadchazejici.length}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["Vše", "Zaplaceno", "Čeká"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    style={{
                      padding: "4px 10px", borderRadius: 99, fontSize: 11.5, cursor: "pointer",
                      background: filter === f ? "var(--ink)" : "#f2f1ec",
                      color: filter === f ? "white" : "var(--ink-2)",
                      border: "none", fontFamily: "inherit",
                    }}>{f}</button>
                ))}
              </div>
            </div>
            {filteredUpcoming.map(z => <ZakazkaRadek key={z.id} z={z} />)}
            {filteredUpcoming.length === 0 && (
              <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Žádné záznamy</div>
            )}
          </div>
        </div>

        {/* ── Realizované — čeká odevzdání ── */}
        <ZakazkyBlok
          titulek="Realizované — čeká odevzdání"
          dot="#fb923c"
          zakazky={realizovaneNeodevzdane}
          vychozi={true}
        />

        {/* ── Realizované — odevzdáno ── */}
        <ZakazkyBlok
          titulek="Realizované — odevzdáno"
          dot="#4ade80"
          zakazky={realizovaneOdevzdane}
          vychozi={false}
        />

        {/* ── Probíhá jednání ── */}
        <ZakazkyBlok
          titulek="Probíhá jednání"
          dot="#fbbf24"
          zakazky={probihaJednani}
          vychozi={false}
        />

        {/* ── Vyplněná objednávka ── */}
        <ZakazkyBlok
          titulek="Vyplněná objednávka"
          dot="#60a5fa"
          zakazky={vyplnenaObjednavka}
          vychozi={true}
        />

        {/* Error state */}
        {chyba && (
          <div style={{ marginTop: 16, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--radius-lg)", padding: "16px 20px", fontSize: 13, color: "#991b1b", wordBreak: "break-all" }}>
            <strong>Chyba připojení k databázi:</strong><br />{chyba}
          </div>
        )}

      </div>
    </AppShell>
  )
}
