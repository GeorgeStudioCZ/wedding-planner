"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import MapaTrasy from "@/components/MapaTrasy"

function PotvrzeniSmazani({ jmena, onPotvrdit, onZrusit }: {
  jmena: string
  onPotvrdit: () => void
  onZrusit: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Smazat zakázku?</h3>
        <p className="text-gray-500 text-sm mb-6">
          Opravdu chceš smazat zakázku <strong>{jmena}</strong>? Tato akce je nevratná.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onPotvrdit}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg font-medium transition-colors"
          >
            Smazat
          </button>
          <button
            onClick={onZrusit}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors"
          >
            Zrušit
          </button>
        </div>
      </div>
    </div>
  )
}

type Zakaznik = {
  id: number
  jmeno: string
  prijmeni: string
  telefon: string
  email: string
  ulice: string
  mesto: string
  psc: string
}

type Zakazka = {
  id: string
  created_at: string
  jmeno_nevesty: string
  jmeno_zenicha: string
  fakturacni_adresa: string
  telefon: string
  email: string
  zakaznik_id: number | null
  zakaznici: Zakaznik | null
  datum_svatby: string
  cas_obradu: string
  cas_prijezdu: string
  typ_sluzby: string
  balicek: string
  cena: number
  pocet_svatebcanu: number
  adresa_pripravy: string
  adresa_obradu: string
  adresa_veseli: string
  nazev_objektu: string
  rychlost_dodani: string
  socialni_site: string
  druhy_kameraman: string
  poznamky: string
  foto_url: string
  vzdalenost_km: number | null
  vystup_odevzdan: boolean
  datum_odevzdani: string | null
  stav: string
  cena_benzinu: number | null
  dalsi_info: string
  videohovor_datum: string | null
}

