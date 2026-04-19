"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ZakaznikSearch, type Zakaznik } from "@/components/ZakaznikSearch"

type Polozka = {
  id: number
  name: string
  category: string
  unit_num: number
  sort_order: number
}

type Rezervace = {
  id: number
  item_id: number
  unit_index: number
  customer: string
  phone: string
  start_date: string
  end_date: string
  color: string
  notes: string
  group_id: string | null
  vozidlo: string
  cas_vyzvednuti: string
  cas_vraceni: string
  pricniky: string
}

const KATEGORIE = ["Vše", "Stany", "Příčníky", "Paddleboardy", "Markýzy", "Sedátka", "Napájení", "Ledničky", "Redukce", "Camping sety", "Stolky", "Vařiče", "Reproduktory", "Ostatní"]

const MESICE = [
  { label: "Celá sezóna", value: null as number | null },
  { label: "Duben",    value: 3 },
  { label: "Květen",   value: 4 },
  { label: "Červen",   value: 5 },
  { label: "Červenec", value: 6 },
  { label: "Srpen",    value: 7 },
  { label: "Září",     value: 8 },
  { label: "Říjen",    value: 9 },
]

const BARVY = [
  { value: "#f43f5e", label: "Růžová" },
  { value: "#3b82f6", label: "Modrá" },
  { value: "#10b981", label: "Zelená" },
  { value: "#f59e0b", label: "Oranžová" },
  { value: "#8b5cf6", label: "Fialová" },
  { value: "#06b6d4", label: "Tyrkysová" },
]

function datumNaDen(datum: string): number {
  const d = new Date(datum)
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

function denNaDatum(rok: number, den: number): Date {
  const d = new Date(rok, 0, den)
  return d
}

function formatDatum(datum: string) {
  return new Date(datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "short" })
}

