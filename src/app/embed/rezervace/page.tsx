"use client"

import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"

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

// Kategorie které jsou příslušenství (přidávají se ke stanu)
const PRISL_CATS = new Set(["Příčníky","Markýzy","Sedátka","Napájení","Ledničky","Redukce","Camping sety","Stolky","Vařiče","Reproduktory","Ostatní"])

const BARVY_STANU: Record<string, string> = { "malý": "#F23753", "střední": "#3477F5", "velký": "#F3940E" }
const HODINY = Array.from({ length: 14 }, (_, i) => i + 8).map(h => `${h}:00 – ${h+1}:00`)

// ── Helpers ───────────────────────────────────────────────────────────────────
function pocetDni(a: string, b: string) { return Math.round((+new Date(b) - +new Date(a)) / 86400000) + 1 }
function formatCena(c: number) { return c.toLocaleString("cs-CZ") + " Kč" }
function formatDatum(d: string) { return new Date(d).toLocaleDateString("cs-CZ",{day:"numeric",month:"long",year:"numeric"}) }
function dnesIso() { return new Date().toISOString().slice(0,10) }

function barvaPolozky(pol: Polozka): string {
  if (pol.category !== "Stany") return "#10b981"
  const n = pol.name.toLowerCase()
  for (const [klic, barva] of Object.entries(BARVY_STANU)) {
    if (n.includes(klic)) return barva
  }
  return "#10b981"
}

function cenaPolozky(pol: Polozka, stupne: Stupen[], dni: number): number | null {
  if (pol.cena_typ === "kusova") return pol.cena_fixni ?? null
  if (pol.cena_typ === "fixni")  return pol.cena_fixni != null ? pol.cena_fixni * dni : null
  const tier = stupne.find(s => s.polozka_id === pol.id && s.dni_od <= dni && (s.dni_do === null || s.dni_do >= dni))
  return tier ? tier.cena_za_den * dni : null
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
  const obsazeno = rez.filter(r => r.item_id === itemId && start <= r.end_date && end >= r.start_date).length
  return Math.max(0, unitNum - obsazeno)
}

function freeUnit(itemId: number, unitNum: number, start: string, end: string, rez: RezRow[], usedSlots: number[]) {
  for (let ui = 0; ui < unitNum; ui++) {
    if (usedSlots.includes(ui)) continue
    const obsazeno = rez.some(r => r.item_id === itemId && r.unit_index === ui && start <= r.end_date && end >= r.start_date)
    if (!obsazeno) return ui
  }
  return 0
}

