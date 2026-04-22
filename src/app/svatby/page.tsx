"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import MapaDashboard from "@/components/MapaDashboard"

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

export default function Home() {
  const router = useRouter()
  const [zakazky, setZakazky] = useState<Zakazka[]>([])
  const [loading, setLoading] = useState(true)
  const [chyba, setChyba] = useState<string | null>(null)
  const [statRozsireno, setStatRozsireno] = useState(false)
  const [cenaBenzinu, setCenaBenzinu] = useState<number | null>(null)

  async function odhlasit() {
    const client = createClient()
    await client.auth.signOut()
    router.push("/login")
    router.refresh()
  }

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
      // Načti aktuální cenu benzínu pro uložení ke svatbám
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

  // Stavy které se nezapočítávají do statistik ani mapy
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
    const d = new Date(z.datum_svatby); d.setHours(0,0,0,0)
    return d >= dnes && z.stav === "zaplaceno"
  })

  const realizovaneNeodevzdane = potvrzeneSvatby.filter(z => {
    if (!z.datum_svatby) return false
    const d = new Date(z.datum_svatby); d.setHours(0,0,0,0)
    return d < dnes && !z.vystup_odevzdan
  })

  const realizovaneOdevzdane = potvrzeneSvatby.filter(z => {
    if (!z.datum_svatby) return false
    const d = new Date(z.datum_svatby); d.setHours(0,0,0,0)
    return d < dnes && z.vystup_odevzdan
  })

  const letoscelkem = potvrzeneSvatby.filter(z => z.datum_svatby && new Date(z.datum_svatby).getFullYear() === new Date().getFullYear())

  // Řádek 1
  const realizovano = potvrzeneSvatby.filter(z => {
    if (!z.datum_svatby) return false
    const d = new Date(z.datum_svatby); d.setHours(0, 0, 0, 0)
    return d < dnes
  })
  const cekaNaSestrizani = potvrzeneSvatby.filter(z => ["ve-strizne", "po-svatbe"].includes(z.stav) && !z.vystup_odevzdan)

  // Řádek 2
  const celkemKm = Math.round(potvrzeneSvatby.reduce((sum, z) => sum + (z.vzdalenost_km ? z.vzdalenost_km * 2 : 0), 0))
  const ujetoKm = Math.round(potvrzeneSvatby.filter(z => {
    if (!z.datum_svatby) return false
    const d = new Date(z.datum_svatby); d.setHours(0, 0, 0, 0)
    return d < dnes
  }).reduce((sum, z) => sum + (z.vzdalenost_km ? z.vzdalenost_km * 2 : 0), 0))
  const zbyvaUjetKm = celkemKm - ujetoKm
  const celkovaCasJizdy = celkemKm > 0 ? `${Math.ceil(celkemKm / 80)} h` : "—"

  // Řádek 3
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

  function ZakazkaRadek({ z }: { z: Zakazka }) {
    const svatba = z.datum_svatby ? new Date(z.datum_svatby) : null
    if (svatba) svatba.setHours(0, 0, 0, 0)
    const dniDo = svatba ? Math.round((svatba.getTime() - dnes.getTime()) / (1000 * 60 * 60 * 24)) : null
    const probehlo = dniDo !== null && dniDo < 0

    // Countdown pro desktop (velký, víceřádkový)
    function countdownDesktop() {
      if (dniDo === null) return <span className="text-gray-300 text-sm">—</span>
      if (dniDo === 0) return <span className="text-sm font-bold text-rose-500">Dnes!</span>
      if (probehlo && z.vystup_odevzdan) return (
        <button
          onClick={(e) => toggleOdevzdani(e, z.id, z.vystup_odevzdan)}
          className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
        >
          ✓ Odevzdáno
        </button>
      )
      if (probehlo && !z.vystup_odevzdan) {
        const zbyvaDni = deadlineDni(z.datum_svatby, z.rychlost_dodani)
        const barva = zbyvaDni !== null && zbyvaDni <= 3 ? "text-red-500" : "text-orange-500"
        return (
          <div className="flex flex-col items-center">
            <span className="text-xs text-gray-400">Odevzdat do</span>
            <span className={`text-2xl font-bold leading-none mt-0.5 ${barva}`}>
              {zbyvaDni !== null ? (zbyvaDni <= 0 ? "!" : zbyvaDni) : "—"}
            </span>
            <span className="text-xs text-gray-400">{zbyvaDni !== null && zbyvaDni <= 0 ? "Po termínu" : "dní"}</span>
          </div>
        )
      }
      return (
        <>
          <span className="text-xs text-gray-400">Do svatby</span>
          <span className="text-2xl font-bold text-rose-500 leading-none mt-0.5">{dniDo}</span>
          <span className="text-xs text-gray-400">dní</span>
        </>
      )
    }

    // Barva levého okraje podle stavu
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
    const borderColor = STAV_BORDER[z.stav] ?? "#9ca3af"

    // Countdown pro mobil (kompaktní pill)
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

    const cdMobile = countdownMobile()

    return (
      <Link href={`/svatby/zakazky/${z.id}`} className="block hover:bg-gray-50 transition-colors">

        {/* ── Mobilní karta ── */}
        <div className="flex flex-col pl-4 pr-4 py-3.5 gap-1.5 md:hidden border-l-4" style={{ borderColor }}>
          {/* Řádek 1: jména + stav */}
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 flex-1 truncate text-sm">
              {z.jmeno_nevesty || "—"} & {z.jmeno_zenicha || "—"}
            </p>
            <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${stavInfo(z.stav).barva}`}>
              {stavInfo(z.stav).label}
            </span>
          </div>
          {/* Řádek 2: datum + adresa + videohovor */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="font-medium text-gray-700 shrink-0">
              {z.datum_svatby
                ? `${String(new Date(z.datum_svatby).getDate()).padStart(2, "0")}.${String(new Date(z.datum_svatby).getMonth() + 1).padStart(2, "0")}. ${new Date(z.datum_svatby).getFullYear()}`
                : "—"}
            </span>
            {z.adresa_obradu && <><span className="text-gray-300">·</span><span className="truncate">{z.adresa_obradu}</span></>}
            {z.videohovor_datum && <span className="shrink-0">📹</span>}
          </div>
          {/* Řádek 3: typ + cena + countdown */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>{typLabel(z.typ_sluzby)}</span>
            {z.cena > 0 && <><span className="text-gray-300">·</span><span className="font-semibold text-gray-700">{formatCena(z.cena)}</span></>}
            {cdMobile && <span className="ml-auto">{cdMobile}</span>}
          </div>
        </div>

        {/* ── Desktopový řádek ── */}
        <div className="hidden md:flex items-stretch">

          {/* Datum */}
          <div className="flex flex-col items-center justify-center px-5 py-4 border-r border-gray-100 min-w-[60px]">
            {z.datum_svatby ? (
              <>
                <span className="text-lg font-bold text-gray-900 leading-none">
                  {String(new Date(z.datum_svatby).getDate()).padStart(2, "0")}.{String(new Date(z.datum_svatby).getMonth() + 1).padStart(2, "0")}.
                </span>
                <span className="text-sm text-gray-400 mt-0.5">{new Date(z.datum_svatby).getFullYear()}</span>
              </>
            ) : <span className="text-gray-300">—</span>}
          </div>

          {/* Jména + adresa */}
          <div className="flex-1 px-5 py-4 flex flex-col justify-center min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {z.jmeno_nevesty || "—"} & {z.jmeno_zenicha || "—"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{z.adresa_obradu || "—"}</p>
          </div>

          {/* Videohovor */}
          <div className="flex flex-col items-center justify-center py-4 border-l border-gray-100" style={{ width: 44, minWidth: 44 }}>
            {z.videohovor_datum && (
              <span
                title={`Videohovor: ${new Date(z.videohovor_datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}`}
                className="text-lg leading-none"
              >
                📹
              </span>
            )}
          </div>

          {/* Stav */}
          <div className="flex flex-col items-center justify-center px-4 py-4 border-l border-gray-100">
            <span className={`text-xs font-medium px-2 py-1.5 rounded-lg whitespace-nowrap ${stavInfo(z.stav).barva}`}>
              {stavInfo(z.stav).label}
            </span>
          </div>

          {/* Cena + typ */}
          <div className="flex flex-col items-end justify-center px-5 py-4 border-l border-gray-100 min-w-[120px]">
            <p className="font-semibold text-gray-900 text-sm">{formatCena(z.cena)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{typLabel(z.typ_sluzby)}</p>
          </div>

          {/* Countdown */}
          <div className="flex flex-col items-center justify-center px-4 py-4 border-l border-gray-100 min-w-[90px]">
            {countdownDesktop()}
          </div>

        </div>

      </Link>
    )
  }

  function Blok({ titulek, barva, zakazky, vychozi = true }: {
    titulek: string
    barva: string
    zakazky: Zakazka[]
    vychozi?: boolean
  }) {
    const [otevreno, setOtevreno] = useState(vychozi)
    if (zakazky.length === 0) return null
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <button
          onClick={() => setOtevreno(o => !o)}
          className="w-full p-4 flex items-center gap-2 hover:bg-gray-50 transition-colors rounded-xl"
        >
          <span className={`w-2.5 h-2.5 rounded-full ${barva}`} />
          <h2 className="font-semibold text-gray-900">{titulek}</h2>
          <span className="text-sm text-gray-400">{zakazky.length}</span>
          <span className={`ml-auto text-gray-400 transition-transform duration-200 ${otevreno ? "rotate-0" : "-rotate-90"}`}>
            ▾
          </span>
        </button>
        {otevreno && (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {zakazky.map(z => <ZakazkaRadek key={z.id} z={z} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hlavička */}
      <div className="w-full bg-sky-100 py-6">
        <div className="max-w-4xl mx-auto px-4 md:px-8 relative flex items-center justify-center">
          <a href="/" className="absolute left-0 text-xs text-sky-600 hover:text-sky-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-sky-200">
            ← Rozcestník
          </a>
          <h1 className="text-3xl font-bold text-sky-900 tracking-wide">Wedding Planner</h1>
          <button
            onClick={odhlasit}
            className="absolute right-0 text-xs text-sky-600 hover:text-sky-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-sky-200"
          >
            Odhlásit
          </button>
        </div>
      </div>

      {/* Navigační tlačítka */}
      <div className="max-w-4xl mx-auto px-4 py-5 flex gap-2 mb-3 justify-center">

        {/* Nová zakázka */}
        <Link href="/svatby/zakazky/nova" className="bg-rose-500 hover:bg-rose-600 text-white font-medium transition-colors rounded-lg flex items-center justify-center gap-2 px-5 py-2.5 md:w-auto w-12 h-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden md:inline whitespace-nowrap">Nová zakázka</span>
        </Link>

        {/* Seznam svateb */}
        <Link href="/svatby/seznam" className="bg-white hover:bg-gray-50 text-gray-700 font-medium border border-gray-200 transition-colors rounded-lg flex items-center justify-center gap-2 px-5 py-2.5 md:w-auto w-12 h-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <span className="hidden md:inline whitespace-nowrap">Seznam svateb</span>
        </Link>

        {/* Svatební statistiky */}
        <button className="bg-white hover:bg-gray-50 text-gray-700 font-medium border border-gray-200 transition-colors rounded-lg flex items-center justify-center gap-2 px-5 py-2.5 md:w-auto w-12 h-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <span className="hidden md:inline whitespace-nowrap">Statistiky</span>
        </button>

        {/* Kalendář */}
        <Link href="/svatby/kalendar" className="bg-white hover:bg-gray-50 text-gray-700 font-medium border border-gray-200 transition-colors rounded-lg flex items-center justify-center gap-2 px-5 py-2.5 md:w-auto w-12 h-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="hidden md:inline whitespace-nowrap">Kalendář</span>
        </Link>

        {/* Rozbalit statistiky */}
        <button
          onClick={() => setStatRozsireno(p => !p)}
          className="w-12 h-12 flex items-center justify-center rounded-lg border border-rose-200 bg-white hover:bg-rose-50 transition-colors shrink-0"
          title={statRozsireno ? "Skrýt statistiky" : "Ukázat více statistik"}
        >
          <span className={`text-rose-500 text-base font-bold transition-transform duration-200 inline-block ${statRozsireno ? "rotate-180" : ""}`}>▼</span>
        </button>

      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-8">

        {/* Statistiky */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
          <StatBox label="Letos celkem" value={loading ? "—" : String(letoscelkem.length)} />
          <StatBox label="Nadcházející svatby" value={loading ? "—" : String(nadchazejici.length)} />
          <StatBox label="Realizováno svateb" value={loading ? "—" : String(realizovano.length)} />
          <StatBox label="Čeká na sestřihání" value={loading ? "—" : String(cekaNaSestrizani.length)} />
        </div>

        {statRozsireno && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
            <StatBox label="Celkem km (tam+zpět)" value={loading ? "—" : `${celkemKm.toLocaleString("cs-CZ")} km`} />
            <StatBox label="Celková doba jízdy" value={loading ? "—" : celkovaCasJizdy} />
            <StatBox label="Již ujeto km" value={loading ? "—" : `${ujetoKm.toLocaleString("cs-CZ")} km`} />
            <StatBox label="Zbývá ujet km" value={loading ? "—" : `${zbyvaUjetKm.toLocaleString("cs-CZ")} km`} />

            <StatBox label="Celkem obrat" value={loading ? "—" : `${celkemObrat.toLocaleString("cs-CZ")} Kč`} />
            <StatBox label="Uhrazené zálohy" value={loading ? "—" : `${uhrazeneZalohy.toLocaleString("cs-CZ")} Kč`} />
            <StatBox label="Zbývá doplatit" value={loading ? "—" : `${zbyvaDoplatit.toLocaleString("cs-CZ")} Kč`} />
            <StatBox label="Náklady na benzín" value={nakladyBenzin ? `${nakladyBenzin.toLocaleString("cs-CZ")} Kč` : "—"} />
          </div>
        )}

        <div className="mb-8" />

        {/* Mapa */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">Mapa obřadů</h2>
          {!loading && <MapaDashboard body={bodyNaMape} />}
          {loading && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm" style={{ height: 420 }}>
              Načítám...
            </div>
          )}
        </div>

        {/* Tři bloky zakázek */}
        {chyba && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-5 text-sm text-red-800 break-all">
            <strong>Chyba připojení k databázi:</strong><br />{chyba}
          </div>
        )}
        {loading && !chyba && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center text-gray-400">
            Načítám...
          </div>
        )}

        {!loading && zakazky.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
            Zatím žádné zakázky. Přidej první kliknutím na „+ Nová zakázka".
          </div>
        )}

        {!loading && (
          <>
            <Blok titulek="Probíhá jednání" barva="bg-yellow-400" zakazky={probihaJednani} vychozi={false} />
            <Blok titulek="Vyplněná objednávka" barva="bg-blue-400" zakazky={vyplnenaObjednavka} />
            <Blok titulek="Nadcházející svatby" barva="bg-rose-400" zakazky={nadchazejici} />
            <Blok titulek="Realizované — čeká na odevzdání" barva="bg-orange-400" zakazky={realizovaneNeodevzdane} />
            <Blok titulek="Realizované — výstup odevzdán" barva="bg-green-400" zakazky={realizovaneOdevzdane} />
          </>
        )}

      </div>
    </main>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  )
}