function pocetDni(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

export default function Pujcovna() {
  const router = useRouter()
  const dnesRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [polozky, setPolozky] = useState<Polozka[]>([])
  const [rezervace, setRezervace] = useState<Rezervace[]>([])
  const [svatebnidny, setSvatebnidny] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [kategorie, setKategorie] = useState("Vše")
  const [mesicFilter, setMesicFilter] = useState<number | null>(null)
  const [tooltip, setTooltip] = useState<{ rez: Rezervace; x: number; y: number } | null>(null)
  const [modal, setModal] = useState<{
    mode: "nova" | "edit"
    itemId?: number
    unitIndex?: number
    rezervace?: Rezervace
    startDate?: string
  } | null>(null)

  const ROK = new Date().getFullYear()
  // Sezóna: 1. dubna – 31. října
  const SEZONA_START = new Date(ROK, 3, 1) // 1. dubna
  const SEZONA_END = new Date(ROK, 9, 31)  // 31. října
  const POCET_DNI = Math.round((SEZONA_END.getTime() - SEZONA_START.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const DNY = Array.from({ length: POCET_DNI }, (_, i) => {
    const d = new Date(SEZONA_START)
    d.setDate(d.getDate() + i)
    return d
  })

  const COL_WIDTH = 28 // px na den
  const ROW_HEIGHT = 40
  const LABEL_WIDTH = 180

  useEffect(() => {
    async function nacti() {
      const [{ data: pol }, { data: rez }, { data: zakazky }] = await Promise.all([
        supabase.from("pujcovna_polozky").select("*").order("sort_order"),
        supabase.from("pujcovna_rezervace").select("*"),
        supabase.from("zakazky").select("datum_svatby").eq("stav", "zaplaceno"),
      ])
      setPolozky(pol ?? [])
      setRezervace(rez ?? [])
      setSvatebnidny((zakazky ?? []).map(z => z.datum_svatby).filter(Boolean))
      setLoading(false)
    }
    nacti()
  }, [])

  // Scroll na dnes
  useEffect(() => {
    if (!loading && scrollRef.current) {
      const dnes = new Date()
      const diffDni = Math.round((dnes.getTime() - SEZONA_START.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDni >= 0 && diffDni < POCET_DNI) {
        scrollRef.current.scrollLeft = Math.max(0, diffDni * COL_WIDTH - 200)
      }
    }
  }, [loading])

  const filtrovanePolozky = kategorie === "Vše"
    ? polozky
    : polozky.filter(p => p.category === kategorie)

  function poziceRezervace(rez: Rezervace): { left: number; width: number } | null {
    const start = new Date(rez.start_date)
    const end = new Date(rez.end_date)
    const startDiff = Math.round((start.getTime() - SEZONA_START.getTime()) / (1000 * 60 * 60 * 24))
    const endDiff = Math.round((end.getTime() - SEZONA_START.getTime()) / (1000 * 60 * 60 * 24))
    if (endDiff < 0 || startDiff >= POCET_DNI) return null
    const left = Math.max(0, startDiff) * COL_WIDTH
    const width = (Math.min(endDiff, POCET_DNI - 1) - Math.max(0, startDiff) + 1) * COL_WIDTH
    return { left, width }
  }

  function scrollNaMesic(mesicCislo: number | null) {
    setMesicFilter(mesicCislo)
    if (mesicCislo === null) {
      if (scrollRef.current) scrollRef.current.scrollLeft = 0
      return
    }
    const idx = DNY.findIndex(d => d.getMonth() === mesicCislo)
    if (idx >= 0 && scrollRef.current) {
      scrollRef.current.scrollLeft = idx * COL_WIDTH
    }
  }

  function klikNaDen(itemId: number, unitIndex: number, datum: Date) {
    const dateStr = datum.toISOString().slice(0, 10)
    setModal({ mode: "nova", itemId, unitIndex, startDate: dateStr })
  }

  function klikNaRezervaci(e: React.MouseEvent, rez: Rezervace) {
    e.stopPropagation()
    setModal({ mode: "edit", rezervace: rez })
  }

  const dnesIndex = Math.round((new Date().setHours(0,0,0,0) - SEZONA_START.getTime()) / (1000 * 60 * 60 * 24))

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Načítám...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">

      {/* Hlavička */}
      <div className="w-full bg-emerald-700 py-5">
        <div className="max-w-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/pujcovna" className="text-emerald-200 hover:text-white text-sm transition-colors">← Dashboard</a>
            <h1 className="text-xl font-bold text-white">Půjčovna — Kalendář</h1>
          </div>
          <button
            onClick={() => setModal({ mode: "nova" })}
            className="bg-white hover:bg-emerald-50 text-emerald-700 font-medium text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nová rezervace
          </button>
        </div>
      </div>

      {/* Filtry + tlačítko Dnes */}
      <div className="px-6 py-3 flex items-center gap-3 bg-white border-b border-gray-100">
        <select
          value={kategorie}
          onChange={e => setKategorie(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
        >
          {KATEGORIE.map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <select
          value={mesicFilter ?? ""}
          onChange={e => scrollNaMesic(e.target.value === "" ? null : Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
        >
          {MESICE.map(m => (
            <option key={m.label} value={m.value ?? ""}>{m.label}</option>
          ))}
        </select>
        <div className="ml-auto">
          <button
            onClick={() => {
              if (scrollRef.current && dnesIndex >= 0 && dnesIndex < POCET_DNI) {
                scrollRef.current.scrollLeft = Math.max(0, dnesIndex * COL_WIDTH - 200)
              }
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
          >
            Dnes
          </button>
        </div>
      </div>

      {/* Gantt — jeden scrollovatelný kontejner */}
      <div ref={scrollRef} className="overflow-auto" style={{ height: "calc(100vh - 112px)" }}>
        <div style={{ width: LABEL_WIDTH + POCET_DNI * COL_WIDTH }}>

          {/* Sticky hlavička — 3 řádky: měsíce + dny + svatby */}
          <div className="sticky top-0 z-20 flex" style={{ height: 76 }}>
            {/* Roh */}
            <div className="sticky left-0 z-30 bg-gray-100 border-b border-r border-gray-300" style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH, height: 76 }} />
            {/* Měsíce + dny + svatby */}
            <div className="relative border-b border-gray-300" style={{ width: POCET_DNI * COL_WIDTH }}>
              {/* Řádek 1 — měsíce */}
              <div className="flex" style={{ height: 22 }}>
                {(() => {
                  const mesice: { mesic: string; pocet: number }[] = []
                  let aktMesic = ""
                  let pocet = 0
                  DNY.forEach((den, i) => {
                    const m = den.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })
                    if (m !== aktMesic) {
                      if (aktMesic) mesice.push({ mesic: aktMesic, pocet })
                      aktMesic = m
                      pocet = 1
                    } else {
                      pocet++
                    }
                    if (i === DNY.length - 1) mesice.push({ mesic: aktMesic, pocet })
                  })
                  return mesice.map((m, i) => (
                    <div key={i} className="bg-gray-200 border-r border-gray-300 flex items-center justify-center text-[11px] font-bold text-gray-700 uppercase tracking-wide overflow-hidden"
                      style={{ width: m.pocet * COL_WIDTH, minWidth: m.pocet * COL_WIDTH }}>
                      {m.mesic}
                    </div>
                  ))
                })()}
              </div>
              {/* Řádek 2 — dny */}
              <div className="flex" style={{ height: 34 }}>
                {DNY.map((den, i) => {
                  const jeDnes = i === dnesIndex
                  const jeVikend = den.getDay() === 0 || den.getDay() === 6
                  return (
                    <div key={i} style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      className={`flex flex-col items-center justify-center border-r border-gray-200 text-xs select-none
                        ${jeDnes ? "bg-rose-500 text-white font-bold" : jeVikend ? "bg-amber-50 text-amber-700" : "bg-white text-gray-500"}`}>
                      <span className="text-[11px] font-semibold leading-none">{den.getDate()}</span>
                      <span className="text-[9px] leading-none mt-0.5 opacity-70">{den.toLocaleDateString("cs-CZ", { weekday: "short" })}</span>
                    </div>
                  )
                })}
              </div>
              {/* Řádek 3 — svatby */}
              <div className="flex bg-white border-t border-gray-100" style={{ height: 20 }}>
                {DNY.map((den, i) => {
                  const denStr = den.toISOString().slice(0, 10)
                  const jeSvatba = svatebnidny.includes(denStr)
                  return (
                    <div key={i} style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      className="flex items-center justify-center border-r border-gray-100">
                      {jeSvatba && (
                        <span className="text-rose-500 font-bold text-[11px] leading-none select-none" title="Svatba">✕</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Řádky — kategorie + položky */}
          {KATEGORIE.filter(k => k !== "Vše").map(kat => {
            const polozkyKat = filtrovanePolozky.filter(p => p.category === kat)
            if (polozkyKat.length === 0) return null

            // Rozvinout každou položku na unit_num řádků
            const radky: { polozka: Polozka; unitIndex: number }[] = []
            polozkyKat.forEach(p => {
              for (let ui = 0; ui < p.unit_num; ui++) {
                radky.push({ polozka: p, unitIndex: ui })
              }
            })

            return (
              <div key={kat}>
                {/* Kategoriový nadpis */}
                <div className="flex sticky z-10" style={{ top: 76 }}>
                  <div className="sticky left-0 z-10 bg-gray-800 text-white text-[11px] font-bold uppercase tracking-wider px-3 flex items-center border-b border-gray-700"
                    style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH, height: 28 }}>
                    {kat}
                  </div>
                  <div className="bg-gray-800/90 border-b border-gray-700" style={{ width: POCET_DNI * COL_WIDTH, height: 28 }} />
                </div>
                {/* Řádky položek */}
                {radky.map(({ polozka, unitIndex }, ri) => {
                  const rezRadku = rezervace.filter(r => r.item_id === polozka.id && r.unit_index === unitIndex)
                  const label = polozka.unit_num > 1 ? `${polozka.name} ${unitIndex + 1}` : polozka.name
                  return (
                    <div key={`${polozka.id}-${unitIndex}`} className="flex relative" style={{ height: ROW_HEIGHT }}>
                      {/* Štítek vlevo */}
                      <div className={`sticky left-0 z-10 flex items-center px-3 border-b border-r border-gray-200 text-xs font-medium text-gray-700 shrink-0
                        ${ri % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                        style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}>
                        <span className="truncate">{label}</span>
                      </div>
                      {/* Gantt plocha */}
                      <div className={`relative border-b border-gray-100 ${ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                        style={{ width: POCET_DNI * COL_WIDTH }}>
                        {/* Mřížka dnů */}
                        <div className="flex h-full absolute inset-0">
                          {DNY.map((den, di) => {
                            const jeDnes = di === dnesIndex
                            const jeVikend = den.getDay() === 0 || den.getDay() === 6
                            return (
                              <div key={di} style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                                className={`h-full border-r border-gray-100 cursor-pointer hover:bg-emerald-50/50
                                  ${jeDnes ? "bg-rose-50/40" : jeVikend ? "bg-amber-50/40" : ""}`}
                                onClick={() => klikNaDen(polozka.id, unitIndex, den)} />
                            )
                          })}
                        </div>
                        {/* Rezervační bloky */}
                        {rezRadku.map(rez => {
                          const pos = poziceRezervace(rez)
                          if (!pos) return null
                          return (
                            <div key={rez.id}
                              className="absolute top-1 rounded cursor-pointer flex items-center px-2 overflow-hidden hover:brightness-95 shadow-sm z-10"
                              style={{ left: pos.left + 1, width: pos.width - 2, height: ROW_HEIGHT - 8, backgroundColor: rez.color || "#10b981" }}
                              onClick={(e) => klikNaRezervaci(e, rez)}
                              onMouseEnter={(e) => setTooltip({ rez, x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setTooltip(null)}
                              onMouseMove={(e) => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}>
                              <span className="text-white text-xs font-medium truncate drop-shadow-sm">{rez.customer}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-xl p-3 shadow-xl pointer-events-none max-w-[200px]"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="font-bold mb-1">{tooltip.rez.customer}</p>
          {tooltip.rez.phone && <p className="text-gray-300">📞 {tooltip.rez.phone}</p>}
          <p className="text-gray-300 mt-1">
            {formatDatum(tooltip.rez.start_date)} – {formatDatum(tooltip.rez.end_date)}
          </p>
          <p className="text-gray-400">{pocetDni(tooltip.rez.start_date, tooltip.rez.end_date)} dní</p>
          {tooltip.rez.notes && <p className="text-gray-300 mt-1 border-t border-gray-700 pt-1">{tooltip.rez.notes}</p>}
        </div>
      )}

      {/* Modal — nová / edit rezervace */}
      {modal && (
        <ModalRezervace
          mode={modal.mode}
          polozky={polozky}
          rezervace={rezervace}
          initialItemId={modal.itemId}
          initialUnitIndex={modal.unitIndex}
          initialStartDate={modal.startDate}
          editRezervace={modal.rezervace}
          onClose={() => setModal(null)}
          onSave={async () => {
            const { data } = await supabase.from("pujcovna_rezervace").select("*")
            setRezervace(data ?? [])
            setModal(null)
          }}
        />
      )}

    </main>
  )
}

// ——— Modal komponenta ———

function ModalRezervace({
  mode, polozky, rezervace, initialItemId, initialUnitIndex, initialStartDate, editRezervace, onClose, onSave,
}: {
  mode: "nova" | "edit"
  polozky: Polozka[]
  rezervace: Rezervace[]
  initialItemId?: number
  initialUnitIndex?: number
  initialStartDate?: string
  editRezervace?: Rezervace
  onClose: () => void
  onSave: () => void
}) {
  const dnesStr = new Date().toISOString().slice(0, 10)
  const stanyIds = new Set(polozky.filter(p => p.category === "Stany").map(p => p.id))

  const [form, setForm] = useState({
    item_id: editRezervace?.item_id ?? initialItemId ?? (polozky[0]?.id ?? 0),
    unit_index: editRezervace?.unit_index ?? initialUnitIndex ?? 0,
    customer: editRezervace?.customer ?? "",
    phone: editRezervace?.phone ?? "",
    start_date: editRezervace?.start_date ?? initialStartDate ?? dnesStr,
    end_date: editRezervace?.end_date ?? initialStartDate ?? dnesStr,
    color: editRezervace?.color ?? "#10b981",
    notes: editRezervace?.notes ?? "",
    vozidlo: editRezervace?.vozidlo ?? "",
    cas_vyzvednuti: editRezervace?.cas_vyzvednuti ?? "",
    cas_vraceni: editRezervace?.cas_vraceni ?? "",
    pricniky: editRezervace?.pricniky ?? "",
  })
  const [prisl, setPrisl] = useState<Record<number, number>>({})
  const [dostupnost, setDostupnost] = useState<Record<number, number>>({})
  const [chyba, setChyba] = useState<string | null>(null)
  const [ukladam, setUkladam] = useState(false)
  const [mazani, setMazani] = useState(false)

  const jeStanVybran = stanyIds.has(Number(form.item_id))
  const prislusenstvi = polozky.filter(p => p.category !== "Stany")
  const kategoriePrisl = [...new Set(prislusenstvi.map(p => p.category))]

  // Výpočet dostupnosti při změně termínu
  useEffect(() => {
    if (!jeStanVybran || !form.start_date || !form.end_date) return
    const start = new Date(form.start_date)
    const end = new Date(form.end_date)
    const vysl: Record<number, number> = {}
    const skupinaEdit = editRezervace?.group_id
    for (const p of prislusenstvi) {
      const obsazeno = rezervace.filter(r => {
        if (r.item_id !== p.id) return false
        if (skupinaEdit && r.group_id === skupinaEdit) return false
        const rs = new Date(r.start_date)
        const re = new Date(r.end_date)
        return start <= re && end >= rs
      }).length
      vysl[p.id] = Math.max(0, p.unit_num - obsazeno)
    }
    setDostupnost(vysl)
  }, [form.start_date, form.end_date, form.item_id, jeStanVybran])

  // Načíst aktuálně vybrané příslušenství při editaci skupiny
  useEffect(() => {
    if (mode === "edit" && editRezervace?.group_id) {
      const skupRez = rezervace.filter(
        r => r.group_id === editRezervace.group_id && r.id !== editRezervace.id
      )
      const vybrane: Record<number, number> = {}
      skupRez.forEach(r => { vybrane[r.item_id] = (vybrane[r.item_id] ?? 0) + 1 })
      setPrisl(vybrane)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function jeKonflikt(): boolean {
    const start = new Date(form.start_date)
    const end = new Date(form.end_date)
    return rezervace.some(r => {
      if (r.item_id !== Number(form.item_id)) return false
      if (r.unit_index !== form.unit_index) return false
      if (mode === "edit" && editRezervace && r.id === editRezervace.id) return false
      const rs = new Date(r.start_date)
      const re = new Date(r.end_date)
      return start <= re && end >= rs
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setChyba(null)
    if (!form.customer.trim()) { setChyba("Zadejte jméno zákazníka"); return }
    if (form.start_date > form.end_date) { setChyba("Datum konce musí být po datu začátku"); return }
    if (jeKonflikt()) { setChyba("Konflikt: tato položka je již rezervována v tomto termínu"); return }
    setUkladam(true)

    const groupId = editRezervace?.group_id ?? (jeStanVybran ? crypto.randomUUID() : null)
    const hlavniData = { ...form, item_id: Number(form.item_id), group_id: groupId }

    // Najde první volný unit_index pro příslušenství
    function najdiVolnySlot(itemId: number, skupinaEdit: string | null | undefined): number {
      const pol = polozky.find(p => p.id === itemId)
      if (!pol) return 0
      for (let ui = 0; ui < pol.unit_num; ui++) {
        const konflikt = rezervace.some(r => {
          if (r.item_id !== itemId || r.unit_index !== ui) return false
          if (skupinaEdit && r.group_id === skupinaEdit) return false
          return new Date(form.start_date) <= new Date(r.end_date) &&
                 new Date(form.end_date) >= new Date(r.start_date)
        })
        if (!konflikt) return ui
      }
      return 0
    }

    function sestavPrisl(gid: string | null) {
      const rows: object[] = []
      const usedSlots: Record<number, number[]> = {}
      for (const [itemIdStr, pocet] of Object.entries(prisl)) {
        if (!pocet) continue
        const itemId = Number(itemIdStr)
        usedSlots[itemId] = usedSlots[itemId] ?? []
        for (let i = 0; i < pocet; i++) {
          // najdi volný slot přeskakujíc již přidělené v této iteraci
          const pol = polozky.find(p => p.id === itemId)
          if (!pol) continue
          let slot = 0
          for (let ui = 0; ui < pol.unit_num; ui++) {
            if (usedSlots[itemId].includes(ui)) continue
            const konflikt = rezervace.some(r => {
              if (r.item_id !== itemId || r.unit_index !== ui) return false
              if (editRezervace?.group_id && r.group_id === editRezervace.group_id) return false
              return new Date(form.start_date) <= new Date(r.end_date) &&
                     new Date(form.end_date) >= new Date(r.start_date)
            })
            if (!konflikt) { slot = ui; break }
          }
          usedSlots[itemId].push(slot)
          rows.push({
            item_id: itemId,
            unit_index: slot,
            customer: form.customer,
            phone: form.phone,
            start_date: form.start_date,
            end_date: form.end_date,
            color: form.color,
            notes: "",
            group_id: gid,
          })
        }
      }
      return rows
    }

    if (mode === "nova") {
      await supabase.from("pujcovna_rezervace").insert([hlavniData])
      const prislRez = sestavPrisl(groupId)
      if (prislRez.length > 0) {
        await supabase.from("pujcovna_rezervace").insert(prislRez)
      }
    } else if (editRezervace) {
      await supabase.from("pujcovna_rezervace").update(hlavniData).eq("id", editRezervace.id)
      if (groupId) {
        await supabase.from("pujcovna_rezervace")
          .delete()
          .eq("group_id", groupId)
          .neq("id", editRezervace.id)
        const prislRez = sestavPrisl(groupId)
        if (prislRez.length > 0) {
          await supabase.from("pujcovna_rezervace").insert(prislRez)
        }
      }
    }
    onSave()
  }

  async function handleSmazat() {
    if (!editRezervace) return
    if (editRezervace.group_id) {
      // Smazat celou skupinu
      await supabase.from("pujcovna_rezervace").delete().eq("group_id", editRezervace.group_id)
    } else {
      await supabase.from("pujcovna_rezervace").delete().eq("id", editRezervace.id)
    }
    onSave()
  }

  const labelClass = "block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1"
  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900">{mode === "nova" ? "Nová rezervace" : "Upravit rezervaci"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-5 space-y-4">
            <div>
              <label className={labelClass}>Položka</label>
              <select name="item_id" value={form.item_id} onChange={handleChange} className={inputClass}>
                {[...polozky]
                  .sort((a, b) => {
                    const ai = KATEGORIE.indexOf(a.category)
                    const bi = KATEGORIE.indexOf(b.category)
                    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                    return a.sort_order - b.sort_order
                  })
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Zákazník</label>
              <ZakaznikSearch
                projekt="Půjčovna"
                accentColor="emerald"
                onSelect={(z: Zakaznik) => setForm(f => ({
                  ...f,
                  customer: `${z.jmeno} ${z.prijmeni}`.trim() || f.customer,
                  phone: z.telefon || f.phone,
                }))}
              />
              {form.customer && (
                <p className="mt-1.5 text-sm text-gray-700 font-medium px-1">{form.customer}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Od</label>
                <input type="date" name="start_date" value={form.start_date} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Do</label>
                <input type="date" name="end_date" value={form.end_date} onChange={handleChange} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Značka a model vozu</label>
              <input name="vozidlo" value={form.vozidlo} onChange={handleChange} placeholder="např. Škoda Octavia Combi" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Vyzvednutí</label>
                <select name="cas_vyzvednuti" value={form.cas_vyzvednuti} onChange={handleChange} className={inputClass}>
                  <option value="">Vybrat...</option>
                  {Array.from({ length: 14 }, (_, i) => i + 8).map(h => (
                    <option key={h} value={`${h}:00 - ${h + 1}:00`}>{h}:00 – {h + 1}:00</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Vrácení</label>
                <select name="cas_vraceni" value={form.cas_vraceni} onChange={handleChange} className={inputClass}>
                  <option value="">Vybrat...</option>
                  {Array.from({ length: 14 }, (_, i) => i + 8).map(h => (
                    <option key={h} value={`${h}:00 - ${h + 1}:00`}>{h}:00 – {h + 1}:00</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Příčníky na vozidlo</label>
              <select name="pricniky" value={form.pricniky} onChange={handleChange} className={inputClass}>
                <option value="">Vybrat...</option>
                <option value="vlastni">Mám vlastní</option>
                <option value="pujcit">Chci půjčit</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Barva</label>
              <div className="flex gap-2 flex-wrap">
                {BARVY.map(b => (
                  <button key={b.value} type="button"
                    onClick={() => setForm({ ...form, color: b.value })}
                    className={`w-7 h-7 rounded-full transition-transform ${form.color === b.value ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""}`}
                    style={{ backgroundColor: b.value }} title={b.label} />
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Poznámka</label>
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={2} placeholder="Volitelná poznámka..." className={inputClass} />
            </div>

            {/* Panel příslušenství — pouze při výběru stanu */}
            {jeStanVybran && (
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <div className="bg-gray-800 px-4 py-3 flex items-center gap-2">
                  <span className="text-lg">🏕️</span>
                  <div>
                    <p className="text-white text-sm font-semibold">Příslušenství</p>
                    <p className="text-gray-400 text-xs">Zaškrtněte co si zákazník bere spolu se stanem</p>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {kategoriePrisl.map(kat => {
                    const polozkyKat = prislusenstvi.filter(p => p.category === kat)
                    return (
                      <div key={kat}>
                        <div className="px-4 py-1.5 bg-gray-50">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{kat}</span>
                        </div>
                        {polozkyKat.map(p => {
                          const volnych = dostupnost[p.id] ?? p.unit_num
                          const vybrano = prisl[p.id] ?? 0
                          const nedostupne = volnych === 0
                          return (
                            <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${nedostupne && vybrano === 0 ? "opacity-40" : ""}`}>
                              <span className="flex-1 text-sm text-gray-700">{p.name}</span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mr-2 ${nedostupne && vybrano === 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                                {nedostupne && vybrano === 0 ? "nedost." : `${volnych} vol.`}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={vybrano === 0}
                                  onClick={() => setPrisl(prev => ({ ...prev, [p.id]: Math.max(0, vybrano - 1) }))}
                                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-gray-700 font-bold text-lg flex items-center justify-center transition-colors"
                                >−</button>
                                <span className="w-6 text-center text-sm font-semibold text-gray-800">{vybrano}</span>
                                <button
                                  type="button"
                                  disabled={vybrano >= volnych}
                                  onClick={() => setPrisl(prev => ({ ...prev, [p.id]: Math.min(volnych, vybrano + 1) }))}
                                  className="w-7 h-7 rounded-lg bg-emerald-100 hover:bg-emerald-200 disabled:opacity-30 text-emerald-700 font-bold text-lg flex items-center justify-center transition-colors"
                                >+</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {chyba && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{chyba}</p>}
          </div>

          <div className="flex gap-2 p-5 pt-0">
            {mode === "edit" && !mazani && (
              <button type="button" onClick={() => setMazani(true)} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                Smazat
              </button>
            )}
            {mazani && (
              <>
                <button type="button" onClick={handleSmazat} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                  Potvrdit smazání
                </button>
                <button type="button" onClick={() => setMazani(false)} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                  Zrušit
                </button>
              </>
            )}
            {!mazani && (
              <>
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                  Zrušit
                </button>
                <button type="submit" disabled={ukladam} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  {ukladam ? "Ukládám..." : "Uložit"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