function ikonaKat(cat: string) {
  if (cat === "Stany")         return "⛺"
  if (cat === "Paddleboardy")  return "🏄"
  return "🚲"
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  inp: {
    width:"100%", boxSizing:"border-box" as const, padding:"10px 14px",
    border:"1.5px solid #e5e7eb", borderRadius:10, fontSize:14,
    color:"#111827", outline:"none", fontFamily:"inherit", background:"white",
  },
  lbl: {
    display:"block" as const, fontSize:12.5, fontWeight:600,
    color:"#374151", marginBottom:5,
  },
  section: {
    background:"white", borderRadius:16, padding:"20px",
    border:"1px solid #e5e7eb", marginBottom:14,
  },
  sectionTitle: {
    fontSize:11, fontWeight:700, textTransform:"uppercase" as const,
    letterSpacing:".1em", color:"#9ca3af", marginBottom:14,
  },
  btn: (primary: boolean, disabled = false): React.CSSProperties => ({
    width:"100%", padding:"13px", borderRadius:12, border:"none",
    background: disabled ? "#f3f4f6" : primary ? "#10b981" : "#f3f4f6",
    color: disabled ? "#9ca3af" : primary ? "white" : "#374151",
    fontSize:15, fontWeight:700, cursor: disabled ? "default" : "pointer",
    transition:"all .15s",
  }),
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function RezervacePage() {
  const [polozky,  setPolozky]  = useState<Polozka[]>([])
  const [stupne,   setStupne]   = useState<Stupen[]>([])
  const [vsechRez, setVsechRez] = useState<RezRow[]>([])
  const [loading,  setLoading]  = useState(true)

  const [step,  setStep]  = useState<Step>("vybrat")
  const [chyba, setChyba] = useState<string | null>(null)

  // Krok 1
  const [selCat,   setSelCat]   = useState<string | null>(null)
  const [selItem,  setSelItem]  = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo,   setDateTo]   = useState("")

  // Příslušenství
  const [prisl, setPrisl] = useState<Record<number, number>>({})
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

  // ── Derived ────────────────────────────────────────────────────────────────
  const mainKats = useMemo(() =>
    [...new Set(polozky.filter(p => !PRISL_CATS.has(p.category)).map(p => p.category))],
    [polozky]
  )
  const itemyKat = useMemo(() =>
    selCat ? polozky.filter(p => p.category === selCat) : [],
    [polozky, selCat]
  )
  const selPolozka    = useMemo(() => polozky.find(p => p.id === selItem) ?? null, [polozky, selItem])
  const jeStany       = selPolozka?.category === "Stany"
  const prislusenstvi = useMemo(() => polozky.filter(p => PRISL_CATS.has(p.category)), [polozky])
  const katPrisl      = useMemo(() => [...new Set(prislusenstvi.map(p => p.category))], [prislusenstvi])

  const dni = dateFrom && dateTo ? pocetDni(dateFrom, dateTo) : 0

  const cenaStan      = selPolozka && dni > 0 ? cenaPolozky(selPolozka, stupne, dni) : null
  const montazPopl    = jeStany && dni > 0 && dni <= 4 ? 500 : 0
  const prislRadky = useMemo(() =>
    Object.entries(prisl)
      .filter(([,cnt]) => cnt > 0)
      .map(([idStr, cnt]) => {
        const pol = polozky.find(p => p.id === Number(idStr))
        if (!pol) return null
        return { pol, cnt, cena: cenaPolozky(pol, stupne, dni) }
      })
      .filter(Boolean) as { pol: Polozka; cnt: number; cena: number|null }[],
    [prisl, polozky, stupne, dni]
  )
  const celkem = (cenaStan ?? 0) + prislRadky.reduce((s,r) => s + (r.cena ?? 0) * r.cnt, 0) + montazPopl

  function upd(k: string, v: string) { setForm(f => ({...f, [k]: v})) }

  const canSubmit = !!(
    form.jmeno.trim() && form.prijmeni.trim() &&
    form.email.trim() && form.telefon.trim() &&
    form.vozidlo.trim() && form.pricniky &&
    form.cas_vyzvednuti && form.cas_vraceni &&
    gdpr && pujcRad
  )

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from("pujcovna_polozky").select("*").order("sort_order"),
      supabase.from("pujcovna_ceny_stupne").select("*"),
    ]).then(([{data:pol},{data:st}]) => {
      setPolozky(pol ?? [])
      setStupne(st ?? [])
      setLoading(false)
    })
  }, [])

  // ── Ověřit dostupnost ──────────────────────────────────────────────────────
  async function overitDostupnost() {
    if (!selItem || !dateFrom || !dateTo) { setChyba("Vyberte položku a termín."); return }
    if (dateFrom > dateTo) { setChyba("Datum návratu musí být stejné nebo pozdější než datum vyzvednutí."); return }
    setChyba(null)
    setStep("overuji")

    const { data } = await supabase
      .from("pujcovna_rezervace")
      .select("id, item_id, unit_index, start_date, end_date, group_id")
    const rez = (data ?? []) as RezRow[]
    setVsechRez(rez)

    const pol = polozky.find(p => p.id === selItem)!
    const vol = volnych(pol.id, pol.unit_num, pol.neomezene, dateFrom, dateTo, rez)
    if (vol === 0) {
      setChyba("Tato položka není v daném termínu dostupná. Vyberte jiný termín nebo položku.")
      setStep("vybrat")
      return
    }

    if (jeStany) {
      const dp: Record<number,number> = {}
      for (const p of prislusenstvi) {
        dp[p.id] = volnych(p.id, p.unit_num, p.neomezene, dateFrom, dateTo, rez)
      }
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

    // 1. Match or create zákazník
    let zakaznikId: number | null = null
    const { data: byEmail } = await supabase
      .from("zakaznici").select("id").eq("email", form.email.trim()).maybeSingle()
    if (byEmail) {
      zakaznikId = byEmail.id
    } else {
      const { data: byPhone } = await supabase
        .from("zakaznici").select("id").eq("telefon", form.telefon.trim()).maybeSingle()
      if (byPhone) {
        zakaznikId = byPhone.id
      } else {
        const { data: newZ } = await supabase
          .from("zakaznici")
          .insert({ jmeno:form.jmeno.trim(), prijmeni:form.prijmeni.trim(),
            email:form.email.trim(), telefon:form.telefon.trim(),
            ulice:form.ulice.trim(), mesto:form.mesto.trim(), psc:form.psc.trim(),
            projekty:["Půjčovna"] })
          .select("id").single()
        zakaznikId = newZ?.id ?? null
      }
    }

    // 2. Hlavní rezervace
    const groupId    = crypto.randomUUID()
    const customer   = `${form.jmeno} ${form.prijmeni}`.trim()
    const usedSlots: Record<number, number[]> = {}
    const mainUnit   = freeUnit(selPolozka.id, selPolozka.unit_num, dateFrom, dateTo, vsechRez, [])
    usedSlots[selPolozka.id] = [mainUnit]

    const { data: mainRez } = await supabase
      .from("pujcovna_rezervace")
      .insert({
        item_id: selPolozka.id, unit_index: mainUnit,
        customer, start_date: dateFrom, end_date: dateTo,
        color: barvaPolozky(selPolozka),
        notes: form.poznamka, group_id: groupId, zakaznik_id: zakaznikId,
        vozidlo: form.vozidlo, cas_vyzvednuti: form.cas_vyzvednuti,
        cas_vraceni: form.cas_vraceni, pricniky: form.pricniky,
        stav: "web-rezervace",
      })
      .select("id").single()

    // 3. Příslušenství
    if (jeStany) {
      const rows = []
      for (const [idStr, cnt] of Object.entries(prisl)) {
        if (!cnt) continue
        const itemId = Number(idStr)
        const pol = polozky.find(p => p.id === itemId)
        if (!pol) continue
        usedSlots[itemId] = usedSlots[itemId] ?? []
        for (let i = 0; i < cnt; i++) {
          const slot = freeUnit(itemId, pol.unit_num, dateFrom, dateTo, vsechRez, usedSlots[itemId])
          usedSlots[itemId].push(slot)
          rows.push({ item_id:itemId, unit_index:slot, customer, start_date:dateFrom, end_date:dateTo,
            color:barvaPolozky(selPolozka), notes:"", group_id:groupId, zakaznik_id:zakaznikId,
            stav:"web-rezervace" })
        }
      }
      if (rows.length) await supabase.from("pujcovna_rezervace").insert(rows)
    }

    // 4. Historie
    if (mainRez?.id) {
      await supabase.from("pujcovna_rezervace_historie")
        .insert({ rezervace_id: mainRez.id, stav: "web-rezervace" })
    }

    setStep("hotovo")
  }

  // ── Render: loading ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f9fafb"}}>
      <p style={{color:"#9ca3af",fontSize:14}}>Načítám formulář…</p>
    </div>
  )

  // ── Render: hotovo ─────────────────────────────────────────────────────────
  if (step === "hotovo") return (
    <div style={{minHeight:"100vh",background:"#f9fafb",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"white",borderRadius:20,padding:"40px 32px",maxWidth:480,width:"100%",textAlign:"center",boxShadow:"0 4px 32px rgba(0,0,0,.08)"}}>
        <div style={{fontSize:56,marginBottom:16}}>✅</div>
        <h2 style={{margin:"0 0 10px",fontSize:22,fontWeight:800,color:"#111827"}}>Rezervace přijata!</h2>
        <p style={{color:"#6b7280",lineHeight:1.7,margin:"0 0 24px"}}>
          Děkujeme, brzy se Vám ozveme s potvrzením termínu.
        </p>
        <div style={{background:"#f0fdf4",borderRadius:12,padding:"16px 20px",textAlign:"left",border:"1px solid #bbf7d0"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Shrnutí rezervace</div>
          <div style={{fontSize:14,color:"#374151",lineHeight:1.8}}>
            <div><strong>{selPolozka?.name}</strong></div>
            <div>{formatDatum(dateFrom)} – {formatDatum(dateTo)} ({dni} {dni===1?"den":dni<5?"dny":"dní"})</div>
            {celkem > 0 && <div>Předběžná cena: <strong>{formatCena(celkem)}</strong></div>}
          </div>
        </div>
      </div>
    </div>
  )

  // ── Render: krok 1 — výběr + datum ────────────────────────────────────────
  if (step === "vybrat" || step === "overuji") return (
    <div style={{minHeight:"100vh",background:"#f9fafb",padding:"28px 16px"}}>
      <div style={{maxWidth:560,margin:"0 auto"}}>
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <h1 style={{margin:"0 0 8px",fontSize:26,fontWeight:800,color:"#111827"}}>Rezervace půjčovny</h1>
          <p style={{margin:0,fontSize:14,color:"#6b7280"}}>Vyberte položku a termín, pak ověříme dostupnost</p>
        </div>

        {/* Druh */}
        <div style={S.section}>
          <div style={S.sectionTitle}>1. Co chcete půjčit</div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(mainKats.length,3)},1fr)`,gap:10}}>
            {mainKats.map(cat => (
              <button key={cat} type="button"
                onClick={() => { setSelCat(cat); setSelItem(null) }}
                style={{
                  padding:"16px 8px", borderRadius:12, cursor:"pointer", textAlign:"center",
                  border: selCat===cat ? "2px solid #10b981" : "2px solid #e5e7eb",
                  background: selCat===cat ? "#f0fdf4" : "white",
                  transition:"all .15s",
                }}
              >
                <div style={{fontSize:28,marginBottom:6}}>{ikonaKat(cat)}</div>
                <div style={{fontSize:13,fontWeight:600,color:selCat===cat?"#16a34a":"#374151"}}>{cat}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Typ */}
        {selCat && (
          <div style={S.section}>
            <div style={S.sectionTitle}>2. Typ</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {itemyKat.map(pol => {
                const active = selItem === pol.id
                return (
                  <button key={pol.id} type="button"
                    onClick={() => setSelItem(pol.id)}
                    style={{
                      padding:"14px 16px", borderRadius:12, cursor:"pointer",
                      border: active ? "2px solid #10b981" : "2px solid #e5e7eb",
                      background: active ? "#f0fdf4" : "white",
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      transition:"all .15s", textAlign:"left",
                    }}
                  >
                    <div>
                      <div style={{fontSize:14,fontWeight:600,color:active?"#16a34a":"#111827"}}>{pol.name}</div>
                      <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>{cenaPopis(pol,stupne)}</div>
                    </div>
                    {active && <span style={{color:"#10b981",fontSize:20,flexShrink:0}}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Termín */}
        {selItem && (
          <div style={S.section}>
            <div style={S.sectionTitle}>3. Termín</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={S.lbl}>Vyzvednutí</label>
                <input type="date" value={dateFrom} min={dnesIso()}
                  onChange={e => { setDateFrom(e.target.value); if (dateTo && e.target.value > dateTo) setDateTo(e.target.value) }}
                  style={S.inp} />
              </div>
              <div>
                <label style={S.lbl}>Vrácení</label>
                <input type="date" value={dateTo} min={dateFrom || dnesIso()}
                  onChange={e => setDateTo(e.target.value)}
                  style={S.inp} />
              </div>
            </div>
            {dateFrom && dateTo && (
              <div style={{marginTop:12,background:"#f0fdf4",borderRadius:8,padding:"8px 14px",fontSize:13,color:"#16a34a",fontWeight:600}}>
                {pocetDni(dateFrom,dateTo)} {pocetDni(dateFrom,dateTo)===1?"den":pocetDni(dateFrom,dateTo)<5?"dny":"dní"}
              </div>
            )}
          </div>
        )}

        {/* Chyba */}
        {chyba && (
          <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:10,padding:"12px 16px",marginBottom:14,color:"#dc2626",fontSize:13,lineHeight:1.5}}>
            {chyba}
          </div>
        )}

        {/* CTA */}
        {selItem && dateFrom && dateTo && (
          <button onClick={overitDostupnost} disabled={step==="overuji"}
            style={S.btn(true, step==="overuji")}>
            {step==="overuji" ? "⏳ Ověřuji dostupnost…" : "Ověřit dostupnost →"}
          </button>
        )}
      </div>
    </div>
  )

  // ── Render: krok 2 — formulář ─────────────────────────────────────────────
  const isOdesilam = step === "odesilam"

  return (
    <div style={{minHeight:"100vh",background:"#f9fafb",padding:"24px 16px"}}>
      <div style={{maxWidth:580,margin:"0 auto"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <button type="button" onClick={() => { setStep("vybrat"); setChyba(null) }}
            style={{background:"white",border:"1.5px solid #e5e7eb",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:13,color:"#6b7280",fontWeight:600}}>
            ← Zpět
          </button>
          <div>
            <h2 style={{margin:0,fontSize:17,fontWeight:800,color:"#111827"}}>{selPolozka?.name}</h2>
            <p style={{margin:0,fontSize:13,color:"#6b7280"}}>{formatDatum(dateFrom)} – {formatDatum(dateTo)} · {dni} {dni===1?"den":dni<5?"dny":"dní"}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>

          {/* Příslušenství (jen pro stany) */}
          {jeStany && (
            <div style={S.section}>
              <div style={S.sectionTitle}>Příslušenství</div>
              <p style={{margin:"0 0 14px",fontSize:12.5,color:"#6b7280",lineHeight:1.5}}>
                Zobrazujeme pouze příslušenství dostupné ve Vašem termínu.
              </p>
              {katPrisl.map(kat => {
                const polKat = prislusenstvi.filter(p => p.category === kat)
                const dostupneVKat = polKat.filter(p => (dostupPrisl[p.id] ?? 0) > 0 || p.neomezene)
                if (!dostupneVKat.length) return null
                return (
                  <div key={kat} style={{marginBottom:12}}>
                    <div style={{fontSize:10.5,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"#9ca3af",marginBottom:6}}>{kat}</div>
                    {dostupneVKat.map(p => {
                      const vol = p.neomezene ? 999 : (dostupPrisl[p.id] ?? 0)
                      const vyb = prisl[p.id] ?? 0
                      return (
                        <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #f3f4f6"}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13.5,fontWeight:500,color:"#111827"}}>{p.name}</div>
                            {(() => { const c = cenaPolozky(p,stupne,dni); return c ? <div style={{fontSize:11.5,color:"#6b7280",marginTop:1}}>{formatCena(c)}</div> : null })()}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:11,color:"#9ca3af",marginRight:4}}>{p.neomezene ? "∞" : `${vol} vol.`}</span>
                            <button type="button" disabled={vyb===0}
                              onClick={() => setPrisl(prev => ({...prev,[p.id]:Math.max(0,vyb-1)}))}
                              style={{width:28,height:28,borderRadius:7,border:"1.5px solid #e5e7eb",background:"white",cursor:vyb===0?"default":"pointer",fontSize:16,fontWeight:700,color:"#374151",display:"flex",alignItems:"center",justifyContent:"center",opacity:vyb===0?.35:1}}>−</button>
                            <span style={{width:22,textAlign:"center",fontSize:14,fontWeight:600,color:"#111827"}}>{vyb}</span>
                            <button type="button" disabled={!p.neomezene && vyb >= vol}
                              onClick={() => setPrisl(prev => ({...prev,[p.id]:vyb+1}))}
                              style={{width:28,height:28,borderRadius:7,border:"1.5px solid #10b981",background:"#f0fdf4",cursor:(!p.neomezene && vyb>=vol)?"default":"pointer",fontSize:16,fontWeight:700,color:"#10b981",display:"flex",alignItems:"center",justifyContent:"center",opacity:(!p.neomezene && vyb>=vol)?.35:1}}>+</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* Vozidlo a logistika */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Vozidlo a logistika</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <label style={S.lbl}>Značka a model vozu *</label>
                <input value={form.vozidlo} onChange={e=>upd("vozidlo",e.target.value)} placeholder="např. Škoda Octavia Combi 2020" style={S.inp} disabled={isOdesilam} />
              </div>
              <div>
                <label style={S.lbl}>Příčníky na vozidle *</label>
                <div style={{display:"flex",gap:8}}>
                  {[{v:"vlastni",l:"Mám vlastní příčníky"},{v:"pujcit",l:"Chci půjčit příčníky"}].map(opt => (
                    <button key={opt.v} type="button"
                      onClick={() => upd("pricniky",opt.v)}
                      style={{
                        flex:1, padding:"10px 8px", borderRadius:10, cursor:"pointer",
                        border: form.pricniky===opt.v ? "2px solid #10b981" : "1.5px solid #e5e7eb",
                        background: form.pricniky===opt.v ? "#f0fdf4" : "white",
                        fontSize:12.5, fontWeight:600,
                        color: form.pricniky===opt.v ? "#16a34a" : "#374151",
                        transition:"all .15s",
                      }}
                    >{opt.l}</button>
                  ))}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={S.lbl}>Čas vyzvednutí *</label>
                  <select value={form.cas_vyzvednuti} onChange={e=>upd("cas_vyzvednuti",e.target.value)} style={S.inp} disabled={isOdesilam}>
                    <option value="">Vyberte…</option>
                    {HODINY.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Čas vrácení *</label>
                  <select value={form.cas_vraceni} onChange={e=>upd("cas_vraceni",e.target.value)} style={S.inp} disabled={isOdesilam}>
                    <option value="">Vyberte…</option>
                    {HODINY.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Osobní údaje */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Vaše údaje</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={S.lbl}>Jméno *</label>
                  <input value={form.jmeno} onChange={e=>upd("jmeno",e.target.value)} placeholder="Jan" style={S.inp} disabled={isOdesilam} />
                </div>
                <div>
                  <label style={S.lbl}>Příjmení *</label>
                  <input value={form.prijmeni} onChange={e=>upd("prijmeni",e.target.value)} placeholder="Novák" style={S.inp} disabled={isOdesilam} />
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={S.lbl}>E-mail *</label>
                  <input type="email" value={form.email} onChange={e=>upd("email",e.target.value)} placeholder="jan@email.cz" style={S.inp} disabled={isOdesilam} />
                </div>
                <div>
                  <label style={S.lbl}>Telefon *</label>
                  <input type="tel" value={form.telefon} onChange={e=>upd("telefon",e.target.value)} placeholder="+420 777 000 000" style={S.inp} disabled={isOdesilam} />
                </div>
              </div>
              <div>
                <label style={S.lbl}>Ulice a číslo popisné</label>
                <input value={form.ulice} onChange={e=>upd("ulice",e.target.value)} placeholder="Václavské náměstí 1" style={S.inp} disabled={isOdesilam} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10}}>
                <div>
                  <label style={S.lbl}>Město</label>
                  <input value={form.mesto} onChange={e=>upd("mesto",e.target.value)} placeholder="Praha" style={S.inp} disabled={isOdesilam} />
                </div>
                <div>
                  <label style={S.lbl}>PSČ</label>
                  <input value={form.psc} onChange={e=>upd("psc",e.target.value)} placeholder="110 00" style={{...S.inp,width:90}} disabled={isOdesilam} />
                </div>
              </div>
              <div>
                <label style={S.lbl}>Poznámka</label>
                <textarea value={form.poznamka} onChange={e=>upd("poznamka",e.target.value)} rows={3}
                  placeholder="Volitelné — zvláštní přání, dotazy…"
                  style={{...S.inp,resize:"vertical" as const,lineHeight:1.5}} disabled={isOdesilam} />
              </div>
            </div>
          </div>

          {/* Shrnutí a cena */}
          <div style={{background:"#f0fdf4",borderRadius:16,padding:"20px",border:"1.5px solid #bbf7d0",marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"#16a34a",marginBottom:14}}>Shrnutí a cena</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {/* Hlavní položka */}
              {cenaStan !== null && selPolozka && (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span style={{fontSize:14,color:"#374151"}}>{selPolozka.name} <span style={{fontSize:12,color:"#9ca3af"}}>({dni} {dni===1?"den":dni<5?"dny":"dní"})</span></span>
                  <span style={{fontSize:14,fontWeight:600,color:"#111827",flexShrink:0}}>{formatCena(cenaStan)}</span>
                </div>
              )}
              {/* Příslušenství */}
              {prislRadky.map((r,i) => r.cena !== null && (
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span style={{fontSize:14,color:"#374151"}}>{r.pol.name}{r.cnt>1?` ×${r.cnt}`:""}</span>
                  <span style={{fontSize:14,fontWeight:600,color:"#111827",flexShrink:0}}>{formatCena(r.cena*r.cnt)}</span>
                </div>
              ))}
              {/* Montáž */}
              {montazPopl > 0 && (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span style={{fontSize:14,color:"#374151"}}>Poplatek za montáž <span style={{fontSize:12,color:"#9ca3af"}}>(≤ 4 dny)</span></span>
                  <span style={{fontSize:14,fontWeight:600,color:"#111827",flexShrink:0}}>500 Kč</span>
                </div>
              )}
              {/* Celkem */}
              {celkem > 0 && (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,marginTop:4,borderTop:"1.5px solid #bbf7d0"}}>
                  <span style={{fontSize:15,fontWeight:700,color:"#111827"}}>Celkem</span>
                  <span style={{fontSize:20,fontWeight:800,color:"#16a34a"}}>{formatCena(celkem)}</span>
                </div>
              )}
              {celkem === 0 && (
                <p style={{fontSize:13,color:"#6b7280",margin:0}}>Cena bude upřesněna po potvrzení rezervace.</p>
              )}
            </div>
          </div>

          {/* GDPR + půjčovní řád */}
          <div style={S.section}>
            {[
              { state: gdpr, set: setGdpr, label: <>Souhlasím se <a href="#" style={{color:"#10b981"}}>zpracováním osobních údajů (GDPR)</a></> },
              { state: pujcRad, set: setPujcRad, label: <>Souhlasím s <a href="#" style={{color:"#10b981"}}>půjčovním řádem</a> a obchodními podmínkami</> },
            ].map((item, i) => (
              <label key={i} style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",marginBottom:i===0?12:0}}>
                <input type="checkbox" checked={item.state} onChange={e=>item.set(e.target.checked)}
                  style={{width:16,height:16,marginTop:2,accentColor:"#10b981",flexShrink:0}} />
                <span style={{fontSize:13,color:"#374151",lineHeight:1.5}}>{item.label}</span>
              </label>
            ))}
          </div>

          {/* Submit */}
          <button type="submit" disabled={!canSubmit || isOdesilam} style={S.btn(true, !canSubmit || isOdesilam)}>
            {isOdesilam ? "⏳ Odesílám rezervaci…" : "Odeslat rezervaci →"}
          </button>
          <p style={{textAlign:"center",fontSize:12,color:"#9ca3af",marginTop:10}}>
            * povinné pole
          </p>
        </form>
      </div>
    </div>
  )
}
