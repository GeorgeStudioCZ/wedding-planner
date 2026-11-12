"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { formatKc } from "@/lib/dph"
import {
  type Polozka, type Stupen, type RezRow,
  PRISL_CATS, PRISL_ORDER, NOT_MAIN_CATS, DRZAK_KAT, DRZAK_THULE_NAME, DRZAK_VARIANTY,
  stanDetail, pocetDni, cenaPolozky, volnych, montazniPoplatek,
} from "@/lib/pujcovna-web"

// Formulář nesahá do databáze přímo — ceník, obsazenost i odeslání jdou přes serverové API.

type Step    = "vybrat" | "overuji" | "formular" | "odesilam" | "hotovo"

const HODINY = Array.from({ length: 14 }, (_,i) => i + 8).map(h => `${h}:00 – ${h+1}:00`)

// Smlouva o pronájmu + půjčovní řád + GDPR — jeden PDF dokument
const DOKUMENT_URL = "https://stanujnaaute.cz/wp-content/uploads/dokumenty/smlouva-pronajem-a-rad.pdf"
// Formulář běží v iframe → target _blank, jinak by se PDF otevřelo místo formuláře.
// stopPropagation, aby klik na odkaz uvnitř <label> nepřepnul checkbox.
const odkazProps = {
  target: "_blank",
  rel:    "noopener noreferrer",
  style:  { color: "#10b981" },
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCena(c: number) { return c.toLocaleString("cs-CZ") + " Kč" }
function formatDatum(d: string) { return new Date(d).toLocaleDateString("cs-CZ",{day:"numeric",month:"long",year:"numeric"}) }
function dnesIso() { return new Date().toISOString().slice(0,10) }
function pridejDen(iso: string) {
  const d = new Date(iso); d.setDate(d.getDate() + 1); return d.toISOString().slice(0,10)
}

function cenaPopis(pol: Polozka, stupne: Stupen[]): string {
  if (pol.cena_typ === "kusova" && pol.cena_fixni) return formatCena(pol.cena_fixni)
  if (pol.cena_typ === "fixni"  && pol.cena_fixni) return `od ${formatCena(pol.cena_fixni)}/den`
  const tiers = stupne.filter(s => s.polozka_id === pol.id).sort((a,b) => a.cena_za_den - b.cena_za_den)
  if (tiers.length) return `od ${formatCena(tiers[0].cena_za_den)}/den`
  return ""
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
  const [loading,      setLoading]      = useState(true)
  const [step,         setStep]         = useState<Step>("vybrat")
  const [chyba,        setChyba]        = useState<string | null>(null)
  const [alternativy,  setAlternativy]  = useState<Polozka[]>([])
  const [drzakVariant, setDrzakVariant] = useState<string | null>(null)
  const platbaRef = useRef<{vs:string;invoice_no:string;castka:number;cislo_uctu:string;qr_url:string;pdf_url:string} | null>(null)

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
  const [kauce,   setKauce]   = useState(false)

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

  // ── Scroll na vrch při odesilam + hotovo ──────────────────────────────────
  useEffect(() => {
    if (step !== "odesilam" && step !== "hotovo") return
    window.scrollTo({ top: 0, behavior: "smooth" })
    window.parent?.postMessage({ type: "iframe-scroll-top" }, "*")
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
  const jeStany       = selPolozka?.category === "Stany"
  // Paddleboard a držák kol nevyžadují info o vozidle
  const jeBezvozidla  = selCat === "Paddleboardy" || selCat === DRZAK_KAT
  // Výše kauce podle kategorie (null = bez kauce)
  const kauceKc = selCat === "Stany" ? 5000 : selCat === "Paddleboardy" ? 1000 : selCat === DRZAK_KAT ? 2000 : null
  const prislusenstvi = useMemo(() => polozky.filter(p => PRISL_CATS.has(p.category)), [polozky])
  const katPrisl      = useMemo(() => {
    const cats = [...new Set(prislusenstvi.map(p => p.category))]
    return cats.sort((a, b) => {
      const ia = PRISL_ORDER.indexOf(a); const ib = PRISL_ORDER.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  }, [prislusenstvi])
  const pricnikyItems = useMemo(() => polozky.filter(p => p.category === "Příčníky"), [polozky])

  const dni        = dateFrom && dateTo ? pocetDni(dateFrom, dateTo) : 0
  const cenaStan   = selPolozka && dni > 0 ? cenaPolozky(selPolozka, stupne, dni) : null
  const montazPopl = montazniPoplatek(!!jeStany, dni)

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
  // Příčníky jsou povinné jen pro stany; při "pujcit" musí být vybrán konkrétní typ
  const maPricnikyVybrany = pricnikyItems.some(p => (prisl[p.id] ?? 0) > 0)
  const canSubmit  = !!(form.jmeno && form.prijmeni && form.email && form.telefon &&
    (jeBezvozidla || form.vozidlo) && (jeStany ? (form.pricniky && (form.pricniky !== "pujcit" || maPricnikyVybrany)) : true) && form.cas_vyzvednuti && form.cas_vraceni && gdpr && pujcRad &&
    (kauceKc === null || kauce))

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
    let rez: RezRow[] = []
    try {
      const r = await fetch("/api/pujcovna/obsazenost")
      const j = await r.json()
      rez = (j.rezervace ?? []) as RezRow[]
    } catch {
      setChyba("Nepodařilo se ověřit dostupnost. Zkuste to prosím znovu."); setStep("vybrat"); return
    }
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
  // Vše (ověření dostupnosti, výpočet ceny, uložení, zálohová faktura, e-mail, kalendář)
  // dělá server — z prohlížeče posíláme jen výběr a kontaktní údaje.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selPolozka || !canSubmit) return
    setStep("odesilam")
    try {
      const res = await fetch("/api/pujcovna/web-rezervace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selPolozka.id,
          dateFrom, dateTo,
          prisl: jeStany ? prisl : {},
          drzakVariant: drzakVariant ?? "",
          form,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setChyba(json.error ?? "Rezervaci se nepodařilo odeslat. Zkuste to prosím znovu.")
        setStep(res.status === 409 ? "vybrat" : "formular")
        return
      }
      platbaRef.current = json.platba ?? null
      setStep("hotovo")
    } catch {
      setChyba("Rezervaci se nepodařilo odeslat. Zkontrolujte připojení a zkuste to znovu.")
      setStep("formular")
    }
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
  if (step === "hotovo") {
  const platbaInfo = platbaRef.current
  return (
    <div style={{padding:"32px 16px",maxWidth:520,margin:"0 auto"}}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:52,marginBottom:8}}>✅</div>
        <h2 style={{margin:"0 0 8px",fontSize:21,fontWeight:800,color:"#111827"}}>Rezervace přijata!</h2>
        <p style={{margin:0,color:"#6b7280",lineHeight:1.6}}>Zkontrolujte prosím níže platební údaje a proveďte platbu.</p>
      </div>

      {/* 72h platební lhůta */}
      <div style={{background:"#fff7ed",borderRadius:10,padding:"14px 18px",border:"2px solid #f97316",marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:"#c2410c",textTransform:"uppercase" as const,letterSpacing:".06em",marginBottom:6}}>⏰ Rezervaci potvrďte platbou do 72 hodin</div>
        <p style={{margin:0,fontSize:13,color:"#9a3412",lineHeight:1.6}}>
          Pokud platba nedorazí do <strong>72 hodin od odeslání rezervace</strong>, bude rezervace automaticky stornována a termín uvolněn.
        </p>
      </div>

      {/* Shrnutí rezervace */}
      <div style={{background:"#f0fdf4",borderRadius:12,padding:"14px 18px",border:"1px solid #bbf7d0",marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Shrnutí rezervace</div>
        <div style={{fontSize:14,color:"#374151",lineHeight:1.8}}>
          <div><strong>{stanDetail(selPolozka!)?.nazev ?? selPolozka?.name}</strong></div>
          <div>{formatDatum(dateFrom)} – {formatDatum(dateTo)}</div>
          {celkem > 0 && <div>Celková cena: <strong>{formatCena(celkem)}</strong></div>}
        </div>
      </div>

      {/* Platební údaje */}
      {platbaInfo ? (
        <div style={{background:"#fff",borderRadius:12,padding:"18px 20px",border:"2px solid #f59e0b",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#b45309",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>
            💳 Platební údaje — {platbaInfo.invoice_no}
          </div>
          <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13.5}}>
                <tbody>
                  {platbaInfo.cislo_uctu && (
                    <tr><td style={{color:"#6b7280",paddingBottom:6,width:"44%"}}>Číslo účtu</td>
                        <td style={{color:"#111827",fontWeight:600,fontFamily:"monospace",paddingBottom:6}}>{platbaInfo.cislo_uctu}</td></tr>
                  )}
                  <tr><td style={{color:"#6b7280",paddingBottom:6}}>Variabilní symbol</td>
                      <td style={{color:"#111827",fontWeight:700,fontFamily:"monospace",fontSize:16,paddingBottom:6}}>{platbaInfo.vs}</td></tr>
                  <tr><td style={{color:"#6b7280",paddingBottom:6}}>Částka</td>
                      <td style={{color:"#111827",fontWeight:700,fontSize:16,paddingBottom:6}}>{formatCena(platbaInfo.castka)}</td></tr>
                  <tr><td style={{color:"#6b7280"}}>Měna</td>
                      <td style={{color:"#111827"}}>CZK</td></tr>
                </tbody>
              </table>
              {platbaInfo.pdf_url && (
                <a href={platbaInfo.pdf_url} target="_blank" rel="noopener noreferrer"
                   style={{display:"inline-block",marginTop:14,fontSize:13,color:"#b45309",fontWeight:600,textDecoration:"none"}}>
                  📄 Stáhnout zálohovou fakturu
                </a>
              )}
            </div>
            {platbaInfo.qr_url && (
              <div style={{flexShrink:0,textAlign:"center"}}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={platbaInfo.qr_url} alt="QR platba" width={110} height={110}
                     style={{borderRadius:8,border:"1px solid #e5e7eb"}} />
                <div style={{fontSize:11,color:"#9ca3af",marginTop:4}}>QR platba</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{background:"#fef9c3",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#713f12",marginBottom:16}}>
          Platební údaje budou zaslány na váš email.
        </div>
      )}

      <p style={{margin:0,fontSize:13,color:"#9ca3af",textAlign:"center"}}>
        Potvrzení bylo zasláno na <strong>{form.email}</strong>
      </p>
    </div>
  )
  }

  // ── Krok 1: výběr ─────────────────────────────────────────────────────────
  // ── Odesílám ──────────────────────────────────────────────────────────────
  if (step === "odesilam") return (
    <div style={{padding:"60px 16px",maxWidth:480,margin:"0 auto",textAlign:"center"}}>
      {/* Spinner */}
      <div style={{
        width:56,height:56,margin:"0 auto 24px",
        border:"5px solid #e5e7eb",
        borderTop:"5px solid #10b981",
        borderRadius:"50%",
        animation:"spin 0.9s linear infinite",
      }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <h2 style={{margin:"0 0 10px",fontSize:19,fontWeight:800,color:"#111827"}}>
        Zpracováváme vaši rezervaci…
      </h2>
      <p style={{margin:0,fontSize:14,color:"#6b7280",lineHeight:1.7}}>
        Ověřujeme dostupnost a vystavujeme zálohovou fakturu.<br/>
        <strong>Nezavírejte stránku ani neklikejte, prosím čekejte.</strong>
      </p>
    </div>
  )

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
                        <span style={{fontSize:14,fontWeight:700,color:"#111827"}}>Zatím celkem</span>
                        <span style={{fontSize:16,fontWeight:800,color:"#16a34a"}}>{formatCena((cenaStan ?? 0) + montazPopl)}</span>
                      </div>
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
                  <input value={form.jmeno} onChange={e=>upd("jmeno",e.target.value)} placeholder="Jan" style={inp} disabled={false} />
                </div>
                <div>
                  <label style={lbl}>Příjmení *</label>
                  <input value={form.prijmeni} onChange={e=>upd("prijmeni",e.target.value)} placeholder="Novák" style={inp} disabled={false} />
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={lbl}>E-mail *</label>
                  <input type="email" value={form.email} onChange={e=>upd("email",e.target.value)} placeholder="jan@email.cz" style={inp} disabled={false} />
                </div>
                <div>
                  <label style={lbl}>Telefon *</label>
                  <input type="tel" value={form.telefon} onChange={e=>upd("telefon",e.target.value)} placeholder="+420 777 000 000" style={inp} disabled={false} />
                </div>
              </div>
              <div>
                <label style={lbl}>Ulice a č.p.</label>
                <input value={form.ulice} onChange={e=>upd("ulice",e.target.value)} placeholder="Václavské nám. 1" style={inp} disabled={false} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 90px",gap:10}}>
                <div>
                  <label style={lbl}>Město</label>
                  <input value={form.mesto} onChange={e=>upd("mesto",e.target.value)} placeholder="Praha" style={inp} disabled={false} />
                </div>
                <div>
                  <label style={lbl}>PSČ</label>
                  <input value={form.psc} onChange={e=>upd("psc",e.target.value)} placeholder="110 00" style={inp} disabled={false} />
                </div>
              </div>
              <div>
                <label style={lbl}>Poznámka</label>
                <textarea value={form.poznamka} onChange={e=>upd("poznamka",e.target.value)} rows={2}
                  placeholder="Volitelné — zvláštní přání, dotazy…"
                  style={{...inp,resize:"vertical" as const,lineHeight:1.5}} disabled={false} />
              </div>
            </div>
          </div>

          {/* ── 2. Vozidlo a logistika ── */}
          <div style={card}>
            <SecTitle>Vozidlo a logistika</SecTitle>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {!jeBezvozidla && <div>
                <label style={lbl}>Značka a model vozu *</label>
                <input value={form.vozidlo} onChange={e=>upd("vozidlo",e.target.value)} placeholder="např. Škoda Octavia Combi 2020" style={inp} disabled={false} />
              </div>}
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
                {form.pricniky === "pujcit" && !maPricnikyVybrany && (
                  <div style={{marginTop:6,fontSize:12,color:"#ef4444",fontWeight:500}}>
                    ⚠ Vyberte prosím konkrétní typ příčníků
                  </div>
                )}
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
                            {({"Příčníky - klasické":"max. 120 cm","Příčníky - integrované":"max. 130 cm"} as Record<string,string>)[p.name] && (
                              <span style={{fontSize:11,color:"#9ca3af",marginLeft:6}}>({({"Příčníky - klasické":"max. 120 cm","Příčníky - integrované":"max. 130 cm"} as Record<string,string>)[p.name]})</span>
                            )}
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
                  <select value={form.cas_vyzvednuti} onChange={e=>upd("cas_vyzvednuti",e.target.value)} style={inp} disabled={false}>
                    <option value="">Vyberte…</option>
                    {HODINY.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Čas vrácení *</label>
                  <select value={form.cas_vraceni} onChange={e=>upd("cas_vraceni",e.target.value)} style={inp} disabled={false}>
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
                  <span style={{fontSize:15,fontWeight:700,color:"#111827"}}>Celkem</span>
                  <span style={{fontSize:19,fontWeight:800,color:"#16a34a"}}>{formatCena(celkem)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── GDPR + půjčovní řád + kauce ── */}
          <div style={{...card,marginBottom:12}}>
            {[
              { s:gdpr,    set:setGdpr,    t:<>Souhlasím se <a href={DOKUMENT_URL} {...odkazProps}>zpracováním osobních údajů (GDPR)</a></> },
              { s:pujcRad, set:setPujcRad, t:<>Souhlasím s <a href={DOKUMENT_URL} {...odkazProps}>půjčovním řádem</a> a obchodními podmínkami</> },
            ].map((item,i) => (
              <label key={i} style={{display:"flex",alignItems:"flex-start",gap:9,cursor:"pointer",marginBottom:10}}>
                <input type="checkbox" checked={item.s} onChange={e=>item.set(e.target.checked)}
                  style={{width:15,height:15,marginTop:2,accentColor:"#10b981",flexShrink:0}} />
                <span style={{fontSize:13,color:"#374151",lineHeight:1.5}}>{item.t}</span>
              </label>
            ))}
            {kauceKc !== null && (
              <label style={{display:"flex",alignItems:"flex-start",gap:9,cursor:"pointer"}}>
                <input type="checkbox" checked={kauce} onChange={e=>setKauce(e.target.checked)}
                  style={{width:15,height:15,marginTop:2,accentColor:"#10b981",flexShrink:0}} />
                <span style={{fontSize:13,color:"#374151",lineHeight:1.5}}>
                  Souhlasím s úhradou kauce <strong>{kauceKc.toLocaleString("cs-CZ")} Kč</strong> při převzetí.
                </span>
              </label>
            )}
          </div>

          {chyba && (
            <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:9,padding:"11px 14px",color:"#dc2626",fontSize:13,marginBottom:12}}>
              {chyba}
            </div>
          )}

          {/* ── Submit ── */}
          <button type="submit" disabled={!canSubmit || false}
            style={{
              width:"100%", padding:"13px", borderRadius:12, border:"none",
              background: !canSubmit || false ? "#f3f4f6" : "#10b981",
              color: !canSubmit || false ? "#9ca3af" : "white",
              fontSize:15, fontWeight:700, cursor: !canSubmit || false ? "default" : "pointer",
              transition:"all .15s",
            }}>
            {false ? "⏳ Odesílám…" : "Odeslat rezervaci →"}
          </button>
          <p style={{textAlign:"center",fontSize:12,color:"#9ca3af",marginTop:8,marginBottom:0}}>* povinné pole</p>
        </form>
      </div>
    </div>
  )
}
