"use client"

import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { dphRozpad, formatKc } from "@/lib/dph"

// Poznámka: pujcovna_ceny_stupne má RLS — načítáme přes API route která má service role key

// ── Types ─────────────────────────────────────────────────────────────────────
type Polozka = {
  id: number; name: string; category: string
  unit_num: number; sort_order: number
  cena_typ: "fixni" | "stupnovana" | "kusova"
  cena_fixni: number | null; neomezene?: boolean
}
type Stupen = { polozka_id: number; dni_od: number; dni_do: number | null; cena_za_den: number }
type RezRow  = { id: number; item_id: number; unit_index: number; start_date: string; end_date: string; group_id: string | null }
type Step    = "vybrat" | "overuji" | "formular" | "odesilam" | "hotovo"

// PRISL_CATS = kategorie příslušenství zobrazené v sekci Příslušenství
const PRISL_CATS = new Set(["Markýzy","Sedátka","Napájení","Ledničky","Redukce","Camping sety","Stolky","Vařiče","Reproduktory","Ostatní"])
// NOT_MAIN_CATS = všechny kategorie které NEJSOU samostatně půjčitelné (příslušenství + příčníky)
const NOT_MAIN_CATS = new Set([...PRISL_CATS, "Příčníky"])
const BARVY_STANU: Record<string, string> = { "mal":"#F23753", "střed":"#3477F5", "velk":"#F3940E" }

// Zobrazovaný název a technické info autostanů — jen pro veřejný formulář, DB se nemění
const STAN_DETAILS: Record<string, { nazev: string; info: string }> = {
  "mal":   { nazev: "Autostan MALÁ Alaska pro 2 osoby",   info: "rozměr matrace: 135×235 cm | váha: 50 kg" },
  "střed": { nazev: "Autostan STŘEDNÍ Alaska pro 3 osoby", info: "rozměr matrace: 155×235 cm | váha: 55 kg" },
  "velk":  { nazev: "Autostan VELKÁ Alaska pro 4 osoby",   info: "rozměr matrace: 185×235 cm | váha: 65 kg" },
}
function stanDetail(pol: Polozka): { nazev: string; info: string } | null {
  if (pol.category !== "Stany") return null
  const n = pol.name.toLowerCase()
  for (const [k, v] of Object.entries(STAN_DETAILS)) if (n.includes(k)) return v
  return null
}

// Virtuální kategorie Držáky kol — dvě varianty, obě odkazují na stejný produkt Thule
const DRZAK_KAT       = "Držáky kol"
const DRZAK_THULE_NAME = "Držák kol Thule"
const DRZAK_VARIANTY  = [
  { label: "Držák pro 3 kola", pocetKol: 3 },
  { label: "Držák pro 4 kola", pocetKol: 4 },
]
const HODINY = Array.from({ length: 14 }, (_,i) => i + 8).map(h => `${h}:00 – ${h+1}:00`)

// ── Helpers ───────────────────────────────────────────────────────────────────
function pocetDni(a: string, b: string) { return Math.round((+new Date(b) - +new Date(a)) / 86400000) + 1 }
function formatCena(c: number) { return c.toLocaleString("cs-CZ") + " Kč" }
function formatDatum(d: string) { return new Date(d).toLocaleDateString("cs-CZ",{day:"numeric",month:"long",year:"numeric"}) }
function dnesIso() { return new Date().toISOString().slice(0,10) }
function pridejDen(iso: string) {
  const d = new Date(iso); d.setDate(d.getDate() + 1); return d.toISOString().slice(0,10)
}