export default function DetailZakazky() {
  const router = useRouter()
  const params = useParams()
  const [zakazka, setZakazka] = useState<Zakazka | null>(null)
  const [loading, setLoading] = useState(true)
  const [mazani, setMazani] = useState(false)
  const [historie, setHistorie] = useState<{ id: string; created_at: string; stav: string }[]>([])

  async function toggleOdevzdani() {
    if (!zakazka) return
    const novy = !zakazka.vystup_odevzdan
    const cas = novy ? new Date().toISOString() : null
    await supabase.from("zakazky").update({ vystup_odevzdan: novy, datum_odevzdani: cas }).eq("id", zakazka.id)
    await supabase.from("zakazky_historie").insert([{
      zakazka_id: zakazka.id,
      stav: novy ? "vystup-odevzdan" : "vystup-odebran",
    }])
    setZakazka({ ...zakazka, vystup_odevzdan: novy, datum_odevzdani: cas })
    nactiHistorii()
  }

  async function ulozVideohovor(datum: string | null) {
    if (!zakazka) return
    const { error } = await supabase.from("zakazky").update({ videohovor_datum: datum }).eq("id", zakazka.id)
    if (error) {
      alert("Chyba při ukládání: " + error.message)
      return
    }
    await supabase.from("zakazky_historie").insert([{
      zakazka_id: zakazka.id,
      stav: datum ? `videohovor-probeh: ${datum}` : "videohovor-zrusen",
    }])
    setZakazka({ ...zakazka, videohovor_datum: datum })
    nactiHistorii()
  }

  async function zmenStav(novyStav: string) {
    if (!zakazka || novyStav === zakazka.stav) return
    await supabase.from("zakazky").update({ stav: novyStav }).eq("id", zakazka.id)
    await supabase.from("zakazky_historie").insert([{ zakazka_id: zakazka.id, stav: novyStav }])
    setZakazka({ ...zakazka, stav: novyStav })
    nactiHistorii()
  }

  async function smazatZakazku() {
    await supabase.from("zakazky").delete().eq("id", params.id)
    router.push("/svatby")
  }

  async function nactiHistorii() {
    const { data } = await supabase
      .from("zakazky_historie")
      .select("id, created_at, stav")
      .eq("zakazka_id", params.id)
      .order("created_at", { ascending: false })
    setHistorie(data ?? [])
  }

  useEffect(() => {
    async function nacti() {
      const { data } = await supabase
        .from("zakazky")
        .select("*, zakaznici(*)")
        .eq("id", params.id)
        .single()
      setZakazka(data)
      setLoading(false)
    }
    nacti()
    nactiHistorii()
  }, [params.id])

  function formatDatum(datum: string) {
    if (!datum) return "—"
    return new Date(datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
  }

  function formatCas(cas: string) {
    if (!cas) return "—"
    return cas.slice(0, 5)
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

  function balicekLabel(b: string) {
    const map: Record<string, string> = {
      "pul-den-6": "Půl den (6 hod)",
      "pul-den": "Půl den (8 hod)",
      "cely-den": "Celý den (10 hod)",
      "do-vecera": "Do večera (12 hod)",
    }
    return map[b] ?? b ?? "—"
  }

  function dodaniLabel(d: string) {
    const map: Record<string, string> = {
      "60-dnu": "Výchozí 60 dní",
      "14-dnu": "Do 14 dní",
      "7-dnu": "Do 7 dní",
      "72-hodin": "Do 72 hodin",
    }
    return map[d] ?? d ?? "—"
  }

  const STAVY: { value: string; label: string; barva: string }[] = [
    { value: "poptavka",     label: "Poptávka",      barva: "bg-gray-100 text-gray-600" },
    { value: "rozhoduje-se", label: "Rozhoduje se",  barva: "bg-yellow-100 text-yellow-700" },
    { value: "objednavka",   label: "Objednávka",    barva: "bg-blue-100 text-blue-700" },
    { value: "cekam-platbu", label: "Čekám platbu",  barva: "bg-orange-100 text-orange-700" },
    { value: "zaplaceno",    label: "Zaplaceno",     barva: "bg-green-100 text-green-700" },
    { value: "ve-strizne",   label: "Ve střižně",    barva: "bg-purple-100 text-purple-700" },
    { value: "po-svatbe",        label: "Po svatbě",          barva: "bg-sky-100 text-sky-700" },
    { value: "ukonceno",        label: "Ukončeno",           barva: "bg-slate-100 text-slate-500" },
    { value: "vystup-odevzdan", label: "Výstup odevzdán",    barva: "bg-green-100 text-green-700" },
    { value: "vystup-odebran",  label: "Odevzdání odebráno", barva: "bg-gray-100 text-gray-500" },
  ]

  function stavInfo(stav: string) {
    return STAVY.find(s => s.value === stav) ?? STAVY[0]
  }

  function zbyvaKdni(datum: string): string {
    if (!datum) return "—"
    const dnes = new Date()
    dnes.setHours(0, 0, 0, 0)
    const svatba = new Date(datum)
    svatba.setHours(0, 0, 0, 0)
    const diff = Math.round((svatba.getTime() - dnes.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return "Proběhlo"
    if (diff === 0) return "Dnes!"
    if (diff === 1) return "Zítra!"
    return `${diff} dní`
  }

  function historieInfo(stav: string): { label: string; barva: string } {
    if (stav.startsWith("videohovor-probeh:")) {
      const datum = stav.replace("videohovor-probeh:", "").trim()
      const formatted = datum ? new Date(datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" }) : ""
      return { label: `📹 Videohovor proběhl${formatted ? ` (${formatted})` : ""}`, barva: "bg-sky-100 text-sky-700" }
    }
    if (stav === "videohovor-zrusen") {
      return { label: "📹 Videohovor zrušen", barva: "bg-gray-100 text-gray-500" }
    }
    if (stav === "vystup-odevzdan") return { label: "✓ Výstup odevzdán", barva: "bg-green-100 text-green-700" }
    if (stav === "vystup-odebran") return { label: "Výstup odebrán", barva: "bg-gray-100 text-gray-500" }
    return stavInfo(stav)
  }

  function mestoPodleAdresy(adresa: string): string {
    if (!adresa) return "—"
    const casti = adresa.split(",").map(s => s.trim())
    return casti[casti.length - 1] || "—"
  }

  function stahnoutKontakt() {
    if (!zakazka) return
    const jmeno = zakazka.jmeno_nevesty || "Nevěsta"
    const casti = jmeno.trim().split(" ")
    const prijmeni = casti.length > 1 ? casti[casti.length - 1] : ""
    const krestni = casti.length > 1 ? casti.slice(0, -1).join(" ") : jmeno
    const telefon = zakazka.zakaznici?.telefon || zakazka.telefon
    const email = zakazka.zakaznici?.email || zakazka.email
    const tel = telefon ? telefon.replace(/\s/g, "") : ""
    const poznamka = `Nevěsta – svatba ${formatDatum(zakazka.datum_svatby)}`
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${jmeno}`,
      `N:${prijmeni};${krestni};;;`,
      tel ? `TEL;TYPE=CELL:${tel}` : "",
      email ? `EMAIL:${email}` : "",
      `NOTE:${poznamka}`,
      "END:VCARD",
    ].filter(Boolean).join("\r\n")
    const blob = new Blob([vcf], { type: "text/vcard" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${jmeno.replace(/\s+/g, "_")}.vcf`
    a.click()
    URL.revokeObjectURL(url)
  }

  function googleKalendarUrl(): string {
    if (!zakazka?.datum_svatby) return ""
    const d = zakazka.datum_svatby.replace(/-/g, "")
    let dates: string
    if (zakazka.cas_prijezdu) {
      const cas = zakazka.cas_prijezdu.slice(0, 5).replace(":", "")
      // Délka události dle balíčku
      const delkyMap: Record<string, number> = {
        "pul-den-6": 6, "pul-den": 8, "cely-den": 10, "do-vecera": 12,
      }
      const delka = delkyMap[zakazka.balicek] ?? 8
      const startH = parseInt(zakazka.cas_prijezdu.slice(0, 2))
      const startM = parseInt(zakazka.cas_prijezdu.slice(3, 5))
      const endMin = startH * 60 + startM + delka * 60
      const endH = Math.floor(endMin / 60) % 24
      const endMm = endMin % 60
      const endStr = String(endH).padStart(2, "0") + String(endMm).padStart(2, "0")
      dates = `${d}T${cas}00/${d}T${endStr}00`
    } else if (zakazka.cas_obradu) {
      const cas = zakazka.cas_obradu.slice(0, 5).replace(":", "")
      const delkyMap: Record<string, number> = {
        "pul-den-6": 6, "pul-den": 8, "cely-den": 10, "do-vecera": 12,
      }
      const delka = delkyMap[zakazka.balicek] ?? 8
      const startH = parseInt(zakazka.cas_obradu.slice(0, 2))
      const startM = parseInt(zakazka.cas_obradu.slice(3, 5))
      const endMin = startH * 60 + startM + delka * 60
      const endH = Math.floor(endMin / 60) % 24
      const endMm = endMin % 60
      const endStr = String(endH).padStart(2, "0") + String(endMm).padStart(2, "0")
      dates = `${d}T${cas}00/${d}T${endStr}00`
    } else {
      // Celý den
      const nextDay = new Date(zakazka.datum_svatby)
      nextDay.setDate(nextDay.getDate() + 1)
      const nd = nextDay.toISOString().slice(0, 10).replace(/-/g, "")
      dates = `${d}/${nd}`
    }
    const title = encodeURIComponent(`Natáčení svatby - ${zakazka.jmeno_nevesty}`)
    const location = encodeURIComponent([zakazka.nazev_objektu, zakazka.adresa_obradu].filter(Boolean).join(", "))
    const details = encodeURIComponent([
      zakazka.typ_sluzby ? `Služba: ${typLabel(zakazka.typ_sluzby)}` : "",
      zakazka.balicek ? `Balíček: ${balicekLabel(zakazka.balicek)}` : "",
      zakazka.cas_prijezdu ? `Příjezd: ${zakazka.cas_prijezdu.slice(0, 5)}` : "",
    ].filter(Boolean).join("\n"))
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&location=${location}&details=${details}`
  }

  if (loading) {
    return <main className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Načítám...</main>
  }

  if (!zakazka) {
    return <main className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Zakázka nenalezena.</main>
  }

  return (
    <main className="min-h-screen bg-gray-50">

      {/* Titulní fotka */}
      {zakazka.foto_url && (
        <div className="max-w-4xl mx-auto px-8 pt-8">
          <div className="h-64 md:h-80 overflow-hidden bg-gray-200 relative rounded-xl">
          <img
            src={zakazka.foto_url}
            alt={`${zakazka.jmeno_nevesty} & ${zakazka.jmeno_zenicha}`}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">

            {/* Datum nad jmény */}
            <p className="text-sm font-semibold text-white/80 tracking-widest uppercase mb-3 drop-shadow">
              {formatDatum(zakazka.datum_svatby)}
            </p>

            {/* Jména */}
            <h1 className="text-3xl md:text-4xl font-bold text-white drop-shadow-lg tracking-wide text-center flex flex-col items-center gap-1">
              <span>{zakazka.jmeno_nevesty || "—"}</span>
              <span>{zakazka.jmeno_zenicha || "—"}</span>
            </h1>

            {/* Šedé boxy s info */}
            <div className="flex flex-wrap justify-center gap-3 mt-5">
              <span className="bg-white/20 backdrop-blur-sm text-white text-base font-semibold px-6 py-3 rounded-full">
                {typLabel(zakazka.typ_sluzby)}
              </span>
              <span className="bg-white/20 backdrop-blur-sm text-white text-base font-semibold px-6 py-3 rounded-full">
                ⏳ {zbyvaKdni(zakazka.datum_svatby)}
              </span>
              {zakazka.vzdalenost_km && (
                <span className="bg-white/20 backdrop-blur-sm text-white text-base font-semibold px-6 py-3 rounded-full">
                  🚗 {zakazka.vzdalenost_km} km
                </span>
              )}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Hlavička bez fotky */}
      {!zakazka.foto_url && (
        <div className="w-full bg-sky-100 py-6 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs font-semibold text-sky-500 tracking-widest uppercase mb-2">
              {formatDatum(zakazka.datum_svatby)}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-sky-900 flex flex-col items-center gap-0.5">
              <span>{zakazka.jmeno_nevesty || "—"}</span>
              <span>{zakazka.jmeno_zenicha || "—"}</span>
            </h1>
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {zakazka.typ_sluzby && (
                <span className="bg-sky-200/60 text-sky-800 text-sm font-medium px-4 py-1.5 rounded-full">
                  {typLabel(zakazka.typ_sluzby)}
                </span>
              )}
              {zakazka.datum_svatby && (
                <span className="bg-sky-200/60 text-sky-800 text-sm font-medium px-4 py-1.5 rounded-full">
                  ⏳ {zbyvaKdni(zakazka.datum_svatby)}
                </span>
              )}
              {zakazka.vzdalenost_km && (
                <span className="bg-sky-200/60 text-sky-800 text-sm font-medium px-4 py-1.5 rounded-full">
                  🚗 {zakazka.vzdalenost_km} km
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto p-8">

        {/* Hlavička — navigace a akce */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.push("/svatby")} className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
            ← Zpět
          </button>
          <div className="flex-1" />
          <select
            value={zakazka.stav ?? "poptavka"}
            onChange={(e) => zmenStav(e.target.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-200 ${stavInfo(zakazka.stav).barva}`}
          >
            {STAVY.filter(s => !["vystup-odevzdan", "vystup-odebran"].includes(s.value)).map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={toggleOdevzdani}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              zakazka.vystup_odevzdan
                ? "bg-green-100 hover:bg-green-200 text-green-700"
                : "bg-orange-100 hover:bg-orange-200 text-orange-700"
            }`}
          >
            {zakazka.vystup_odevzdan ? "✓ Odevzdáno" : "Odevzdat"}
          </button>
          {zakazka.jmeno_nevesty && (
            <button
              onClick={stahnoutKontakt}
              className="w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
              title="Stáhnout kontakt nevěsty"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          )}
          {zakazka.datum_svatby && (
            <a
              href={googleKalendarUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
              title="Zapsat do Google Kalendáře"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </a>
          )}
          <button
            onClick={() => router.push(`/svatby/zakazky/${zakazka.id}/edit`)}
            className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            title="Upravit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setMazani(true)}
            className="w-10 h-10 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
            title="Smazat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {mazani && (
          <PotvrzeniSmazani
            jmena={`${zakazka.jmeno_nevesty} & ${zakazka.jmeno_zenicha}`}
            onPotvrdit={smazatZakazku}
            onZrusit={() => setMazani(false)}
          />
        )}

        <div className="space-y-6">


          {/* Klient */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Klient</h2>
              {zakazka.zakaznici && (
                <a href="/zakaznici" className="text-xs text-rose-500 hover:text-rose-600 transition-colors">
                  Centrální databáze →
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <Row label="Nevěsta" value={zakazka.jmeno_nevesty} />
              <Row label="Ženich" value={zakazka.jmeno_zenicha} />
              <Row label="Telefon" value={zakazka.zakaznici?.telefon || zakazka.telefon} />
              <Row label="E-mail" value={zakazka.zakaznici?.email || zakazka.email} />
              <div className="col-span-2">
                <Row label="Fakturační adresa" value={
                  zakazka.zakaznici
                    ? [zakazka.zakaznici.ulice, zakazka.zakaznici.psc, zakazka.zakaznici.mesto].filter(Boolean).join(", ") || zakazka.fakturacni_adresa
                    : zakazka.fakturacni_adresa
                } />
              </div>
            </div>
          </section>

          {/* Datum a čas */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Info o svatbě</h2>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <Row label="Datum svatby" value={formatDatum(zakazka.datum_svatby)} />
              <Row label="Čas obřadu" value={formatCas(zakazka.cas_obradu)} />
              <Row label="Čas příjezdu" value={formatCas(zakazka.cas_prijezdu)} />
              <Row label="Počet svatebčanů" value={zakazka.pocet_svatebcanu ? String(zakazka.pocet_svatebcanu) : "—"} />
            </div>
          </section>

          {/* Předsvatební videohovor */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Předsvatební videohovor</h2>
            {zakazka.videohovor_datum ? (
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-2 text-green-700 font-medium text-sm">
                  <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-xs">✓</span>
                  Proběhl {new Date(zakazka.videohovor_datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}
                </span>
                <input
                  type="date"
                  value={zakazka.videohovor_datum}
                  onChange={e => ulozVideohovor(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
                <button
                  onClick={() => ulozVideohovor(null)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Zrušit
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">Zatím neproběhl</span>
                <button
                  onClick={() => ulozVideohovor(new Date().toISOString().slice(0, 10))}
                  className="bg-sky-50 hover:bg-sky-100 text-sky-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Označit jako proběhlý dnes
                </button>
                <input
                  type="date"
                  onChange={e => { if (e.target.value) ulozVideohovor(e.target.value) }}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="Jiné datum"
                />
              </div>
            )}
          </section>

          {/* Služba a doplňky */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Služba a doplňky</h2>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <Row label="Typ služby" value={typLabel(zakazka.typ_sluzby)} />
              <Row label="Balíček" value={balicekLabel(zakazka.balicek)} />
              <Row label="Rychlost dodání" value={dodaniLabel(zakazka.rychlost_dodani)} />
              <Row label="Videa pro soc. sítě" value={
                zakazka.socialni_site === "ne" ? "Ne" :
                zakazka.socialni_site === "1x-reels" ? "1x reels 20s (+690 Kč)" :
                zakazka.socialni_site === "2x-reels" ? "2x reels 20s (+1 180 Kč)" :
                zakazka.socialni_site === "3x-reels" ? "3x reels 20s (+1 470 Kč)" :
                zakazka.socialni_site === "ano" ? "Ano" : "—"
              } />
              <Row label="2. kameraman/fotograf" value={zakazka.druhy_kameraman === "ano" ? "Ano" : zakazka.druhy_kameraman === "ne" ? "Ne" : "—"} />
            </div>
          </section>

          {/* Finance */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Finance</h2>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <Row label="Cena s DPH" value={formatCena(zakazka.cena)} />
              <Row label="Rezervační poplatek" value="2 900 Kč" />
              {zakazka.cena_benzinu && (
                <Row label="Cena benzínu ke dni svatby" value={`${zakazka.cena_benzinu.toFixed(2).replace(".", ",")} Kč/l`} />
              )}
            </div>
          </section>

          {/* Místa */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Místa</h2>
            <div className="space-y-3 text-sm mb-5">
              <Row label="Název objektu" value={zakazka.nazev_objektu} />
              <Row label="Příprava nevěsty" value={zakazka.adresa_pripravy} />
              <Row label="Obřad" value={zakazka.adresa_obradu} />
              <Row label="Svatební veselí" value={zakazka.adresa_veseli} />
            </div>
            <MapaTrasy
              adresaPripravy={zakazka.adresa_pripravy}
              adresaObradu={zakazka.adresa_obradu}
              adresaVeseli={zakazka.adresa_veseli}
            />
          </section>

          {/* Historie stavů */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Historie</h2>
            {historie.length === 0 ? (
              <p className="text-sm text-gray-400">Zatím žádné záznamy.</p>
            ) : (
              <div className="space-y-3">
                {historie.map((h, i) => (
                  <div key={h.id} className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full ${historieInfo(h.stav).barva.split(" ")[0]}`} />
                      {i < historie.length - 1 && <div className="w-px h-6 bg-gray-200 mt-1" />}
                    </div>
                    <div className="flex-1 flex items-center justify-between">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${historieInfo(h.stav).barva}`}>
                        {historieInfo(h.stav).label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(h.created_at).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}
                        {" v "}
                        {new Date(h.created_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Další info o svatbě */}
          {zakazka.dalsi_info && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-900 mb-3">Další info o svatbě</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{zakazka.dalsi_info}</p>
            </section>
          )}

          {/* Poznámky */}
          {zakazka.poznamky && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-900 mb-3">Poznámky <span className="text-xs font-normal text-gray-400">(soukromé)</span></h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{zakazka.poznamky}</p>
            </section>
          )}

        </div>
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="text-gray-900 mt-0.5">{value || "—"}</p>
    </div>
  )
}
