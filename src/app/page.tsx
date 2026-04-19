"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import Link from "next/link"

type StatsZakaznici = {
  celkem: number
}

type StatsSvatby = {
  nadchazejici: number
  cekaSestrizani: number
  dokonceno: number
  pristiSvatba: { datum: string; jmeno: string } | null
}

type StatsPujcovna = {
  nadchazejici: number
  pravePujceno: number
  dokonceno: number
  pristiRezervace: { datum: string; jmeno: string } | null
}

export default function Rozcestnik() {
  const router = useRouter()
  const [statsSvatby, setStatsSvatby] = useState<StatsSvatby | null>(null)
  const [statsPujcovna, setStatsPujcovna] = useState<StatsPujcovna | null>(null)
  const [statsZakaznici, setStatsZakaznici] = useState<StatsZakaznici | null>(null)
  const [loading, setLoading] = useState(true)

  async function odhlasit() {
    const client = createClient()
    await client.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  useEffect(() => {
    async function nactiStats() {
      const dnes = new Date()
      dnes.setHours(0, 0, 0, 0)

      const dnesStr = dnes.toISOString().slice(0, 10)
      const letos = dnes.getFullYear()

      // Statistiky svateb
      const { data: zakazky } = await supabase
        .from("zakazky")
        .select("datum_svatby, stav, jmeno_nevesty, jmeno_zenicha, vystup_odevzdan")
        .in("stav", ["zaplaceno", "po-svatbe", "ve-strizne", "ukonceno"])

      if (zakazky) {
        const nadchazejici = zakazky.filter(z =>
          z.stav === "zaplaceno" && z.datum_svatby && z.datum_svatby >= dnesStr
        )
        const cekaSestrizani = zakazky.filter(z =>
          ["ve-strizne", "po-svatbe"].includes(z.stav) && !z.vystup_odevzdan
        )
        const dokonceno = zakazky.filter(z =>
          (z.stav === "ukonceno" || z.vystup_odevzdan) &&
          z.datum_svatby && new Date(z.datum_svatby).getFullYear() === letos
        )
        const prvni = nadchazejici.sort((a, b) =>
          new Date(a.datum_svatby).getTime() - new Date(b.datum_svatby).getTime()
        )[0]

        setStatsSvatby({
          nadchazejici: nadchazejici.length,
          cekaSestrizani: cekaSestrizani.length,
          dokonceno: dokonceno.length,
          pristiSvatba: prvni ? {
            datum: prvni.datum_svatby,
            jmeno: [prvni.jmeno_nevesty, prvni.jmeno_zenicha].filter(Boolean).join(" & "),
          } : null,
        })
      }

      // Statistiky půjčovny — jen rezervace stanů (ne příslušenství)
      const { data: stanyPolozky } = await supabase
        .from("pujcovna_polozky")
        .select("id")
        .eq("category", "Stany")

      const stanyIds = (stanyPolozky ?? []).map(p => p.id)

      const { data: rezervace } = await supabase
        .from("pujcovna_rezervace")
        .select("start_date, end_date, stav, customer")
        .in("item_id", stanyIds.length > 0 ? stanyIds : [0])

      if (rezervace) {
        const nadchazejiciRez = rezervace.filter(r =>
          ["rezervace", "cekam-platbu", "zaplaceno"].includes(r.stav)
        )
        const pravePujceno = rezervace.filter(r => r.stav === "vypujceno")
        const dokoncenoRez = rezervace.filter(r =>
          r.stav === "dokonceno" && new Date(r.start_date).getFullYear() === letos
        )
        const prvniRez = nadchazejiciRez
          .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())[0]

        setStatsPujcovna({
          nadchazejici: nadchazejiciRez.length,
          pravePujceno: pravePujceno.length,
          dokonceno: dokoncenoRez.length,
          pristiRezervace: prvniRez ? {
            datum: prvniRez.start_date,
            jmeno: prvniRez.customer,
          } : null,
        })
      } else {
        setStatsPujcovna({ nadchazejici: 0, pravePujceno: 0, dokonceno: 0, pristiRezervace: null })
      }

      // Statistiky zákazníků
      const { count } = await supabase.from("zakaznici").select("*", { count: "exact", head: true })
      setStatsZakaznici({ celkem: count ?? 0 })

      setLoading(false)
    }
    nactiStats()
  }, [])

  function formatDatum(datum: string | null) {
    if (!datum) return null
    return new Date(datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
  }

  return (
    <main className="min-h-screen bg-gray-50">

      {/* Hlavička */}
      <div className="w-full bg-gray-900 py-5">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">Jiří Larva</h1>
            <p className="text-gray-400 text-xs mt-0.5">Správa projektů</p>
          </div>
          <button
            onClick={odhlasit}
            className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10"
          >
            Odhlásit
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">

        <h2 className="text-2xl font-bold text-gray-900 mb-2">Vyberte projekt</h2>
        <p className="text-gray-500 text-sm mb-8">Přejděte do jednoho z vašich projektů</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Wedding Planner */}
          <Link href="/svatby" className="group block">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md hover:border-rose-200 transition-all duration-200">

              {/* Barevný proužek */}
              <div className="h-2 bg-gradient-to-r from-rose-400 to-pink-500" />

              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-rose-500 bg-rose-50 px-2.5 py-1 rounded-full">Aktivní</span>
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-1">Wedding Planner</h3>
                <p className="text-sm text-gray-500 mb-5">Správa svatebních zakázek, kalendář, statistiky a finanční přehled</p>

                {loading ? (
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
                  </div>
                ) : statsSvatby ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-rose-50 rounded-xl p-3">
                        <p className="text-2xl font-bold text-rose-600">{statsSvatby.nadchazejici}</p>
                        <p className="text-xs text-rose-400 mt-0.5">Nadcházející</p>
                      </div>
                      <div className="bg-rose-50 rounded-xl p-3">
                        <p className="text-2xl font-bold text-rose-600">{statsSvatby.cekaSestrizani}</p>
                        <p className="text-xs text-rose-400 mt-0.5">Čeká střih</p>
                      </div>
                      <div className="bg-rose-50 rounded-xl p-3">
                        <p className="text-2xl font-bold text-rose-600">{statsSvatby.dokonceno}</p>
                        <p className="text-xs text-rose-400 mt-0.5">Dokončeno</p>
                      </div>
                    </div>
                    {statsSvatby.pristiSvatba && (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-500">Příští svatba</p>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5">{statsSvatby.pristiSvatba.jmeno}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDatum(statsSvatby.pristiSvatba.datum)}</p>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-5 flex items-center text-rose-500 text-sm font-medium group-hover:gap-2 gap-1 transition-all">
                  Otevřít
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Půjčovna autostanů */}
          <Link href="/pujcovna" className="group block">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md hover:border-emerald-200 transition-all duration-200">

              {/* Barevný proužek */}
              <div className="h-2 bg-gradient-to-r from-emerald-400 to-teal-500" />

              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">Aktivní</span>
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-1">Půjčovna autostanů</h3>
                <p className="text-sm text-gray-500 mb-5">Rezervační systém pro půjčování kempingového vybavení</p>

                {loading ? (
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
                  </div>
                ) : statsPujcovna ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-emerald-50 rounded-xl p-3">
                        <p className="text-2xl font-bold text-emerald-600">{statsPujcovna.nadchazejici}</p>
                        <p className="text-xs text-emerald-400 mt-0.5">Nadcházející</p>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3">
                        <p className="text-2xl font-bold text-emerald-600">{statsPujcovna.pravePujceno}</p>
                        <p className="text-xs text-emerald-400 mt-0.5">Právě půjčeno</p>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3">
                        <p className="text-2xl font-bold text-emerald-600">{statsPujcovna.dokonceno}</p>
                        <p className="text-xs text-emerald-400 mt-0.5">Dokončeno</p>
                      </div>
                    </div>
                    {statsPujcovna.pristiRezervace && (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-500">Příští rezervace</p>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5">{statsPujcovna.pristiRezervace.jmeno}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDatum(statsPujcovna.pristiRezervace.datum)}</p>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-5 flex items-center text-emerald-600 text-sm font-medium group-hover:gap-2 gap-1 transition-all">
                  Otevřít
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Zákazníci */}
          <Link href="/zakaznici" className="group block md:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md hover:border-blue-200 transition-all duration-200">
              <div className="h-2 bg-gradient-to-r from-blue-400 to-indigo-500" />
              <div className="p-6 flex items-center gap-6">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5.916-3.521M9 20H4v-2a4 4 0 015.916-3.521M15 7a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0zm-18 0a3 3 0 116 0 3 3 0 01-6 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-gray-900">Zákazníci</h3>
                  <p className="text-sm text-gray-500">Centrální databáze kontaktů napříč projekty</p>
                </div>
                {loading ? (
                  <div className="h-8 w-20 bg-gray-100 rounded animate-pulse" />
                ) : statsZakaznici ? (
                  <div className="bg-blue-50 rounded-xl px-4 py-2 text-center shrink-0">
                    <p className="text-2xl font-bold text-blue-600">{statsZakaznici.celkem}</p>
                    <p className="text-xs text-blue-400">kontaktů</p>
                  </div>
                ) : null}
                <div className="flex items-center text-blue-500 text-sm font-medium group-hover:gap-2 gap-1 transition-all shrink-0">
                  Otevřít
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

        </div>
      </div>
    </main>
  )
}