function barvaPolozky(pol: Polozka): string {
  if (pol.category !== "Stany") return "#10b981"
  const n = pol.name.toLowerCase()
  for (const [k,v] of Object.entries(BARVY_STANU)) if (n.includes(k)) return v
  return "#10b981"
}
function cenaPolozky(pol: Polozka, stupne: Stupen[], dni: number): number | null {
  if (pol.cena_typ === "kusova") return pol.cena_fixni ?? null
  if (pol.cena_typ === "fixni")  return pol.cena_fixni != null ? pol.cena_fixni * dni : null
  // Přesný tier (dni_od <= dni <= dni_do, nebo dni_do = null = neomezeno)
  const tier = stupne.find(s => s.polozka_id === pol.id && s.dni_od <= dni && (s.dni_do === null || s.dni_do >= dni))
  if (tier) return tier.cena_za_den * dni
  // Záloha: nejvyšší tier jehož dni_od <= dni (pokryje mezery v ceníku)
  const fallback = stupne
    .filter(s => s.polozka_id === pol.id && s.dni_od <= dni)
    .sort((a, b) => b.dni_od - a.dni_od)[0]
  return fallback ? fallback.cena_za_den * dni : null
}
function cenaPopis(pol: Polozka, stupne: Stupen[]): string {
  if (pol.cena_typ === "kusova" && pol.cena_fixni) return formatCena(pol.cena_fixni)
  if (pol.cena_typ === "fixni"  && pol.cena_fixni) return `od ${formatCena(pol.cena_fixni)}/den`
  const tiers = stupne.filter(s => s.polozka_id === pol.id).sort((a,b) => a.cena_za_den - b.cena_za_den)
  if (tiers.length) return `od ${formatCena(tiers[0].cena_za_den)}/den`
  return ""
}
function volnych(itemId: number, unitNum: number, neomezene: boolean|undefined, start: string, end: string, rez: RezRow[]) {
  if (neomezene) return 999
  const obs = rez.filter(r => r.item_id === itemId && start <= r.end_date && end >= r.start_date).length
  return Math.max(0, unitNum - obs)
}
function freeUnit(itemId: number, unitNum: number, start: string, end: string, rez: RezRow[], used: number[]) {
  for (let ui = 0; ui < unitNum; ui++) {
    if (used.includes(ui)) continue
    if (!rez.some(r => r.item_id === itemId && r.unit_index === ui && start <= r.end_date && end >= r.start_date)) return ui
  }
  return 0
}
function ikonaKat(cat: string) {
  if (cat === "Stany") return "⛺"
  if (cat === "Paddleboardy") return "🏄"
  return "🚲"
}
// Zobrazovaný název kategorie (DB hodnota → UI label)
function katLabel(cat: string) {
  if (cat === "Stany") return "Autostany"
  return cat
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width:"100%", boxSizing:"border-box", padding:"9px 13px",
  border:"1.5px solid #e5e7eb", borderRadius:9, fontSize:14,
  color:"#111827", outline:"none", fontFamily:"inherit", background:"white",
}
const lbl: React.CSSProperties = { display:"block", fontSize:12.5, fontWeight:600, color:"#4b5563", marginBottom:4 }
const card: React.CSSProperties = {
  background:"white", borderRadius:14, padding:"16px",
  border:"1px solid #e5e7eb", marginBottom:12,
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function RezervacePage() {
  const [polozky,  setPolozky]  = useState<Polozka[]>([])
  const [stupne,   setStupne]   = useState<Stupen[]>([])
  const [vsechRez, setVsechRez] = useState<RezRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [step,         setStep]         = useState<Step>("vybrat")
  const [chyba,        setChyba]        = useState<string | null>(null)
  const [alternativy,  setAlternativy]  = useState<Polozka[]>([])
  const [drzakVariant, setDrzakVariant] = useState<string | null>(null)

  // Krok 1
  const [selCat,  setSelCat]  = useState<string | null>(null)
  const [selItem, setSelItem] = useState<number | null>(null)
  const [dateFrom,setDateFrom]= useState("")
  const [dateTo,  setDateTo]  = useState("")

  // Příslušenství
  const [prisl,       setPrisl]       = useState<Record<number, number>>({})
  const [dostupPrisl, setDostupPrisl] = useState<Record<number, number>>({})

  // Formulář zákazníka
  const [form, setForm] = useState({
    jmeno:"", prijmeni:"", email:"", telefon:"",
    ulice:"", mesto:"", psc:"",
    vozidlo:"", pricniky:"", cas_vyzvednuti:"", cas_vraceni:"",
    poznamka:"",
  })
  const [gdpr,    setGdpr]    = useState(false)
  const [pujcRad, setPujcRad] = useState(false)

  // ── Auto-resize iframe ─────────────────────────────────────────────────────
  useEffect(() => {
    function sendHeight() {
      const h = document.documentElement.scrollHeight
      window.parent?.postMessage({ type: "iframe-resize", height: h }, "*")
    }
    sendHeight()
    const ro = new ResizeObserver(sendHeight)
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [step])

  // ── Derived ────────────────────────────────────────────────────────────────
  const mainKats   = useMemo(() => {
    const fromDb = [...new Set(polozky.filter(p => !NOT_MAIN_CATS.has(p.category)).map(p => p.category))]
    const hasDrzak = polozky.some(p => p.name === DRZAK_THULE_NAME)
    return hasDrzak ? [...fromDb, DRZAK_KAT] : fromDb
  }, [polozky])
  const itemyKat   = useMemo(() =>
    selCat ? polozky.filter(p => p.category === selCat) : [], [polozky, selCat])
  const selPolozka = useMemo(() =>
    polozky.find(p => p.id === selItem) ?? null, [polozky, selItem])
  const jeStany    = selPolozka?.category === "Stany"
  const prislusenstvi = useMemo(() => polozky.filter(p => PRISL_CATS.has(p.category)), [polozky])
  const katPrisl      = useMemo(() => [...new Set(prislusenstvi.map(p => p.category))], [prislusenstvi])
  const pricnikyItems = useMemo(() => polozky.filter(p => p.category === "Příčníky"), [polozky])

  const dni        = dateFrom && dateTo ? pocetDni(dateFrom, dateTo) : 0
  const cenaStan   = selPolozka && dni > 0 ? cenaPolozky(selPolozka, stupne, dni) : null
  const montazPopl = jeStany && dni > 0 && dni <= 4 ? 500 : 0

  const prislRadky = useMemo(() =>
    Object.entries(prisl)
      .filter(([,cnt]) => cnt > 0)
      .map(([id, cnt]) => {
        const pol = polozky.find(p => p.id === Number(id))
        if (!pol) return null
        return { pol, cnt, cena: cenaPolozky(pol, stupne, dni) }
      }).filter(Boolean) as {pol:Polozka;cnt:number;cena:number|null}[],
    [prisl, polozky, stupne, dni])

  const celkem     = (cenaStan ?? 0) + prislRadky.reduce((s,r) => s + (r.cena ?? 0) * r.cnt, 0) + montazPopl
  const thulePolozka = useMemo(() => polozky.find(p => p.name === DRZAK_THULE_NAME) ?? null, [polozky])
  // Příčníky jsou povinné jen pro stany
  const canSubmit  = !!(form.jmeno && form.prijmeni && form.email && form.telefon &&
    form.vozidlo && (jeStany ? form.pricniky : true) && form.cas_vyzvednuti && form.cas_vraceni && gdpr && pujcRad)

  function upd(k: string, v: string) { setForm(f => ({...f, [k]: v})) }

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Ceník načítáme přes API route (má service role key, obchází RLS)
    fetch("/api/pujcovna/cenik")
      .then(r => r.json())
      .then(({ polozky: pol, stupne: st }) => {
        setPolozky(pol ?? [])
        setStupne(st ?? [])
        setLoading(false)
      })
  }, [])

  // ── Ověřit dostupnost ──────────────────────────────────────────────────────
  async function overitDostupnost(itemIdOverride?: number) {
    const targetId = itemIdOverride ?? selItem
    if (!targetId || !dateFrom || !dateTo) { setChyba("Vyberte položku a termín."); return }
    if (dateFrom > dateTo) { setChyba("Datum vrácení musí být stejné nebo pozdější než vyzvednutí."); return }
    setChyba(null)
    setAlternativy([])
    setStep("overuji")
    const { data } = await supabase.from("pujcovna_rezervace")
      .select("id,item_id,unit_index,start_date,end_date,group_id")
    const rez = (data ?? []) as RezRow[]
    setVsechRez(rez)
    const pol = polozky.find(p => p.id === targetId)!
    if (volnych(pol.id, pol.unit_num, pol.neomezene, dateFrom, dateTo, rez) === 0) {
      // Hledej alternativní stany ve stejném termínu
      const jeStan = pol.category === "Stany"
      const dostupneAlternativy = jeStan
        ? polozky.filter(p =>
            p.category === "Stany" &&
            p.id !== targetId &&
            volnych(p.id, p.unit_num, p.neomezene, dateFrom, dateTo, rez) > 0
          )
        : []
      setAlternativy(dostupneAlternativy)
      setChyba(
        dostupneAlternativy.length > 0
          ? `${pol.name} není v tomto termínu k dispozici.`
          : "Tato položka není v daném termínu dostupná. Zkuste jiný termín."
      )
      setStep("vybrat"); return
    }
    if (itemIdOverride) setSelItem(itemIdOverride)
    if (jeStany) {
      const dp: Record<number,number> = {}
      // Příslušenství + příčníky (ty se zobrazují inline, ale taky potřebují dostupnost)
      for (const p of [...prislusenstvi, ...pricnikyItems])
        dp[p.id] = volnych(p.id, p.unit_num, p.neomezene, dateFrom, dateTo, rez)
      setDostupPrisl(dp)
    }
    setPrisl({})
    setStep("formular")
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selPolozka || !canSubmit) return
    setStep("odesilam")

    let zakaznikId: number | null = null
    const { data: byEmail } = await supabase.from("zakaznici").select("id").eq("email", form.email.trim()).maybeSingle()
    if (byEmail) {
      zakaznikId = byEmail.id
    } else {
      const { data: byPhone } = await supabase.from("zakaznici").select("id").eq("telefon", form.telefon.trim()).maybeSingle()
      if (byPhone) {
        zakaznikId = byPhone.id
      } else {
        const { data: nz } = await supabase.from("zakaznici")
          .insert({ jmeno:form.jmeno.trim(), prijmeni:form.prijmeni.trim(),
            email:form.email.trim(), telefon:form.telefon.trim(),
            ulice:form.ulice.trim(), mesto:form.mesto.trim(), psc:form.psc.trim(),
            projekty:["Půjčovna"] })
          .select("id").single()
        zakaznikId = nz?.id ?? null
      }
    }

    const groupId  = crypto.randomUUID()
    const customer = `${form.jmeno} ${form.prijmeni}`.trim()
    const used: Record<number,number[]> = {}
    const mainUnit = freeUnit(selPolozka.id, selPolozka.unit_num, dateFrom, dateTo, vsechRez, [])
    used[selPolozka.id] = [mainUnit]

    const { data: mainRez } = await supabase.from("pujcovna_rezervace").insert({
      item_id:selPolozka.id, unit_index:mainUnit, customer,
      start_date:dateFrom, end_date:dateTo, color:barvaPolozky(selPolozka),
      notes:[form.poznamka, drzakVariant ? `Varianta: ${drzakVariant}` : ""].filter(Boolean).join("\n"),
      group_id:groupId, zakaznik_id:zakaznikId,
      vozidlo:form.vozidlo, cas_vyzvednuti:form.cas_vyzvednuti,
      cas_vraceni:form.cas_vraceni, pricniky:form.pricniky, stav:"web-rezervace",
    }).select("id").single()

    if (jeStany) {
      const rows = []
      for (const [ids, cnt] of Object.entries(prisl)) {
        if (!cnt) continue
        const pid = Number(ids)
        const pol = polozky.find(p => p.id === pid); if (!pol) continue
        used[pid] = used[pid] ?? []
        for (let i = 0; i < cnt; i++) {
          const slot = freeUnit(pid, pol.unit_num, dateFrom, dateTo, vsechRez, used[pid])
          used[pid].push(slot)
          rows.push({ item_id:pid, unit_index:slot, customer, start_date:dateFrom, end_date:dateTo,
            color:barvaPolozky(selPolozka), notes:"", group_id:groupId,
            zakaznik_id:zakaznikId, stav:"web-rezervace" })
        }
      }
      if (rows.length) await supabase.from("pujcovna_rezervace").insert(rows)
    }
    if (mainRez?.id)
      await supabase.from("pujcovna_rezervace_historie").insert({ rezervace_id:mainRez.id, stav:"web-rezervace" })

    setStep("hotovo")
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const SecTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{fontSize:10.5,fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",color:"#9ca3af",marginBottom:12}}>{children}</div>
  )

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{padding:40,textAlign:"center",color:"#9ca3af",fontSize:14}}>Načítám formulář…</div>
  )

  // ── Hotovo ─────────────────────────────────────────────────────────────────
  if (step === "hotovo") return (
    <div style={{padding:"32px 16px",maxWidth:520,margin:"0 auto",textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:12}}>✅</div>
      <h2 style={{margin:"0 0 8px",fontSize:21,fontWeight:800,color:"#111827"}}>Rezervace přijata!</h2>
      <p style={{margin:"0 0 20px",color:"#6b7280",lineHeight:1.6}}>Děkujeme, brzy se Vám ozveme s potvrzením termínu.</p>
      <div style={{background:"#f0fdf4",borderRadius:12,padding:"14px 18px",textAlign:"left",border:"1px solid #bbf7d0"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Shrnutí</div>
        <div style={{fontSize:14,color:"#374151",lineHeight:1.8}}>
          <div><strong>{selPolozka?.name}</strong></div>
          <div>{formatDatum(dateFrom)} – {formatDatum(dateTo)}</div>
          {celkem > 0 && <div>Předběžná cena: <strong>{formatCena(celkem)}</strong></div>}
        </div>
      </div>
    </div>
  )

  // ── Krok 1: výběr ─────────────────────────────────────────────────────────
  if (step === "vybrat" || step === "overuji") return (
    <div style={{padding:"24px 16px"}}>
      <div style={{maxWidth:560,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <p style={{margin:0,fontSize:13.5,color:"#6b7280"}}>Vyberte položku a termín, pak ověříme dostupnost</p>
        </div>

        {/* Druh */}
        <div style={card}>
          <SecTitle>1. Co chcete půjčit</SecTitle>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(mainKats.length,3)},1fr)`,gap:8}}>
            {mainKats.map(cat => (
              <button key={cat} type="button"
                onClick={() => { setSelCat(cat); setSelItem(null); setDrzakVariant(null); setChyba(null); setAlternativy([]) }}
                style={{
                  padding:"13px 8px", borderRadius:10, cursor:"pointer", textAlign:"center",
                  border: selCat===cat ? "2px solid #10b981" : "2px solid #e5e7eb",
                  background: selCat===cat ? "#f0fdf4" : "white", transition:"all .15s",
                }}>
                <div style={{fontSize:24,marginBottom:4}}>{ikonaKat(cat)}</div>
                <div style={{fontSize:12.5,fontWeight:600,color:selCat===cat?"#16a34a":"#374151"}}>{katLabel(cat)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Typ */}
        {selCat && (
          <div style={card}>
            <SecTitle>2. Typ</SecTitle>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {selCat === DRZAK_KAT ? (
                // Virtuální varianty držáku — obě mapují na stejný produkt Thule
                DRZAK_VARIANTY.map(v => {
                  const active = selItem === thulePolozka?.id && drzakVariant === v.label
                  return (
                    <button key={v.label} type="button"
                      onClick={() => {
                        if (!thulePolozka) return
                        setSelItem(thulePolozka.id)
                        setDrzakVariant(v.label)
                        setChyba(null)
                        setAlternativy([])
                      }}
                      style={{
                        padding:"12px 14px", borderRadius:10, cursor:"pointer",
                        border: active ? "2px solid #10b981" : "2px solid #e5e7eb",
                        background: active ? "#f0fdf4" : "white",
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        transition:"all .15s", textAlign:"left",
                      }}>
                      <div>
                        <div style={{fontSize:14,fontWeight:600,color:active?"#16a34a":"#111827"}}>{v.label}</div>
                        <div style={{fontSize:12,color:"#6b7280",marginTop:1}}>
                          {thulePolozka ? cenaPopis(thulePolozka, stupne) : ""}
                        </div>
                      </div>
                      {active && <span style={{color:"#10b981",fontSize:18}}>✓</span>}
                    </button>
                  )
                })
              ) : (
                // Standardní položky z DB
                itemyKat.map(pol => {
                  const active  = selItem === pol.id
                  const detail  = stanDetail(pol)
                  const nazev   = detail?.nazev ?? pol.name
                  const cena    = cenaPopis(pol, stupne)
                  const infoStr = detail ? `${cena} | ${detail.info}` : cena
                  return (
                    <button key={pol.id} type="button" onClick={() => { setSelItem(pol.id); setChyba(null); setAlternativy([]) }}
                      style={{
                        padding:"12px 14px", borderRadius:10, cursor:"pointer",
                        border: active ? "2px solid #10b981" : "2px solid #e5e7eb",
                        background: active ? "#f0fdf4" : "white",
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        transition:"all .15s", textAlign:"left",
                      }}>
                      <div>
                        <div style={{fontSize:14,fontWeight:600,color:active?"#16a34a":"#111827"}}>{nazev}</div>
                        <div style={{fontSize:12,color:"#6b7280",marginTop:1}}>{infoStr}</div>
                      </div>
                      {active && <span style={{color:"#10b981",fontSize:18,flexShrink:0,marginLeft:8}}>✓</span>}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Termín */}
        {selItem && (
          <div style={card}>
            <SecTitle>3. Termín</SecTitle>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <label style={lbl}>Vyzvednutí</label>
                <div style={{position:"relative"}}>
                  <input type="date" value={dateFrom} min={dnesIso()}
                    onChange={e => {
                    const novy = e.target.value
                    setDateFrom(novy)
                    // Vrácení musí být nejdříve den po vyzvednutí
                    if (novy && (!dateTo || dateTo <= novy)) setDateTo(pridejDen(novy))
                  }}
                    style={{...inp, color: dateFrom ? "#111827" : "transparent"}} />
                  {!dateFrom && (
                    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",paddingLeft:13,fontSize:14,color:"#9ca3af",pointerEvents:"none",userSelect:"none"}}>
                      dd.mm.rrrr
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label style={lbl}>Vrácení</label>
                <div style={{position:"relative"}}>
                  <input type="date" value={dateTo} min={dateFrom ? pridejDen(dateFrom) : pridejDen(dnesIso())}
                    onChange={e => setDateTo(e.target.value)}
                    style={{...inp, color: dateTo ? "#111827" : "transparent"}} />
                  {!dateTo && (
                    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",paddingLeft:13,fontSize:14,color:"#9ca3af",pointerEvents:"none",userSelect:"none"}}>
                      dd.mm.rrrr
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Cena hned po výběru termínu ── */}
            {dateFrom && dateTo && dni > 0 && selPolozka && (
              <div style={{marginTop:12,background:"#f0fdf4",borderRadius:10,padding:"12px 14px",border:"1px solid #bbf7d0"}}>
                <div style={{fontSize:10.5,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"#16a34a",marginBottom:8}}>
                  Předběžná cena · {dni} {dni===1?"den":dni<5?"dny":"dní"}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {cenaStan !== null && (
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13.5}}>
                      <span style={{color:"#374151"}}>{selPolozka.name}</span>
                      <span style={{fontWeight:600,color:"#111827"}}>{formatCena(cenaStan)}</span>
                    </div>
                  )}
                  {montazPopl > 0 && (
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                      <span style={{color:"#6b7280"}}>Poplatek za montáž <span style={{fontSize:11}}>(≤ 4 dny)</span></span>
                      <span style={{fontWeight:600,color:"#111827"}}>500 Kč</span>
                    </div>
                  )}
                  {jeStany && (
                    <div style={{fontSize:11.5,color:"#6b7280",marginTop:2}}>
                      + příslušenství dle výběru v dalším kroku
                    </div>
                  )}
                  {cenaStan !== null && (
                    <div style={{paddingTop:6,marginTop:2,borderTop:"1px solid #bbf7d0"}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:14,fontWeight:700,color:"#111827"}}>Zatím celkem s DPH</span>
                        <span style={{fontSize:16,fontWeight:800,color:"#16a34a"}}>{formatCena((cenaStan ?? 0) + montazPopl)}</span>
                      </div>
                      {(() => {
                        const r = dphRozpad((cenaStan ?? 0) + montazPopl)
                        return (
                          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                            <span style={{fontSize:11,color:"#6b7280"}}>z toho DPH 21 % · základ bez DPH</span>
                            <span style={{fontSize:11,color:"#6b7280"}}>{formatKc(r.dph)} · {formatKc(r.bezdph)}</span>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chyba + alternativy */}
        {chyba && (
          <div style={{marginBottom:12}}>
            <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:9,padding:"11px 14px",color:"#dc2626",fontSize:13,marginBottom: alternativy.length > 0 ? 10 : 0}}>
              {chyba}
            </div>

            {alternativy.length > 0 && (
              <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:9,padding:"12px 14px"}}>
                <div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"#92400e",marginBottom:10}}>
                  Ve Vašem termínu je k dispozici:
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {alternativy.map(alt => (
                    <button key={alt.id} type="button"
                      onClick={() => {
                        setSelItem(alt.id)
                        setChyba(null)
                        setAlternativy([])
                        overitDostupnost(alt.id)
                      }}
                      style={{
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"10px 13px", borderRadius:9, cursor:"pointer",
                        border:"1.5px solid #10b981", background:"#f0fdf4",
                        textAlign:"left", transition:"all .15s",
                      }}>
                      <div>
                        <div style={{fontSize:14,fontWeight:600,color:"#065f46"}}>{alt.name}</div>
                        <div style={{fontSize:12,color:"#6b7280",marginTop:1}}>{cenaPopis(alt, stupne)}</div>
                      </div>
                      <span style={{fontSize:13,fontWeight:700,color:"#10b981",flexShrink:0,marginLeft:10}}>
                        Vybrat →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        {selItem && dateFrom && dateTo && (
          <button onClick={() => overitDostupnost()} disabled={step==="overuji"}
            style={{
              width:"100%", padding:"13px", borderRadius:12, border:"none",
              background: step==="overuji" ? "#d1fae5" : "#10b981",
              color: step==="overuji" ? "#059669" : "white",
              fontSize:15, fontWeight:700, cursor: step==="overuji" ? "default" : "pointer",
              transition:"all .15s",
            }}>
            {step==="overuji" ? "⏳ Ověřuji dostupnost…" : "Ověřit dostupnost →"}
          </button>
        )}
      </div>
    </div>
  )

  // ── Krok 2: formulář ──────────────────────────────────────────────────────
  const isOdesilam = step === "odesilam"

  return (
    <div style={{padding:"20px 16px"}}>
      <div style={{maxWidth:580,margin:"0 auto"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
          <button type="button" onClick={() => { setStep("vybrat"); setChyba(null) }}
            style={{background:"white",border:"1.5px solid #e5e7eb",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:13,color:"#6b7280",fontWeight:600,flexShrink:0}}>
            ← Zpět
          </button>
          <div>
            <p style={{margin:0,fontSize:15,fontWeight:800,color:"#111827"}}>{selPolozka?.name}</p>
            <p style={{margin:0,fontSize:12.5,color:"#6b7280"}}>{formatDatum(dateFrom)} – {formatDatum(dateTo)} · {dni} {dni===1?"den":dni<5?"dny":"dní"}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>

          {/* ── 1. Osobní údaje ── */}
          <div style={card}>
            <SecTitle>Vaše údaje</SecTitle>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={lbl}>Jméno *</label>
                  <input value={form.jmeno} onChange={e=>upd("jmeno",e.target.value)} placeholder="Jan" style={inp} disabled={isOdesilam} />
                </div>
                <div>
                  <label style={lbl}>Příjmení *</label>
                  <input value={form.prijmeni} onChange={e=>upd("prijmeni",e.target.value)} placeholder="Novák" style={inp} disabled={isOdesilam} />
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={lbl}>E-mail *</label>
                  <input type="email" value={form.email} onChange={e=>upd("email",e.target.value)} placeholder="jan@email.cz" style={inp} disabled={isOdesilam} />
                </div>
                <div>
                  <label style={lbl}>Telefon *</label>
                  <input type="tel" value={form.telefon} onChange={e=>upd("telefon",e.target.value)} placeholder="+420 777 000 000" style={inp} disabled={isOdesilam} />
                </div>
              </div>
              <div>
                <label style={lbl}>Ulice a č.p.</label>
                <input value={form.ulice} onChange={e=>upd("ulice",e.target.value)} placeholder="Václavské nám. 1" style={inp} disabled={isOdesilam} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 90px",gap:10}}>
                <div>
                  <label style={lbl}>Město</label>
                  <input value={form.mesto} onChange={e=>upd("mesto",e.target.value)} placeholder="Praha" style={inp} disabled={isOdesilam} />
                </div>
                <div>
                  <label style={lbl}>PSČ</label>
                  <input value={form.psc} onChange={e=>upd("psc",e.target.value)} placeholder="110 00" style={inp} disabled={isOdesilam} />
                </div>
              </div>
              <div>
                <label style={lbl}>Poznámka</label>
                <textarea value={form.poznamka} onChange={e=>upd("poznamka",e.target.value)} rows={2}
                  placeholder="Volitelné — zvláštní přání, dotazy…"
                  style={{...inp,resize:"vertical" as const,lineHeight:1.5}} disabled={isOdesilam} />
              </div>
            </div>
          </div>

          {/* ── 2. Vozidlo a logistika ── */}
          <div style={card}>
            <SecTitle>Vozidlo a logistika</SecTitle>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <label style={lbl}>Značka a model vozu *</label>
                <input value={form.vozidlo} onChange={e=>upd("vozidlo",e.target.value)} placeholder="např. Škoda Octavia Combi 2020" style={inp} disabled={isOdesilam} />
              </div>
              {/* Příčníky — jen pro stany */}
              {jeStany && <div>
                <label style={lbl}>Příčníky na vozidle *</label>
                <div style={{display:"flex",gap:8}}>
                  {[{v:"vlastni",l:"Mám vlastní"},{v:"pujcit",l:"Chci půjčit"}].map(o => (
                    <button key={o.v} type="button"
                      onClick={() => {
                        upd("pricniky", o.v)
                        // Přepnutí na "vlastní" — vyčisti případně přidané příčníky
                        if (o.v === "vlastni") {
                          setPrisl(prev => {
                            const next = {...prev}
                            for (const p of pricnikyItems) delete next[p.id]
                            return next
                          })
                        }
                      }}
                      style={{
                        flex:1, padding:"9px 6px", borderRadius:9, cursor:"pointer",
                        border: form.pricniky===o.v ? "2px solid #10b981" : "1.5px solid #e5e7eb",
                        background: form.pricniky===o.v ? "#f0fdf4" : "white",
                        fontSize:13, fontWeight:600,
                        color: form.pricniky===o.v ? "#16a34a" : "#374151",
                        transition:"all .15s",
                      }}>{o.l}</button>
                  ))}
                </div>

                {/* Inline výběr příčníků — zobrazí se jen když chce půjčit */}
                {form.pricniky === "pujcit" && pricnikyItems.length > 0 && (
                  <div style={{marginTop:8,padding:"10px 12px",background:"#f9fafb",borderRadius:9,border:"1px solid #e5e7eb"}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",color:"#9ca3af",marginBottom:8}}>
                      Vyberte typ příčníků
                    </div>
                    {pricnikyItems.map(p => {
                      const vol = p.neomezene ? 999 : (dostupPrisl[p.id] ?? 0)
                      const vyb = prisl[p.id] ?? 0
                      const c   = cenaPolozky(p, stupne, dni)
                      return (
                        <div key={p.id} style={{display:"flex",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f3f4f6"}}>
                          <div style={{flex:1}}>
                            <span style={{fontSize:13.5,fontWeight:500,color:"#111827"}}>{p.name}</span>
                            {c !== null && <span style={{fontSize:11.5,color:"#6b7280",marginLeft:8}}>{formatCena(c)}</span>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{fontSize:11,color:"#9ca3af",marginRight:4}}>{p.neomezene?"∞":`${vol} vol.`}</span>
                            <button type="button" disabled={vyb===0}
                              onClick={() => setPrisl(prev => ({...prev,[p.id]:Math.max(0,vyb-1)}))}
                              style={{width:26,height:26,borderRadius:6,border:"1.5px solid #e5e7eb",background:"white",cursor:vyb===0?"default":"pointer",fontSize:15,fontWeight:700,color:"#374151",display:"flex",alignItems:"center",justifyContent:"center",opacity:vyb===0?.4:1}}>−</button>
                            <span style={{width:20,textAlign:"center",fontSize:14,fontWeight:600,color:"#111827"}}>{vyb}</span>
                            <button type="button" disabled={!p.neomezene && vyb>=vol}
                              onClick={() => setPrisl(prev => ({...prev,[p.id]:vyb+1}))}
                              style={{width:26,height:26,borderRadius:6,border:"1.5px solid #10b981",background:"#f0fdf4",cursor:(!p.neomezene&&vyb>=vol)?"default":"pointer",fontSize:15,fontWeight:700,color:"#10b981",display:"flex",alignItems:"center",justifyContent:"center",opacity:(!p.neomezene&&vyb>=vol)?.4:1}}>+</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={lbl}>Čas vyzvednutí *</label>
                  <select value={form.cas_vyzvednuti} onChange={e=>upd("cas_vyzvednuti",e.target.value)} style={inp} disabled={isOdesilam}>
                    <option value="">Vyberte…</option>
                    {HODINY.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Čas vrácení *</label>
                  <select value={form.cas_vraceni} onChange={e=>upd("cas_vraceni",e.target.value)} style={inp} disabled={isOdesilam}>
                    <option value="">Vyberte…</option>
                    {HODINY.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. Příslušenství (jen stany) ── */}
          {jeStany && (
            <div style={card}>
              <SecTitle>Příslušenství</SecTitle>
              <p style={{margin:"0 0 12px",fontSize:12.5,color:"#6b7280"}}>
                Zobrazujeme pouze příslušenství dostupné ve Vašem termínu.
              </p>
              {katPrisl.map(kat => {
                const polKat = prislusenstvi.filter(p => p.category === kat && ((dostupPrisl[p.id] ?? 0) > 0 || p.neomezene))
                if (!polKat.length) return null
                return (
                  <div key={kat} style={{marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",color:"#9ca3af",marginBottom:5}}>{kat}</div>
                    {polKat.map(p => {
                      const vol = p.neomezene ? 999 : (dostupPrisl[p.id] ?? 0)
                      const vyb = prisl[p.id] ?? 0
                      const c   = cenaPolozky(p, stupne, dni)
                      return (
                        <div key={p.id} style={{display:"flex",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
                          <div style={{flex:1}}>
                            <span style={{fontSize:13.5,fontWeight:500,color:"#111827"}}>{p.name}</span>
                            {c !== null && <span style={{fontSize:11.5,color:"#6b7280",marginLeft:8}}>{formatCena(c)}</span>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{fontSize:11,color:"#9ca3af",marginRight:4}}>{p.neomezene?"∞":`${vol} vol.`}</span>
                            <button type="button" disabled={vyb===0}
                              onClick={() => setPrisl(prev => ({...prev,[p.id]:Math.max(0,vyb-1)}))}
                              style={{width:26,height:26,borderRadius:6,border:"1.5px solid #e5e7eb",background:"white",cursor:vyb===0?"default":"pointer",fontSize:15,fontWeight:700,color:"#374151",display:"flex",alignItems:"center",justifyContent:"center",opacity:vyb===0?.4:1}}>−</button>
                            <span style={{width:20,textAlign:"center",fontSize:14,fontWeight:600,color:"#111827"}}>{vyb}</span>
                            <button type="button" disabled={!p.neomezene && vyb>=vol}
                              onClick={() => setPrisl(prev => ({...prev,[p.id]:vyb+1}))}
                              style={{width:26,height:26,borderRadius:6,border:"1.5px solid #10b981",background:"#f0fdf4",cursor:(!p.neomezene&&vyb>=vol)?"default":"pointer",fontSize:15,fontWeight:700,color:"#10b981",display:"flex",alignItems:"center",justifyContent:"center",opacity:(!p.neomezene&&vyb>=vol)?.4:1}}>+</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Shrnutí a cena ── */}
          <div style={{background:"#f0fdf4",borderRadius:14,padding:"16px",border:"1.5px solid #bbf7d0",marginBottom:12}}>
            <div style={{fontSize:10.5,fontWeight:700,textTransform:"uppercase",letterSpacing:".12em",color:"#16a34a",marginBottom:12}}>Celková cena</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {cenaStan !== null && selPolozka && (
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13.5}}>
                  <span style={{color:"#374151"}}>{selPolozka.name} <span style={{fontSize:11.5,color:"#9ca3af"}}>({dni} {dni===1?"den":dni<5?"dny":"dní"})</span></span>
                  <span style={{fontWeight:600,color:"#111827",flexShrink:0}}>{formatCena(cenaStan)}</span>
                </div>
              )}
              {prislRadky.map((r,i) => r.cena !== null && (
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13.5}}>
                  <span style={{color:"#374151"}}>{r.pol.name}{r.cnt>1?` ×${r.cnt}`:""}</span>
                  <span style={{fontWeight:600,color:"#111827",flexShrink:0}}>{formatCena(r.cena*r.cnt)}</span>
                </div>
              ))}
              {montazPopl > 0 && (
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13.5}}>
                  <span style={{color:"#374151"}}>Poplatek za montáž <span style={{fontSize:11.5,color:"#9ca3af"}}>(≤ 4 dny)</span></span>
                  <span style={{fontWeight:600,color:"#111827",flexShrink:0}}>500 Kč</span>
                </div>
              )}
              <div style={{paddingTop:8,marginTop:2,borderTop:"1.5px solid #bbf7d0"}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:15,fontWeight:700,color:"#111827"}}>Celkem s DPH</span>
                  <span style={{fontSize:19,fontWeight:800,color:"#16a34a"}}>{formatCena(celkem)}</span>
                </div>
                {(() => {
                  const r = dphRozpad(celkem)
                  return (
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
                      <span style={{fontSize:11.5,color:"#6b7280"}}>z toho DPH 21 % · základ bez DPH</span>
                      <span style={{fontSize:11.5,color:"#6b7280",flexShrink:0}}>{formatKc(r.dph)} · {formatKc(r.bezdph)}</span>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* ── GDPR + půjčovní řád ── */}
          <div style={{...card,marginBottom:12}}>
            {[
              { s:gdpr,    set:setGdpr,    t:<>Souhlasím se <a href="#" style={{color:"#10b981"}}>zpracováním osobních údajů (GDPR)</a></> },
              { s:pujcRad, set:setPujcRad, t:<>Souhlasím s <a href="#" style={{color:"#10b981"}}>půjčovním řádem</a> a obchodními podmínkami</> },
            ].map((item,i) => (
              <label key={i} style={{display:"flex",alignItems:"flex-start",gap:9,cursor:"pointer",marginBottom:i===0?10:0}}>
                <input type="checkbox" checked={item.s} onChange={e=>item.set(e.target.checked)}
                  style={{width:15,height:15,marginTop:2,accentColor:"#10b981",flexShrink:0}} />
                <span style={{fontSize:13,color:"#374151",lineHeight:1.5}}>{item.t}</span>
              </label>
            ))}
          </div>

          {/* ── Submit ── */}
          <button type="submit" disabled={!canSubmit || isOdesilam}
            style={{
              width:"100%", padding:"13px", borderRadius:12, border:"none",
              background: !canSubmit || isOdesilam ? "#f3f4f6" : "#10b981",
              color: !canSubmit || isOdesilam ? "#9ca3af" : "white",
              fontSize:15, fontWeight:700, cursor: !canSubmit || isOdesilam ? "default" : "pointer",
              transition:"all .15s",
            }}>
            {isOdesilam ? "⏳ Odesílám…" : "Odeslat rezervaci →"}
          </button>
          <p style={{textAlign:"center",fontSize:12,color:"#9ca3af",marginTop:8,marginBottom:0}}>* povinné pole</p>
        </form>
      </div>
    </div>
  )
}
