"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import { ZakaznikSearch, type Zakaznik } from "@/components/ZakaznikSearch"

// ── Types ──────────────────────────────────────────────────────────────────────

type Polozka = {
  id: number
  name: string
  category: string
  unit_num: number
  sort_order: number
  cena_typ: "fixni" | "stupnovana" | "kusova"
  cena_fixni: number | null
  neomezene?: boolean
}

type Stupen = {
  polozka_id: number
  dni_od: number
  dni_do: number | null
  cena_za_den: number
}

type Rezervace = {
  id: number
  item_id: number
  unit_index: number
  customer: string
  start_date: string
  end_date: string
  color: string
  notes: string
  group_id: string | null
  zakaznik_id: number | null
  vozidlo: string
  cas_vyzvednuti: string
  cas_vraceni: string
  pricniky: string
  stav: string
}

type ZakaznikData = {
  id: number
  jmeno: string
  prijmeni: string
  firma?: string | null
  telefon: string
  email: string
}

type HistorieZaznam = {
  id: string
  created_at: string
  stav: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STAVY = [
  { value: "rezervace",    label: "Rezervace",    barva: "bg-gray-100 text-gray-600" },
  { value: "cekam-platbu", label: "Čekám platbu", barva: "bg-orange-100 text-orange-700" },
  { value: "zaplaceno",    label: "Zaplaceno",    barva: "bg-green-100 text-green-700" },
  { value: "vypujceno",    label: "Vypůjčeno",    barva: "bg-blue-100 text-blue-700" },
  { value: "dokonceno",    label: "Dokončeno",    barva: "bg-sky-100 text-sky-700" },
  { value: "storno",       label: "Storno",       barva: "bg-red-100 text-red-700" },
]

const KATEGORIE_ORDER = ["Stany", "Příčníky", "Paddleboardy", "Markýzy", "Sedátka", "Napájení", "Ledničky", "Redukce", "Camping sety", "Stolky", "Vařiče", "Reproduktory", "Ostatní"]

const BARVY_STANU = [
  { klic: "malý",    barva: "#F23753" },
  { klic: "střední", barva: "#3477F5" },
  { klic: "velký",   barva: "#F3940E" },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function stavInfo(stav: string) {
  return STAVY.find(s => s.value === stav) ?? STAVY[0]
}

function pocetDni(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
}

function formatDatum(d: string): string {
  return new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}

function formatCena(c: number): string {
  return c.toLocaleString("cs-CZ") + " Kč"
}

function barvaStanu(pol: Polozka | undefined): string {
  if (!pol) return "#10b981"
  const name = pol.name.toLowerCase()
  return BARVY_STANU.find(b => name.includes(b.klic))?.barva ?? "#10b981"
}

function vypocitejCenu(pol: Polozka, stupne: Stupen[], dni: number): { celkem: number; popis: string } | null {
  if (pol.cena_typ === "kusova") {
    if (!pol.cena_fixni) return null
    return { celkem: pol.cena_fixni, popis: "1 ks" }
  }
  if (pol.cena_typ === "fixni") {
    if (!pol.cena_fixni) return null
    return {
      celkem: pol.cena_fixni * dni,
      popis: `${dni} ${dni === 1 ? "den" : dni < 5 ? "dny" : "dní"} × ${formatCena(pol.cena_fixni)}/den`,
    }
  }
  const tier = stupne.find(s => s.polozka_id === pol.id && s.dni_od <= dni && (s.dni_do === null || s.dni_do >= dni))
  if (!tier) return null
  return {
    celkem: tier.cena_za_den * dni,
    popis: `${dni} ${dni === 1 ? "den" : dni < 5 ? "dny" : "dní"} × ${formatCena(tier.cena_za_den)}/den`,
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RezervacePopup({
  rezervaceId,
  initialMode = "detail",
  onClose,
  onSave,
}: {
  rezervaceId: number
  initialMode?: "detail" | "edit"
  onClose: () => void
  onSave: () => void
}) {
  const [view, setView] = useState<"detail" | "edit">(initialMode)

  // Shared data
  const [rez, setRez] = useState<Rezervace | null>(null)
  const [polozka, setPolozka] = useState<Polozka | null>(null)
  const [zakaznik, setZakaznik] = useState<ZakaznikData | null>(null)
  const [prislData, setPrislData] = useState<{ rez: Rezervace; polozka: Polozka }[]>([])
  const [stupne, setStupne] = useState<Stupen[]>([])
  const [historie, setHistorie] = useState<HistorieZaznam[]>([])
  const [vsechnyPolozky, setVsechnyPolozky] = useState<Polozka[]>([])
  const [vsechnyRezervace, setVsechnyRezervace] = useState<Rezervace[]>([])
  const [loading, setLoading] = useState(true)

  // Edit form state
  const [form, setForm] = useState({
    item_id: 0, unit_index: 0, customer: "",
    start_date: "", end_date: "", color: "", notes: "",
    vozidlo: "", cas_vyzvednuti: "", cas_vraceni: "", pricniky: "",
  })
  const [editZakaznikId, setEditZakaznikId] = useState<number | null>(null)
  const [editPrisl, setEditPrisl] = useState<Record<number, number>>({})
  const [dostupnost, setDostupnost] = useState<Record<number, number>>({})
  const [chyba, setChyba] = useState<string | null>(null)
  const [ukladam, setUkladam] = useState(false)
  const [mazani, setMazani] = useState(false)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  async function nactiHistorii(rezId: number) {
    const sb = createClient()
    const { data } = await sb
      .from("pujcovna_rezervace_historie")
      .select("id, created_at, stav")
      .eq("rezervace_id", rezId)
      .order("created_at", { ascending: false })
    setHistorie(data ?? [])
  }

  useEffect(() => {
    async function nacti() {
      const sb = createClient()
      const [{ data: r }, { data: pol }, { data: allRez }, { data: st }] = await Promise.all([
        sb.from("pujcovna_rezervace").select("*").eq("id", rezervaceId).single(),
        supabase.from("pujcovna_polozky").select("*").order("sort_order"),
        supabase.from("pujcovna_rezervace").select("*"),
        sb.from("pujcovna_ceny_stupne").select("*"),
      ])
      if (!r) { setLoading(false); return }

      setRez(r)
      setVsechnyPolozky(pol ?? [])
      setVsechnyRezervace(allRez ?? [])
      setStupne(st ?? [])

      const thisPol = (pol ?? []).find((p: Polozka) => p.id === r.item_id) ?? null
      setPolozka(thisPol)

      if (r.zakaznik_id) {
        const { data: zak } = await sb.from("zakaznici").select("*").eq("id", r.zakaznik_id).single()
        if (zak) setZakaznik(zak)
      }

      if (r.group_id) {
        const { data: skupRez } = await sb
          .from("pujcovna_rezervace").select("*")
          .eq("group_id", r.group_id).neq("id", r.id)
        if (skupRez && skupRez.length > 0) {
          const itemIds = [...new Set(skupRez.map((x: Rezervace) => x.item_id))]
          const { data: skupPol } = await supabase.from("pujcovna_polozky").select("*").in("id", itemIds)
          const polMap = Object.fromEntries((skupPol ?? []).map((x: Polozka) => [x.id, x]))
          setPrislData(skupRez.map((x: Rezervace) => ({ rez: x, polozka: polMap[x.item_id] })))
          const vybrane: Record<number, number> = {}
          skupRez.forEach((rx: Rezervace) => { vybrane[rx.item_id] = (vybrane[rx.item_id] ?? 0) + 1 })
          setEditPrisl(vybrane)
        }
      }

      setForm({
        item_id: r.item_id, unit_index: r.unit_index, customer: r.customer,
        start_date: r.start_date, end_date: r.end_date, color: r.color,
        notes: r.notes ?? "", vozidlo: r.vozidlo ?? "",
        cas_vyzvednuti: r.cas_vyzvednuti ?? "", cas_vraceni: r.cas_vraceni ?? "",
        pricniky: r.pricniky ?? "",
      })
      setEditZakaznikId(r.zakaznik_id)
      setLoading(false)
    }
    nacti()
    nactiHistorii(rezervaceId)
  }, [rezervaceId])

  const stanyIds = new Set(vsechnyPolozky.filter(p => p.category === "Stany").map(p => p.id))
  const jeStanVybran = stanyIds.has(Number(form.item_id))
  const prislusenstvi = vsechnyPolozky.filter(p => p.category !== "Stany")
  const kategoriePrisl = [...new Set(prislusenstvi.map(p => p.category))]

  useEffect(() => {
    if (!jeStanVybran || !form.start_date || !form.end_date) return
    const start = new Date(form.start_date)
    const end = new Date(form.end_date)
    const vysl: Record<number, number> = {}
    const skupinaEdit = rez?.group_id
    for (const p of prislusenstvi) {
      const obsazeno = vsechnyRezervace.filter(r => {
        if (r.item_id !== p.id) return false
        if (skupinaEdit && r.group_id === skupinaEdit) return false
        return start <= new Date(r.end_date) && end >= new Date(r.start_date)
      }).length
      vysl[p.id] = p.neomezene ? 999 : Math.max(0, p.unit_num - obsazeno)
    }
    setDostupnost(vysl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.start_date, form.end_date, form.item_id, jeStanVybran, vsechnyPolozky.length])

  async function zmenStav(novyStav: string) {
    if (!rez || novyStav === rez.stav) return
    const sb = createClient()
    await sb.from("pujcovna_rezervace").update({ stav: novyStav }).eq("id", rez.id)
    await sb.from("pujcovna_rezervace_historie").insert([{ rezervace_id: rez.id, stav: novyStav }])
    setRez({ ...rez, stav: novyStav })
    nactiHistorii(rez.id)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const updated = { ...form, [e.target.name]: e.target.value }
    if (e.target.name === "item_id") {
      const pol = vsechnyPolozky.find(p => p.id === Number(e.target.value))
      if (pol && stanyIds.has(pol.id)) updated.color = barvaStanu(pol)
    }
    setForm(updated)
  }

  function jeKonflikt(): boolean {
    const start = new Date(form.start_date)
    const end = new Date(form.end_date)
    return vsechnyRezervace.some(r => {
      if (r.item_id !== Number(form.item_id) || r.unit_index !== form.unit_index) return false
      if (r.id === rezervaceId) return false
      return start <= new Date(r.end_date) && end >= new Date(r.start_date)
    })
  }

  function sestavPrisl(gid: string | null): object[] {
    const rows: object[] = []
    const usedSlots: Record<number, number[]> = {}
    for (const [idStr, pocet] of Object.entries(editPrisl)) {
      if (!pocet) continue
      const itemId = Number(idStr)
      usedSlots[itemId] = usedSlots[itemId] ?? []
      const pol = vsechnyPolozky.find(p => p.id === itemId)
      if (!pol) continue
      for (let i = 0; i < pocet; i++) {
        let slot = 0
        for (let ui = 0; ui < pol.unit_num; ui++) {
          if (usedSlots[itemId].includes(ui)) continue
          const konflikt = vsechnyRezervace.some(r => {
            if (r.item_id !== itemId || r.unit_index !== ui) return false
            if (rez?.group_id && r.group_id === rez.group_id) return false
            return new Date(form.start_date) <= new Date(r.end_date) &&
                   new Date(form.end_date) >= new Date(r.start_date)
          })
          if (!konflikt) { slot = ui; break }
        }
        usedSlots[itemId].push(slot)
        rows.push({
          item_id: itemId, unit_index: slot,
          customer: form.customer, start_date: form.start_date, end_date: form.end_date,
          color: form.color, notes: "", group_id: gid, zakaznik_id: editZakaznikId,
        })
      }
    }
    return rows
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setChyba(null)
    if (!editZakaznikId) { setChyba("Vyberte zákazníka z centrální databáze"); return }
    if (form.start_date > form.end_date) { setChyba("Datum konce musí být po datu začátku"); return }
    if (jeKonflikt()) { setChyba("Konflikt: tato položka je již rezervována v tomto termínu"); return }
    setUkladam(true)

    const groupId = rez?.group_id ?? (jeStanVybran ? crypto.randomUUID() : null)
    await supabase.from("pujcovna_rezervace").update({
      ...form, item_id: Number(form.item_id), group_id: groupId, zakaznik_id: editZakaznikId,
    }).eq("id", rezervaceId)

    if (groupId) {
      await supabase.from("pujcovna_rezervace").delete().eq("group_id", groupId).neq("id", rezervaceId)
      const prislRows = sestavPrisl(groupId)
      if (prislRows.length > 0) await supabase.from("pujcovna_rezervace").insert(prislRows)
    }
    onSave()
  }

  async function handleSmazat() {
    if (!rez) return
    if (rez.group_id) {
      await supabase.from("pujcovna_rezervace").delete().eq("group_id", rez.group_id)
    } else {
      await supabase.from("pujcovna_rezervace").delete().eq("id", rez.id)
    }
    onSave()
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const lbl = "block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1"
  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )

  if (loading) {
    return (
      <Wrapper>
        <div className="p-8 text-gray-500 text-sm text-center">Načítám...</div>
      </Wrapper>
    )
  }

  if (!rez || !polozka) {
    return (
      <Wrapper>
        <div className="p-8 text-center">
          <p className="text-gray-500 text-sm mb-3">Rezervace nenalezena.</p>
          <button onClick={onClose} className="text-emerald-600 text-sm hover:underline">Zavřít</button>
        </div>
      </Wrapper>
    )
  }

  const stanLabel = polozka.unit_num > 1 ? `${polozka.name} ${rez.unit_index + 1}` : polozka.name
  const dni = pocetDni(rez.start_date, rez.end_date)
  const cenaStan = vypocitejCenu(polozka, stupne, dni)
  const cenyPrisl = prislData.map(({ rez: r, polozka: p }) => ({
    name: p?.name ?? "—",
    vypocet: p ? vypocitejCenu(p, stupne, pocetDni(r.start_date, r.end_date)) : null,
  }))
  const montazPoplatek = polozka.category === "Stany" && dni <= 4 ? 500 : 0
  const celkem = (cenaStan?.celkem ?? 0) + cenyPrisl.reduce((s, c) => s + (c.vypocet?.celkem ?? 0), 0) + montazPoplatek

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (view === "detail") {
    return (
      <Wrapper>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900">Detail výpůjčky</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("edit")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Upravit
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">

          {/* Stan + stav */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="h-1.5" style={{ backgroundColor: rez.color }} />
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{ backgroundColor: rez.color + "22" }}>⛺</div>
                <div>
                  <p className="font-bold text-gray-900">{stanLabel}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{polozka.category}</p>
                </div>
              </div>
              <select
                value={rez.stav ?? "rezervace"}
                onChange={e => zmenStav(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border-0 cursor-pointer focus:outline-none ${stavInfo(rez.stav).barva}`}
              >
                {STAVY.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Zákazník */}
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Zákazník</p>
            <p className="font-semibold text-gray-900">{zakaznik ? (zakaznik.firma?.trim() || `${zakaznik.jmeno} ${zakaznik.prijmeni}`.trim()) : rez.customer}</p>
            {zakaznik?.telefon && <a href={`tel:${zakaznik.telefon}`} className="text-emerald-600 text-sm mt-1 block hover:underline">{zakaznik.telefon}</a>}
            {zakaznik?.email && <a href={`mailto:${zakaznik.email}`} className="text-emerald-600 text-sm block hover:underline">{zakaznik.email}</a>}
          </div>

          {/* Termín */}
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Termín</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Od</p>
                <p className="font-semibold text-gray-900 text-sm">{formatDatum(rez.start_date)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Do</p>
                <p className="font-semibold text-gray-900 text-sm">{formatDatum(rez.end_date)}</p>
              </div>
            </div>
            <div className="mt-3 bg-emerald-50 rounded-lg px-3 py-2 flex items-center gap-2">
              <p className="text-emerald-700 font-semibold text-sm">{dni} {dni === 1 ? "den" : dni < 5 ? "dny" : "dní"}</p>
              {montazPoplatek > 0 && (
                <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded-full">+ montáž 500 Kč</span>
              )}
            </div>
          </div>

          {/* Vozidlo + logistika */}
          {(rez.vozidlo || rez.cas_vyzvednuti || rez.cas_vraceni || rez.pricniky) && (
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Vozidlo a logistika</p>
              <div className="space-y-2">
                {rez.vozidlo && <div className="flex justify-between"><span className="text-xs text-gray-400">Vozidlo</span><span className="text-sm font-medium text-gray-900">{rez.vozidlo}</span></div>}
                {rez.cas_vyzvednuti && <div className="flex justify-between"><span className="text-xs text-gray-400">Vyzvednutí</span><span className="text-sm font-medium text-gray-900">{rez.cas_vyzvednuti} hod</span></div>}
                {rez.cas_vraceni && <div className="flex justify-between"><span className="text-xs text-gray-400">Vrácení</span><span className="text-sm font-medium text-gray-900">{rez.cas_vraceni} hod</span></div>}
                {rez.pricniky && <div className="flex justify-between"><span className="text-xs text-gray-400">Příčníky</span><span className="text-sm font-medium text-gray-900">{rez.pricniky === "vlastni" ? "Má vlastní" : "Chce půjčit"}</span></div>}
              </div>
            </div>
          )}

          {/* Příslušenství */}
          {prislData.length > 0 && (
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Příslušenství</p>
              <div className="space-y-1">
                {prislData.map(({ rez: r, polozka: p }) => (
                  <div key={r.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-800">{p?.name ?? "—"}</span>
                    {p && p.unit_num > 1 && <span className="text-xs text-gray-400">#{r.unit_index + 1}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cena */}
          {(cenaStan || cenyPrisl.some(c => c.vypocet)) && (
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Cena</p>
              <div className="space-y-2">
                {cenaStan && (
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-sm font-medium text-gray-900">{stanLabel}</p><p className="text-xs text-gray-400">{cenaStan.popis}</p></div>
                    <p className="text-sm font-semibold text-gray-900 shrink-0">{formatCena(cenaStan.celkem)}</p>
                  </div>
                )}
                {cenyPrisl.map((c, i) => c.vypocet && (
                  <div key={i} className="flex items-start justify-between gap-3">
                    <div><p className="text-sm font-medium text-gray-900">{c.name}</p><p className="text-xs text-gray-400">{c.vypocet.popis}</p></div>
                    <p className="text-sm font-semibold text-gray-900 shrink-0">{formatCena(c.vypocet.celkem)}</p>
                  </div>
                ))}
                {montazPoplatek > 0 && (
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-sm font-medium text-gray-900">Poplatek za montáž</p><p className="text-xs text-gray-400">Zápůjčka ≤ 4 dny</p></div>
                    <p className="text-sm font-semibold text-gray-900 shrink-0">{formatCena(montazPoplatek)}</p>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-700">Celkem</p>
                  <p className="text-base font-bold text-emerald-700">{formatCena(celkem)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Poznámka */}
          {rez.notes && (
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Poznámka</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{rez.notes}</p>
            </div>
          )}

          {/* Historie */}
          {historie.length > 0 && (
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Historie</p>
              <div className="space-y-2">
                {historie.map((h, i) => (
                  <div key={h.id} className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full ${stavInfo(h.stav).barva.split(" ")[0]}`} />
                      {i < historie.length - 1 && <div className="w-px h-5 bg-gray-200 mt-1" />}
                    </div>
                    <div className="flex-1 flex items-center justify-between">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${stavInfo(h.stav).barva}`}>{stavInfo(h.stav).label}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(h.created_at).toLocaleDateString("cs-CZ", { day: "numeric", month: "short" })}
                        {" "}
                        {new Date(h.created_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </Wrapper>
    )
  }

  // ── Edit view ────────────────────────────────────────────────────────────────
  const editDni = pocetDni(form.start_date, form.end_date)

  return (
    <Wrapper>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setView("detail")} className="text-gray-400 hover:text-gray-700 transition-colors p-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="font-bold text-gray-900">Upravit rezervaci</h2>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
        <div className="p-5 space-y-4">

          <div>
            <label className={lbl}>Položka</label>
            <select name="item_id" value={form.item_id} onChange={handleChange} className={inp}>
              {[...vsechnyPolozky].sort((a, b) => {
                const ai = KATEGORIE_ORDER.indexOf(a.category)
                const bi = KATEGORIE_ORDER.indexOf(b.category)
                if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                return a.sort_order - b.sort_order
              }).map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
              ))}
            </select>
          </div>

          <div>
            <label className={lbl}>Zákazník</label>
            <ZakaznikSearch
              projekt="Půjčovna"
              accentColor="emerald"
              onSelect={(z: Zakaznik) => {
                setEditZakaznikId(z.id)
                setForm(f => ({ ...f, customer: `${z.jmeno} ${z.prijmeni}`.trim() || f.customer }))
              }}
            />
            {editZakaznikId && <p className="mt-1.5 text-xs text-emerald-600 font-medium">✓ {form.customer}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Od</label>
              <input type="date" name="start_date" value={form.start_date} onChange={handleChange} className={inp} />
            </div>
            <div>
              <label className={lbl}>Do</label>
              <input type="date" name="end_date" value={form.end_date} onChange={handleChange} className={inp} />
            </div>
          </div>

          <div>
            <label className={lbl}>Značka a model vozu</label>
            <input name="vozidlo" value={form.vozidlo} onChange={handleChange} placeholder="např. Škoda Octavia Combi" className={inp} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Vyzvednutí</label>
              <select name="cas_vyzvednuti" value={form.cas_vyzvednuti} onChange={handleChange} className={inp}>
                <option value="">Vybrat...</option>
                {Array.from({ length: 14 }, (_, i) => i + 8).map(h => (
                  <option key={h} value={`${h}:00 - ${h + 1}:00`}>{h}:00 – {h + 1}:00</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Vrácení</label>
              <select name="cas_vraceni" value={form.cas_vraceni} onChange={handleChange} className={inp}>
                <option value="">Vybrat...</option>
                {Array.from({ length: 14 }, (_, i) => i + 8).map(h => (
                  <option key={h} value={`${h}:00 - ${h + 1}:00`}>{h}:00 – {h + 1}:00</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={lbl}>Příčníky na vozidlo</label>
            <select name="pricniky" value={form.pricniky} onChange={handleChange} className={inp}>
              <option value="">Vybrat...</option>
              <option value="vlastni">Mám vlastní</option>
              <option value="pujcit">Chce půjčit</option>
            </select>
          </div>

          <div>
            <label className={lbl}>Poznámka</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={2} placeholder="Volitelná poznámka..." className={inp} />
          </div>

          {/* Cena summary */}
          {(() => {
            function cenaPolozky(pol: Polozka, pocet: number): number | null {
              if (pol.cena_typ === "kusova") return pol.cena_fixni != null ? pol.cena_fixni * pocet : null
              if (pol.cena_typ === "fixni") {
                if (!pol.cena_fixni) return null
                return pol.cena_fixni * editDni * pocet
              }
              const tier = stupne.find(s => s.polozka_id === pol.id && s.dni_od <= editDni && (s.dni_do === null || s.dni_do >= editDni))
              return tier ? tier.cena_za_den * editDni * pocet : null
            }
            const hlavniPol = vsechnyPolozky.find(p => p.id === Number(form.item_id))
            const cenaStan2 = hlavniPol ? cenaPolozky(hlavniPol, 1) : null
            const radkyPrisl = Object.entries(editPrisl)
              .filter(([, count]) => count > 0)
              .map(([idStr, count]) => {
                const pol = vsechnyPolozky.find(p => p.id === Number(idStr))
                return { name: pol?.name ?? "?", cena: pol ? cenaPolozky(pol, count) : null, pocet: count }
              })
            const majakouCenu = cenaStan2 !== null || radkyPrisl.some(r => r.cena !== null)
            if (!majakouCenu) return null
            const montaz = jeStanVybran && editDni <= 4 ? 500 : 0
            const celkemEdit = (cenaStan2 ?? 0) + radkyPrisl.reduce((s, r) => s + (r.cena ?? 0), 0) + montaz
            return (
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <div className="space-y-1.5">
                  {cenaStan2 !== null && hlavniPol && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{hlavniPol.name} <span className="text-gray-400">({editDni} dní)</span></span>
                      <span className="font-medium text-gray-900">{cenaStan2.toLocaleString("cs-CZ")} Kč</span>
                    </div>
                  )}
                  {radkyPrisl.map((r, i) => r.cena !== null && (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600">{r.name}{r.pocet > 1 ? ` ×${r.pocet}` : ""}</span>
                      <span className="font-medium text-gray-900">{r.cena.toLocaleString("cs-CZ")} Kč</span>
                    </div>
                  ))}
                  {montaz > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Poplatek za montáž <span className="text-gray-400">(≤ 4 dny)</span></span>
                      <span className="font-medium text-gray-900">500 Kč</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-emerald-200 mt-1">
                    <span className="text-sm font-bold text-gray-700">Celkem</span>
                    <span className="text-base font-bold text-emerald-700">{celkemEdit.toLocaleString("cs-CZ")} Kč</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Příslušenství */}
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
                        const vybrano = editPrisl[p.id] ?? 0
                        const nedostupne = volnych === 0
                        return (
                          <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${nedostupne && vybrano === 0 ? "opacity-40" : ""}`}>
                            <span className="flex-1 text-sm text-gray-700">{p.name}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mr-2 ${nedostupne && vybrano === 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                              {nedostupne && vybrano === 0 ? "nedost." : p.neomezene ? "∞" : `${volnych} vol.`}
                            </span>
                            <div className="flex items-center gap-1">
                              <button type="button" disabled={vybrano === 0}
                                onClick={() => setEditPrisl(prev => ({ ...prev, [p.id]: Math.max(0, vybrano - 1) }))}
                                className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-gray-700 font-bold text-lg flex items-center justify-center">−</button>
                              <span className="w-6 text-center text-sm font-semibold text-gray-800">{vybrano}</span>
                              <button type="button" disabled={!p.neomezene && vybrano >= volnych}
                                onClick={() => setEditPrisl(prev => ({ ...prev, [p.id]: vybrano + 1 }))}
                                className="w-7 h-7 rounded-lg bg-emerald-100 hover:bg-emerald-200 disabled:opacity-30 text-emerald-700 font-bold text-lg flex items-center justify-center">+</button>
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
          {!mazani && (
            <button type="button" onClick={() => setMazani(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
              Smazat
            </button>
          )}
          {mazani && (
            <>
              <button type="button" onClick={handleSmazat}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                Potvrdit smazání
              </button>
              <button type="button" onClick={() => setMazani(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                Zrušit
              </button>
            </>
          )}
          {!mazani && (
            <>
              <button type="button" onClick={() => setView("detail")}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                Zpět
              </button>
              <button type="submit" disabled={ukladam}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {ukladam ? "Ukládám..." : "Uložit"}
              </button>
            </>
          )}
        </div>
      </form>
    </Wrapper>
  )
}
