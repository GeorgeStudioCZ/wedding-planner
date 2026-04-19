"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { vypocitejVzdalenost } from "@/lib/vzdalenost"
import { ZakaznikSearch, type Zakaznik } from "@/components/ZakaznikSearch"

export default function EditZakazka() {
  const router = useRouter()
  const params = useParams()
  const [ukladam, setUkladam] = useState(false)
  const [loading, setLoading] = useState(true)
  const [chyba, setChyba] = useState<string | null>(null)
  const [puvodniAdresa, setPuvodniAdresa] = useState("")
  const [puvodniStav, setPuvodniStav] = useState("")
  const [zakaznikId, setZakaznikId] = useState<number | null>(null)

  const [form, setForm] = useState({
    jmeno_nevesty: "",
    jmeno_zenicha: "",
    fakturacni_adresa: "",
    telefon: "",
    email: "",
    datum_svatby: "",
    cas_obradu: "",
    cas_prijezdu: "",
    typ_sluzby: "",
    balicek: "",
    cena: "",
    pocet_svatebcanu: "",
    adresa_pripravy: "",
    adresa_obradu: "",
    adresa_veseli: "",
    nazev_objektu: "",
    rychlost_dodani: "",
    socialni_site: "",
    druhy_kameraman: "",
    poznamky: "",
    dalsi_info: "",
    foto_url: "",
    stav: "poptavka",
  })

  useEffect(() => {
    async function nacti() {
      const { data } = await supabase
        .from("zakazky")
        .select("*")
        .eq("id", params.id)
        .single()

      if (data) {
        setForm({
          jmeno_nevesty: data.jmeno_nevesty ?? "",
          jmeno_zenicha: data.jmeno_zenicha ?? "",
          fakturacni_adresa: data.fakturacni_adresa ?? "",
          telefon: data.telefon ?? "",
          email: data.email ?? "",
          datum_svatby: data.datum_svatby ?? "",
          cas_obradu: data.cas_obradu ? data.cas_obradu.slice(0, 5) : "",
          cas_prijezdu: data.cas_prijezdu ? data.cas_prijezdu.slice(0, 5) : "",
          typ_sluzby: data.typ_sluzby ?? "",
          balicek: data.balicek ?? "",
          cena: data.cena ? String(data.cena) : "",
          pocet_svatebcanu: data.pocet_svatebcanu ? String(data.pocet_svatebcanu) : "",
          adresa_pripravy: data.adresa_pripravy ?? "",
          adresa_obradu: data.adresa_obradu ?? "",
          adresa_veseli: data.adresa_veseli ?? "",
          nazev_objektu: data.nazev_objektu ?? "",
          rychlost_dodani: data.rychlost_dodani ?? "",
          socialni_site: data.socialni_site ?? "",
          druhy_kameraman: data.druhy_kameraman ?? "",
          poznamky: data.poznamky ?? "",
          dalsi_info: data.dalsi_info ?? "",
          foto_url: data.foto_url ?? "",
          stav: data.stav ?? "poptavka",
        })
        setPuvodniAdresa(data.adresa_obradu ?? "")
        setPuvodniStav(data.stav ?? "poptavka")
        setZakaznikId(data.zakaznik_id ?? null)
      }
      setLoading(false)
    }
    nacti()
  }, [params.id])

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setUkladam(true)
    setChyba(null)

    // Přepočítat vzdálenost pouze pokud se změnila adresa obřadu
    let geoData: { vzdalenost_km: number | null; lat: number | null; lng: number | null } | null = null
    if (form.adresa_obradu && form.adresa_obradu !== puvodniAdresa) {
      geoData = await vypocitejVzdalenost(form.adresa_obradu)
    }

    const update: Record<string, unknown> = {
      ...form,
      zakaznik_id: zakaznikId,
      cena: form.cena ? Number(form.cena) : null,
      pocet_svatebcanu: form.pocet_svatebcanu ? Number(form.pocet_svatebcanu) : null,
      datum_svatby: form.datum_svatby || null,
      cas_obradu: form.cas_obradu || null,
      cas_prijezdu: form.cas_prijezdu || null,
    }

    if (geoData) {
      update.vzdalenost_km = geoData.vzdalenost_km
      update.lat = geoData.lat
      update.lng = geoData.lng
    }

    const { error } = await supabase
      .from("zakazky")
      .update(update)
      .eq("id", params.id)

    if (error) {
      setUkladam(false)
      setChyba("Chyba při ukládání: " + error.message)
      return
    }

    // Zapiš do historie pokud se změnil stav
    if (form.stav !== puvodniStav) {
      await supabase.from("zakazky_historie").insert([{ zakazka_id: params.id, stav: form.stav }])
    }

    setUkladam(false)
    router.push(`/svatby/zakazky/${params.id}`)
  }

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1"

  if (loading) {
    return <main className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Načítám...</main>
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-8">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push(`/svatby/zakazky/${params.id}`)}
            className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
          >
            ← Zpět
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Upravit zakázku</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Klient */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Klient</h2>
            <div>
              <label className={labelClass}>Hledat existujícího zákazníka</label>
              <ZakaznikSearch
                projekt="Svatby"
                accentColor="rose"
                onSelect={(z: Zakaznik) => {
                  setZakaznikId(z.id)
                  setForm(f => ({
                    ...f,
                    telefon: z.telefon || f.telefon,
                    email: z.email || f.email,
                    fakturacni_adresa: [z.ulice, z.psc, z.mesto].filter(Boolean).join(", ") || f.fakturacni_adresa,
                  }))
                }}
              />
            </div>
            <div>
              <label className={labelClass}>Stav zakázky</label>
              <select name="stav" value={form.stav} onChange={handleChange} className={inputClass}>
                <option value="poptavka">Poptávka</option>
                <option value="rozhoduje-se">Rozhoduje se</option>
                <option value="objednavka">Objednávka</option>
                <option value="cekam-platbu">Čekám platbu</option>
                <option value="zaplaceno">Zaplaceno</option>
                <option value="ve-strizne">Ve střižně</option>
                <option value="po-svatbe">Po svatbě</option>
                <option value="ukonceno">Ukončeno</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Jméno nevěsty</label>
                <input name="jmeno_nevesty" value={form.jmeno_nevesty} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Jméno ženicha</label>
                <input name="jmeno_zenicha" value={form.jmeno_zenicha} onChange={handleChange} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Fakturační adresa</label>
              <input name="fakturacni_adresa" value={form.fakturacni_adresa} onChange={handleChange} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Telefon</label>
                <input name="telefon" value={form.telefon} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>E-mail</label>
                <input type="email" name="email" value={form.email} onChange={handleChange} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Titulní fotka (URL odkaz)</label>
              <input name="foto_url" value={form.foto_url} onChange={handleChange} placeholder="https://..." className={inputClass} />
              {form.foto_url && (
                <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 h-40">
                  <img
                    src={form.foto_url}
                    alt="Náhled"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Datum a čas */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Datum a čas</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Datum svatby</label>
                <input type="date" name="datum_svatby" value={form.datum_svatby} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Čas obřadu</label>
                <input type="time" name="cas_obradu" value={form.cas_obradu} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Čas mého příjezdu</label>
                <input type="time" name="cas_prijezdu" value={form.cas_prijezdu} onChange={handleChange} className={inputClass} />
              </div>
            </div>
          </section>

          {/* Služba */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Služba</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Typ služby</label>
                <select name="typ_sluzby" value={form.typ_sluzby} onChange={handleChange} className={inputClass}>
                  <option value="">Vybrat...</option>
                  <option value="foto">Foto</option>
                  <option value="video">Video</option>
                  <option value="foto+video">Foto + Video</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Balíček / délka</label>
                <select name="balicek" value={form.balicek} onChange={handleChange} className={inputClass}>
                  <option value="">Vybrat...</option>
                  <option value="pul-den-6">Půl den (6 hod)</option>
                  <option value="pul-den">Půl den (8 hod)</option>
                  <option value="cely-den">Celý den (10 hod)</option>
                  <option value="do-vecera">Do večera (12 hod)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Cena s DPH (Kč)</label>
                <input type="number" name="cena" value={form.cena} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Počet svatebčanů</label>
                <input type="number" name="pocet_svatebcanu" value={form.pocet_svatebcanu} onChange={handleChange} className={inputClass} />
              </div>
            </div>
          </section>

          {/* Místa */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Místa</h2>
            <div>
              <label className={labelClass}>Název objektu</label>
              <input name="nazev_objektu" value={form.nazev_objektu} onChange={handleChange} placeholder="Penzion Sýpka u Tesařů" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Adresa přípravy nevěsty</label>
              <input name="adresa_pripravy" value={form.adresa_pripravy} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Adresa obřadu</label>
              <input name="adresa_obradu" value={form.adresa_obradu} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Adresa svatebního veselí</label>
              <input name="adresa_veseli" value={form.adresa_veseli} onChange={handleChange} className={inputClass} />
            </div>
          </section>

          {/* Doplňky */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Doplňky</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Rychlost dodání</label>
                <select name="rychlost_dodani" value={form.rychlost_dodani} onChange={handleChange} className={inputClass}>
                  <option value="">Vybrat...</option>
                  <option value="60-dnu">Výchozí 60 dní</option>
                  <option value="14-dnu">Do 14 dní</option>
                  <option value="7-dnu">Do 7 dní</option>
                  <option value="72-hodin">Do 72 hodin</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Videa pro soc. sítě</label>
                <select name="socialni_site" value={form.socialni_site} onChange={handleChange} className={inputClass}>
                  <option value="">Vybrat...</option>
                  <option value="ne">Ne</option>
                  <option value="1x-reels">1x reels 20s (+690 Kč)</option>
                  <option value="2x-reels">2x reels 20s (+1 180 Kč)</option>
                  <option value="3x-reels">3x reels 20s (+1 470 Kč)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>2. kameraman/fotograf</label>
                <select name="druhy_kameraman" value={form.druhy_kameraman} onChange={handleChange} className={inputClass}>
                  <option value="">Vybrat...</option>
                  <option value="ano">Ano</option>
                  <option value="ne">Ne</option>
                </select>
              </div>
            </div>
          </section>

          {/* Další info o svatbě */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Další info o svatbě</h2>
            <textarea
              name="dalsi_info"
              value={form.dalsi_info}
              onChange={handleChange}
              rows={4}
              placeholder="Přání páru, dress code, nestandardní průběh..."
              className={`${inputClass} resize-none`}
            />
          </section>

          {/* Poznámky */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Poznámky <span className="text-xs font-normal text-gray-400">(soukromé)</span></h2>
            <textarea
              name="poznamky"
              value={form.poznamky}
              onChange={handleChange}
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </section>

          {chyba && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {chyba}
            </div>
          )}

          <div className="flex gap-3 pb-8">
            <button type="submit" disabled={ukladam} className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors">
              {ukladam ? "Ukládám..." : "Uložit změny"}
            </button>
            <button type="button" onClick={() => router.push(`/svatby/zakazky/${params.id}`)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-medium transition-colors">
              Zrušit
            </button>
          </div>

        </form>
      </div>
    </main>
  )
}
