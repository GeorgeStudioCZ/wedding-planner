"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import AppShell, { AppModule } from "@/components/AppShell"

type Zakaznik = {
  id: number
  jmeno: string
  prijmeni: string
  firma: string
  ico: string
  dic: string
  ulice: string
  mesto: string
  psc: string
  email: string
  telefon: string
  projekty: string[]
  created_at: string
}

type FormData = {
  jmeno: string
  prijmeni: string
  firma: string
  ico: string
  dic: string
  ulice: string
  mesto: string
  psc: string
  email: string
  telefon: string
  projekty: string[]
}

const EMPTY_FORM: FormData = {
  jmeno: "", prijmeni: "", firma: "", ico: "", dic: "",
  ulice: "", mesto: "", psc: "", email: "", telefon: "", projekty: [],
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const GRADIENTS = [
  ["#ff6a8b", "#ff9a6a"],
  ["#2dd4a6", "#7cd38a"],
  ["#6366f1", "#8b5cf6"],
  ["#f59e0b", "#fb923c"],
  ["#0ea5e9", "#6366f1"],
  ["#ec4899", "#f43f5e"],
]
function displayName(z: { jmeno: string; prijmeni: string; firma?: string | null }) {
  if (z.firma?.trim()) return z.firma.trim()
  return [z.jmeno, z.prijmeni].filter(Boolean).join(" ") || "—"
}
function avatarGradient(z: { jmeno: string; prijmeni: string; firma?: string | null }) {
  const seed = z.firma?.trim() || (z.jmeno + z.prijmeni)
  const idx = ((seed.charCodeAt(0) || 65) + (seed.charCodeAt(1) || 65)) % GRADIENTS.length
  const [a, b] = GRADIENTS[idx]
  return `linear-gradient(135deg, ${a}, ${b})`
}
function initials(z: { jmeno: string; prijmeni: string; firma?: string | null }) {
  if (z.firma?.trim()) {
    const words = z.firma.trim().split(/\s+/)
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?"
  }
  return ((z.jmeno[0] ?? "") + (z.prijmeni[0] ?? "")).toUpperCase() || "?"
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function Ico({ d, size = 14 }: { d: string | string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}
const IC = {
  phone:   "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z",
  mail:    "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  pin:     "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 10a3 3 0 100-6 3 3 0 000 6",
  building:["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z","M9 22V12h6v10"],
  search:  "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0",
  plus:    "M12 5v14M5 12h14",
  edit:    "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  trash:   "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  x:       "M18 6L6 18M6 6l12 12",
  user:    "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8",
  hash:    "M4 9h16M4 15h16M10 3L8 21M16 3l-2 18",
}

// ── Projekt styles ─────────────────────────────────────────────────────────────
const PROJ_STYLE: Record<string, { bg: string; color: string }> = {
  "Svatby":    { bg: "rgba(255,106,139,.12)", color: "#b1174a" },
  "Půjčovna":  { bg: "rgba(45,212,166,.15)",  color: "#0a7a5a" },
  "Studio":    { bg: "rgba(99,102,241,.12)",   color: "#4338ca" },
}
const PROJEKTY = ["Svatby", "Půjčovna", "Studio"]

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", letterSpacing: ".1em", textTransform: "uppercase", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
      {children}
    </div>
  )
}

// ── CustomerForm ───────────────────────────────────────────────────────────────
function CustomerForm({
  form, onChange, onToggleProjekt,
  inputCls, inputStyle,
}: {
  form: FormData
  onChange: (f: FormData) => void
  onToggleProjekt: (p: string) => void
  inputCls: string
  inputStyle: React.CSSProperties
}) {
  const s = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [key]: e.target.value })

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Osobní údaje */}
      <SectionLabel>Osobní údaje</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input value={form.jmeno}    onChange={s("jmeno")}    placeholder="Jméno"    className={inputCls} style={inputStyle} />
        <input value={form.prijmeni} onChange={s("prijmeni")} placeholder="Příjmení" className={inputCls} style={inputStyle} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input value={form.telefon}  onChange={s("telefon")}  placeholder="Telefon"  className={inputCls} style={inputStyle} />
        <input value={form.email}    onChange={s("email")}    placeholder="E-mail"   className={inputCls} style={inputStyle} />
      </div>

      {/* Fakturační údaje */}
      <div style={{ marginTop: 6 }}>
        <SectionLabel>Fakturační údaje</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={form.firma} onChange={s("firma")} placeholder="Název firmy (volitelné)" className={inputCls} style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input value={form.ico}   onChange={s("ico")}   placeholder="IČO"   className={inputCls} style={inputStyle} />
            <input value={form.dic}   onChange={s("dic")}   placeholder="DIČ"   className={inputCls} style={inputStyle} />
          </div>
          <input value={form.ulice}   onChange={s("ulice")}  placeholder="Ulice a č.p."  className={inputCls} style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input value={form.mesto} onChange={s("mesto")}  placeholder="Město" className={inputCls} style={inputStyle} />
            <input value={form.psc}   onChange={s("psc")}    placeholder="PSČ"   className={inputCls} style={{ ...inputStyle, width: 80 }} />
          </div>
        </div>
      </div>

      {/* Projekty */}
      <div style={{ marginTop: 4 }}>
        <SectionLabel>Projekty</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PROJEKTY.map(p => {
            const checked = form.projekty.includes(p)
            const ps = PROJ_STYLE[p]
            return (
              <button key={p} type="button" onClick={() => onToggleProjekt(p)} style={{
                padding: "6px 14px", borderRadius: 99, border: "1px solid", fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all .15s",
                background: checked ? ps.bg : "white",
                color: checked ? ps.color : "var(--muted)",
                borderColor: checked ? ps.color : "var(--line-strong)",
              }}>
                {p}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
function ZakazníciInner() {
  const searchParams = useSearchParams()
  const module: AppModule = (searchParams.get("from") as AppModule) ?? "wed"

  const [zakaznici, setZakaznici] = useState<Zakaznik[]>([])
  const [loading, setLoading]     = useState(true)
  const [query, setQuery]         = useState("")
  const [projektFilter, setProjektFilter] = useState("Vše")
  const [editId, setEditId]       = useState<number | null>(null)
  const [editForm, setEditForm]   = useState<FormData>(EMPTY_FORM)
  const [novyModal, setNovyModal] = useState(false)
  const [novyForm, setNovyForm]   = useState<FormData>(EMPTY_FORM)
  const [ukladam, setUkladam]     = useState(false)
  const [mazaniId, setMazaniId]   = useState<number | null>(null)

  useEffect(() => { nacti() }, [])

  async function nacti() {
    const { data } = await supabase.from("zakaznici").select("*").order("prijmeni").order("jmeno")
    setZakaznici(data ?? [])
    setLoading(false)
  }

  const filtrovani = zakaznici.filter(z => {
    const q = query.toLowerCase()
    const odpovida = !q ||
      z.jmeno.toLowerCase().includes(q) ||
      z.prijmeni.toLowerCase().includes(q) ||
      (z.firma ?? "").toLowerCase().includes(q) ||
      (z.ico ?? "").includes(q) ||
      z.email.toLowerCase().includes(q) ||
      z.telefon.includes(q) ||
      z.mesto.toLowerCase().includes(q)
    const projekt = projektFilter === "Vše" || (z.projekty ?? []).includes(projektFilter)
    return odpovida && projekt
  })

  async function ulozEdit() {
    if (!editId) return
    setUkladam(true)
    const db = createClient()
    await db.from("zakaznici").update(editForm).eq("id", editId)
    await nacti()
    setEditId(null)
    setUkladam(false)
  }

  async function ulozNoveho() {
    setUkladam(true)
    const db = createClient()
    await db.from("zakaznici").insert([novyForm])
    await nacti()
    setNovyModal(false)
    setNovyForm(EMPTY_FORM)
    setUkladam(false)
  }

  async function smazat(id: number) {
    const db = createClient()
    await db.from("zakaznici").delete().eq("id", id)
    setMazaniId(null)
    setZakaznici(prev => prev.filter(z => z.id !== id))
  }

  function toggleProjekt(p: string, form: FormData, setForm: (f: FormData) => void) {
    const projekty = form.projekty.includes(p)
      ? form.projekty.filter(x => x !== p)
      : [...form.projekty, p]
    setForm({ ...form, projekty })
  }

  const inputCls = "w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgba(99,102,241,.3)]"
  const inputStyle: React.CSSProperties = { borderColor: "var(--line-strong)", color: "var(--ink)" }

  // Stats
  const celkem     = zakaznici.length
  const pocty      = PROJEKTY.map(p => ({
    label: p,
    value: zakaznici.filter(z => (z.projekty ?? []).includes(p)).length,
    color: PROJ_STYLE[p].color,
  }))

  return (
    <AppShell module={module}>

      {/* ── Header ── */}
      <div style={{ padding: "28px 32px 0" }}>
        <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--muted)", marginBottom: 4 }}>
          CRM · Kontakty
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontStyle: "normal", fontWeight: 700, fontSize: 26, color: "var(--ink)", margin: 0 }}>
            Zákazníci
          </h1>
          <button onClick={() => setNovyModal(true)} style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 18px", borderRadius: 11,
            background: "linear-gradient(135deg, var(--wed-grad-a), var(--wed-grad-b))",
            color: "white", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 500,
            boxShadow: "0 4px 14px rgba(255,106,139,.3)",
          }}>
            <Ico d={IC.plus} size={13} />
            Nový zákazník
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 24, marginTop: 16, paddingBottom: 20, borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "var(--font-serif)", fontStyle: "normal", fontWeight: 700, fontSize: 28, color: "var(--ink)", lineHeight: 1 }}>{celkem}</span>
            <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: ".08em", textTransform: "uppercase", marginTop: 3 }}>Celkem</span>
          </div>
          {pocty.map(s => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "var(--font-serif)", fontStyle: "normal", fontWeight: 700, fontSize: 28, color: s.color, lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: ".08em", textTransform: "uppercase", marginTop: 3 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Search + filter ── */}
      <div style={{ padding: "20px 32px 0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 440 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}>
            <Ico d={IC.search} size={14} />
          </span>
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Hledat dle jména, firmy, IČO, e-mailu…"
            style={{
              width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              border: "1px solid var(--line-strong)", borderRadius: 11, fontSize: 13,
              background: "white", color: "var(--ink)", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Vše", ...PROJEKTY].map(p => {
            const active = projektFilter === p
            const ps = PROJ_STYLE[p]
            return (
              <button key={p} onClick={() => setProjektFilter(p)} style={{
                padding: "6px 14px", borderRadius: 99, border: "1px solid",
                fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all .15s",
                background: active ? (ps?.bg ?? "var(--ink)") : "white",
                color: active ? (ps?.color ?? "white") : "var(--ink-2)",
                borderColor: active ? (ps?.color ?? "var(--ink)") : "var(--line-strong)",
              }}>
                {p}
              </button>
            )
          })}
        </div>

        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
          {filtrovani.length} {filtrovani.length === 1 ? "kontakt" : filtrovani.length < 5 ? "kontakty" : "kontaktů"}
        </span>
      </div>

      {/* ── Cards ── */}
      <div style={{ padding: "20px 32px 56px" }}>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ height: 160, background: "white", borderRadius: 14, border: "1px solid var(--line)", opacity: 0.6 }} className="animate-pulse" />
            ))}
          </div>
        ) : filtrovani.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--muted)" }}>
            <div style={{ marginBottom: 12, opacity: 0.3 }}><Ico d={IC.user} size={40} /></div>
            <p style={{ fontSize: 15 }}>Žádní zákazníci nenalezeni</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {filtrovani.map(z => (
              <div key={z.id} style={{ background: "white", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "var(--shadow-1)", overflow: "hidden" }}>

                {editId === z.id ? (
                  /* ── Edit inline ── */
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Upravit kontakt</span>
                      <button onClick={() => setEditId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 2 }}>
                        <Ico d={IC.x} size={15} />
                      </button>
                    </div>
                    <CustomerForm
                      form={editForm}
                      onChange={setEditForm}
                      onToggleProjekt={p => toggleProjekt(p, editForm, setEditForm)}
                      inputCls={inputCls}
                      inputStyle={inputStyle}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={ulozEdit} disabled={ukladam} style={{
                        flex: 1, padding: "8px 0", borderRadius: 9, border: "none", cursor: "pointer",
                        background: "linear-gradient(135deg, var(--wed-grad-a), var(--wed-grad-b))",
                        color: "white", fontSize: 12, fontWeight: 600, opacity: ukladam ? 0.6 : 1,
                      }}>
                        {ukladam ? "Ukládám…" : "Uložit"}
                      </button>
                      <button onClick={() => setEditId(null)} style={{
                        padding: "8px 14px", borderRadius: 9, border: "1px solid var(--line-strong)",
                        cursor: "pointer", background: "white", color: "var(--ink-2)", fontSize: 12, fontWeight: 500,
                      }}>
                        Zrušit
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Card view ── */
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: avatarGradient(z),
                        display: "grid", placeItems: "center",
                        color: "white", fontWeight: 700, fontSize: 14,
                      }}>
                        {initials(z)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", lineHeight: 1.2 }}>
                          {displayName(z)}
                        </div>
                        {z.firma?.trim() && (z.jmeno || z.prijmeni) && (
                          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {z.jmeno} {z.prijmeni}
                          </div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                          {(z.projekty ?? []).map(p => {
                            const ps = PROJ_STYLE[p]
                            return (
                              <span key={p} style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
                                textTransform: "uppercase", padding: "2px 8px", borderRadius: 99,
                                background: ps?.bg ?? "var(--bg)", color: ps?.color ?? "var(--muted)",
                              }}>{p}</span>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                      {z.telefon && (
                        <a href={`tel:${z.telefon}`} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-2)", textDecoration: "none", fontSize: 12 }}>
                          <span style={{ color: "var(--muted)", flexShrink: 0 }}><Ico d={IC.phone} size={13} /></span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{z.telefon}</span>
                        </a>
                      )}
                      {z.email && (
                        <a href={`mailto:${z.email}`} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-2)", textDecoration: "none", fontSize: 12 }}>
                          <span style={{ color: "var(--muted)", flexShrink: 0 }}><Ico d={IC.mail} size={13} /></span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.email}</span>
                        </a>
                      )}
                      {(z.ulice || z.mesto) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
                          <span style={{ flexShrink: 0 }}><Ico d={IC.pin} size={13} /></span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {[z.ulice, z.mesto, z.psc].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                      {(z.ico || z.dic) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
                          <span style={{ flexShrink: 0 }}><Ico d={IC.hash} size={13} /></span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                            {z.ico ? `IČO: ${z.ico}` : ""}
                            {z.ico && z.dic ? "  ·  " : ""}
                            {z.dic ? `DIČ: ${z.dic}` : ""}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                        {new Date(z.created_at).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {mazaniId === z.id ? (
                          <>
                            <button onClick={() => smazat(z.id)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "#ef4444", color: "white", fontSize: 11, fontWeight: 600 }}>Potvrdit</button>
                            <button onClick={() => setMazaniId(null)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--line-strong)", cursor: "pointer", background: "white", color: "var(--ink-2)", fontSize: 11 }}>Zrušit</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditId(z.id); setEditForm({ jmeno: z.jmeno, prijmeni: z.prijmeni, firma: z.firma ?? "", ico: z.ico ?? "", dic: z.dic ?? "", ulice: z.ulice, mesto: z.mesto, psc: z.psc, email: z.email, telefon: z.telefon, projekty: z.projekty ?? [] }) }} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "5px 10px", borderRadius: 8,
                              border: "1px solid var(--line-strong)", cursor: "pointer",
                              background: "white", color: "var(--ink-2)", fontSize: 11, fontWeight: 500,
                            }}>
                              <Ico d={IC.edit} size={12} /> Upravit
                            </button>
                            <button onClick={() => setMazaniId(z.id)} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "5px 10px", borderRadius: 8,
                              border: "1px solid rgba(239,68,68,.2)", cursor: "pointer",
                              background: "rgba(239,68,68,.04)", color: "#ef4444", fontSize: 11,
                            }}>
                              <Ico d={IC.trash} size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal: nový zákazník ── */}
      {novyModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(10,10,14,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
          onClick={() => setNovyModal(false)}
        >
          <div
            style={{ background: "white", borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,.22)", width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--muted)", marginBottom: 2 }}>Nový kontakt</div>
                <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)", margin: 0 }}>Přidat zákazníka</h2>
              </div>
              <button onClick={() => setNovyModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}>
                <Ico d={IC.x} size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              <CustomerForm
                form={novyForm}
                onChange={setNovyForm}
                onToggleProjekt={p => toggleProjekt(p, novyForm, setNovyForm)}
                inputCls={inputCls}
                inputStyle={inputStyle}
              />
            </div>

            <div style={{ padding: "0 24px 24px", display: "flex", gap: 10, flexShrink: 0 }}>
              <button onClick={ulozNoveho} disabled={ukladam} style={{
                flex: 1, padding: "10px 0", borderRadius: 11, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, var(--wed-grad-a), var(--wed-grad-b))",
                color: "white", fontSize: 13, fontWeight: 600,
                boxShadow: "0 4px 14px rgba(255,106,139,.3)",
                opacity: ukladam ? 0.6 : 1,
              }}>
                {ukladam ? "Ukládám…" : "Uložit zákazníka"}
              </button>
              <button onClick={() => setNovyModal(false)} style={{
                padding: "10px 18px", borderRadius: 11,
                border: "1px solid var(--line-strong)", cursor: "pointer",
                background: "white", color: "var(--ink-2)", fontSize: 13, fontWeight: 500,
              }}>
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  )
}

export default function Zakaznici() {
  return (
    <Suspense>
      <ZakazníciInner />
    </Suspense>
  )
}
