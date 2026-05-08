"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import MapaTrasy from "@/components/MapaTrasy"
import AppShell from "@/components/AppShell"

// ─── Design constants ────────────────────────────────────────────────────────

const WED_PILL: Record<string, { bg: string; color: string }> = {
  "poptavka":     { bg: "#f2f1ec", color: "var(--ink-2)" },
  "rozhoduje-se": { bg: "#fff9c4", color: "#7a5c00" },
  "objednavka":   { bg: "#e8f0fe", color: "#1a56db" },
  "cekam-platbu": { bg: "#fff2dd", color: "#8a5a00" },
  "zaplaceno":    { bg: "#e6f7ee", color: "#156a3a" },
  "ve-strizne":   { bg: "#f3e8ff", color: "#6b21a8" },
  "po-svatbe":    { bg: "#e0f2fe", color: "#0369a1" },
  "ukonceno":     { bg: "#f1f5f9", color: "#475569" },
}

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

const TYP_BADGE: Record<string, { bg: string; color: string }> = {
  "foto":       { bg: "#dbeafe", color: "#1d4ed8" },
  "video":      { bg: "#ffe4e6", color: "#be123c" },
  "foto+video": { bg: "#ffedd5", color: "#c2410c" },
}

// ─── Confirmation dialog ──────────────────────────────────────────────────────

function PotvrzeniSmazani({ jmena, onPotvrdit, onZrusit }: {
  jmena: string
  onPotvrdit: () => void
  onZrusit: () => void
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 50, padding: 16,
    }}>
      <div style={{
        background: "white", borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)", padding: 24, maxWidth: 360, width: "100%",
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
          Smazat zakázku?
        </h3>
        <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 24 }}>
          Opravdu chceš smazat zakázku <strong style={{ color: "var(--ink)" }}>{jmena}</strong>? Tato akce je nevratná.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={onPotvrdit}
            style={{
              flex: 1, background: "#ef4444", color: "white",
              padding: "8px 0", borderRadius: "var(--radius-md)", fontWeight: 600,
              border: "none", cursor: "pointer", fontSize: 13.5,
            }}
            onMouseOver={e => (e.currentTarget.style.background = "#dc2626")}
            onMouseOut={e => (e.currentTarget.style.background = "#ef4444")}
          >
            Smazat
          </button>
          <button
            onClick={onZrusit}
            style={{
              flex: 1, background: "#f3f4f6", color: "#374151",
              padding: "8px 0", borderRadius: "var(--radius-md)", fontWeight: 600,
              border: "none", cursor: "pointer", fontSize: 13.5,
            }}
            onMouseOver={e => (e.currentTarget.style.background = "#e5e7eb")}
            onMouseOut={e => (e.currentTarget.style.background = "#f3f4f6")}
          >
            Zrušit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Row helper ───────────────────────────────────────────────────────────────

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em",
        textTransform: "uppercase", color: "var(--muted)", marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 13.5, color: "var(--ink)", fontWeight: 500,
        fontFamily: mono ? "var(--font-mono)" : "inherit",
      }}>
        {value || "—"}
      </div>
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  title, accent, children,
}: {
  title: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--line)",
      borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)", overflow: "hidden",
    }}>
      <div style={{
        padding: "13px 20px 11px", borderBottom: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ width: 3, height: 12, borderRadius: 99, background: accent, flexShrink: 0 }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-2)",
        }}>
          {title}
        </span>
      </div>
      <div style={{ padding: "16px 20px" }}>
        {children}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

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
    const telefon = zakazka.zakaznici?.telefon
    const email = zakazka.zakaznici?.email
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

  // ─── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell module="wed">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 256, color: "var(--muted)" }}>
          Načítám...
        </div>
      </AppShell>
    )
  }

  if (!zakazka) {
    return (
      <AppShell module="wed">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 256, color: "var(--muted)" }}>
          Zakázka nenalezena.
        </div>
      </AppShell>
    )
  }

  // ─── Derived values ─────────────────────────────────────────────────────────

  const stavKey = zakazka.stav ?? "poptavka"
  const stavBorderColor = STAV_BORDER[stavKey] ?? "#9ca3af"
  const stavPill = WED_PILL[stavKey] ?? WED_PILL["poptavka"]
  const typBadge = TYP_BADGE[zakazka.typ_sluzby] ?? { bg: "#f1f5f9", color: "#475569" }

  // Day / month / year for the date box
  const datumDate = zakazka.datum_svatby ? new Date(zakazka.datum_svatby) : null
  const datumDen = datumDate ? datumDate.getDate().toString().padStart(2, "0") : "—"
  const datumMmYyyy = datumDate
    ? `${(datumDate.getMonth() + 1).toString().padStart(2, "0")}.${datumDate.getFullYear()}`
    : "—"

  const STAV_BTN_LIST = [
    { value: "poptavka",     label: "Poptávka" },
    { value: "rozhoduje-se", label: "Rozhoduje se" },
    { value: "objednavka",   label: "Objednávka" },
    { value: "cekam-platbu", label: "Čekám platbu" },
    { value: "zaplaceno",    label: "Zaplaceno" },
    { value: "ve-strizne",   label: "Ve střižně" },
    { value: "po-svatbe",    label: "Po svatbě" },
    { value: "ukonceno",     label: "Ukončeno" },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell module="wed">

      {/* ── HERO with photo ── */}
      {zakazka.foto_url && (
        <div style={{ position: "relative", height: 300, overflow: "hidden", background: "#e5e7eb" }}>
          <img
            src={zakazka.foto_url}
            alt={`${zakazka.jmeno_nevesty} & ${zakazka.jmeno_zenicha}`}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.28) 60%, transparent 100%)",
          }} />
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            textAlign: "center", padding: "0 24px",
          }}>
            <p style={{
              fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)",
              letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 12,
              textShadow: "0 1px 4px rgba(0,0,0,.4)",
            }}>
              {formatDatum(zakazka.datum_svatby)}
            </p>
            <h1 style={{
              fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 700,
              color: "white", lineHeight: 1.2, textShadow: "0 2px 8px rgba(0,0,0,.5)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            }}>
              <span>{zakazka.jmeno_nevesty || "—"}</span>
              <span>{zakazka.jmeno_zenicha || "—"}</span>
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 20 }}>
              <span style={{
                background: "rgba(255,255,255,0.2)", backdropFilter: "blur(4px)",
                color: "white", fontSize: 14, fontWeight: 600, padding: "8px 20px", borderRadius: 99,
              }}>
                {typLabel(zakazka.typ_sluzby)}
              </span>
              <span style={{
                background: "rgba(255,255,255,0.2)", backdropFilter: "blur(4px)",
                color: "white", fontSize: 14, fontWeight: 600, padding: "8px 20px", borderRadius: 99,
              }}>
                {zbyvaKdni(zakazka.datum_svatby)}
              </span>
              {zakazka.vzdalenost_km && (
                <span style={{
                  background: "rgba(255,255,255,0.2)", backdropFilter: "blur(4px)",
                  color: "white", fontSize: 14, fontWeight: 600, padding: "8px 20px", borderRadius: 99,
                }}>
                  {zakazka.vzdalenost_km} km
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── HERO without photo ── */}
      {!zakazka.foto_url && (
        <div className="mx-4 ipad:mx-8" style={{
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)",
          marginTop: 24,
          overflow: "hidden",
          borderTop: `4px solid ${stavBorderColor}`,
        }}>
          <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            {/* Date box */}
            <div style={{
              width: 66, flexShrink: 0, background: stavBorderColor, color: "white",
              borderRadius: "var(--radius-md)", textAlign: "center", padding: "10px 0",
            }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
                {datumDen}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 4, opacity: 0.9 }}>
                {datumMmYyyy}
              </div>
            </div>
            {/* Names + badges */}
            <div style={{ flex: 1, minWidth: 180 }}>
              <h1 style={{
                fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 700,
                color: "var(--ink)", lineHeight: 1.2, marginBottom: 10,
              }}>
                {zakazka.jmeno_nevesty || "—"} &amp; {zakazka.jmeno_zenicha || "—"}
              </h1>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {zakazka.typ_sluzby && (
                  <span style={{
                    background: typBadge.bg, color: typBadge.color,
                    fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                    fontFamily: "var(--font-mono)", letterSpacing: ".04em",
                  }}>
                    {typLabel(zakazka.typ_sluzby)}
                  </span>
                )}
                <span style={{
                  background: stavPill.bg, color: stavPill.color,
                  fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                  fontFamily: "var(--font-mono)", letterSpacing: ".04em",
                }}>
                  {zbyvaKdni(zakazka.datum_svatby)}
                </span>
              </div>
            </div>
            {/* Action buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              {/* Status dropdown */}
              <select
                value={stavKey}
                onChange={e => zmenStav(e.target.value)}
                style={{
                  height: 38, padding: "0 10px",
                  borderRadius: "var(--radius-md)",
                  border: `1px solid ${stavBorderColor}`,
                  background: stavPill.bg,
                  color: stavPill.color,
                  fontSize: 12.5, fontWeight: 600,
                  cursor: "pointer", outline: "none",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {STAV_BTN_LIST.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {/* Odevzdat */}
              <button
                onClick={toggleOdevzdani}
                style={{
                  height: 38, padding: "0 14px",
                  borderRadius: "var(--radius-md)",
                  border: zakazka.vystup_odevzdan ? "1px solid #4ade80" : "1px solid #fb923c",
                  background: zakazka.vystup_odevzdan ? "#e6f7ee" : "#fff2dd",
                  color: zakazka.vystup_odevzdan ? "#156a3a" : "#8a5a00",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {zakazka.vystup_odevzdan ? "✓ Odevzdáno" : "Odevzdat"}
              </button>
              <button
                onClick={() => router.push(`/svatby/zakazky/${zakazka.id}/edit`)}
                title="Upravit"
                style={{
                  width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)",
                  color: "var(--ink-2)", cursor: "pointer",
                }}
                onMouseOver={e => (e.currentTarget.style.background = "var(--line)")}
                onMouseOut={e => (e.currentTarget.style.background = "var(--bg)")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              {zakazka.datum_svatby && (
                <a
                  href={googleKalendarUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Zapsat do Google Kalendáře"
                  style={{
                    width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "var(--radius-md)",
                    color: "#1d4ed8", cursor: "pointer", textDecoration: "none",
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = "#dbeafe")}
                  onMouseOut={e => (e.currentTarget.style.background = "#eff6ff")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </a>
              )}
              {zakazka.jmeno_nevesty && (
                <button
                  onClick={stahnoutKontakt}
                  title="Stáhnout kontakt nevěsty"
                  style={{
                    width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)",
                    color: "var(--ink-2)", cursor: "pointer",
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = "var(--line)")}
                  onMouseOut={e => (e.currentTarget.style.background = "var(--bg)")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setMazani(true)}
                title="Smazat"
                style={{
                  width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: "var(--radius-md)",
                  color: "#be123c", cursor: "pointer",
                }}
                onMouseOver={e => (e.currentTarget.style.background = "#ffe4e6")}
                onMouseOut={e => (e.currentTarget.style.background = "#fff1f2")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="px-4 ipad:px-8" style={{ paddingTop: 24, paddingBottom: 64 }}>

        {/* Photo hero action row (shown when foto_url exists) */}
        {zakazka.foto_url && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            {/* Status dropdown */}
            <select
              value={stavKey}
              onChange={e => zmenStav(e.target.value)}
              style={{
                height: 38, padding: "0 10px",
                borderRadius: "var(--radius-md)",
                border: `1px solid ${stavBorderColor}`,
                background: stavPill.bg,
                color: stavPill.color,
                fontSize: 12.5, fontWeight: 600,
                cursor: "pointer", outline: "none",
                fontFamily: "var(--font-sans)",
              }}
            >
              {STAV_BTN_LIST.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {/* Odevzdat */}
            <button
              onClick={toggleOdevzdani}
              style={{
                height: 38, padding: "0 14px",
                borderRadius: "var(--radius-md)",
                border: zakazka.vystup_odevzdan ? "1px solid #4ade80" : "1px solid #fb923c",
                background: zakazka.vystup_odevzdan ? "#e6f7ee" : "#fff2dd",
                color: zakazka.vystup_odevzdan ? "#156a3a" : "#8a5a00",
                fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                fontFamily: "var(--font-sans)",
              }}
            >
              {zakazka.vystup_odevzdan ? "✓ Odevzdáno" : "Odevzdat"}
            </button>
            {/* Edit */}
            <button
              onClick={() => router.push(`/svatby/zakazky/${zakazka.id}/edit`)}
              title="Upravit"
              style={{
                width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)",
                color: "var(--ink-2)", cursor: "pointer",
              }}
              onMouseOver={e => (e.currentTarget.style.background = "var(--bg)")}
              onMouseOut={e => (e.currentTarget.style.background = "var(--surface)")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {zakazka.datum_svatby && (
              <a
                href={googleKalendarUrl()}
                target="_blank"
                rel="noopener noreferrer"
                title="Zapsat do Google Kalendáře"
                style={{
                  width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "var(--radius-md)",
                  color: "#1d4ed8", cursor: "pointer", textDecoration: "none",
                }}
                onMouseOver={e => (e.currentTarget.style.background = "#dbeafe")}
                onMouseOut={e => (e.currentTarget.style.background = "#eff6ff")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </a>
            )}
            {zakazka.jmeno_nevesty && (
              <button
                onClick={stahnoutKontakt}
                title="Stáhnout kontakt nevěsty"
                style={{
                  width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)",
                  color: "var(--ink-2)", cursor: "pointer",
                }}
                onMouseOver={e => (e.currentTarget.style.background = "var(--bg)")}
                onMouseOut={e => (e.currentTarget.style.background = "var(--surface)")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setMazani(true)}
              title="Smazat"
              style={{
                width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: "var(--radius-md)",
                color: "#be123c", cursor: "pointer",
              }}
              onMouseOver={e => (e.currentTarget.style.background = "#ffe4e6")}
              onMouseOut={e => (e.currentTarget.style.background = "#fff1f2")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}

        {mazani && (
          <PotvrzeniSmazani
            jmena={`${zakazka.jmeno_nevesty} & ${zakazka.jmeno_zenicha}`}
            onPotvrdit={smazatZakazku}
            onZrusit={() => setMazani(false)}
          />
        )}

        {/* ── 2-column grid ── */}
        <div className="grid grid-cols-1 ipad:grid-cols-[1fr_340px]" style={{ gap: 16, alignItems: "start" }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Klient */}
            <SectionCard title="Klient" accent="#ff6a8b">
              {zakazka.zakaznici && (
                <div style={{ marginBottom: 12, textAlign: "right" }}>
                  <a
                    href="/zakaznici"
                    style={{ fontSize: 11, color: "#f43f5e", textDecoration: "none", fontFamily: "var(--font-mono)" }}
                    onMouseOver={e => (e.currentTarget.style.opacity = "0.7")}
                    onMouseOut={e => (e.currentTarget.style.opacity = "1")}
                  >
                    Centrální databáze →
                  </a>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "12px 24px" }}>
                <Row label="Nevěsta" value={zakazka.jmeno_nevesty} />
                <Row label="Ženich" value={zakazka.jmeno_zenicha} />
                <Row label="Telefon" value={zakazka.zakaznici?.telefon ?? "—"} />
                <Row label="E-mail" value={zakazka.zakaznici?.email ?? "—"} />
                <div style={{ gridColumn: "1 / -1" }}>
                  <Row label="Fakturační adresa" value={
                    [zakazka.zakaznici?.ulice, zakazka.zakaznici?.psc, zakazka.zakaznici?.mesto].filter(Boolean).join(", ") || "—"
                  } />
                </div>
              </div>
            </SectionCard>

            {/* Info o svatbě */}
            <SectionCard title="Info o svatbě" accent="#3b82f6">
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "12px 24px" }}>
                <Row label="Datum svatby" value={formatDatum(zakazka.datum_svatby)} />
                <Row label="Čas obřadu" value={formatCas(zakazka.cas_obradu)} />
                <Row label="Čas příjezdu" value={formatCas(zakazka.cas_prijezdu)} />
                <Row label="Počet svatebčanů" value={zakazka.pocet_svatebcanu ? String(zakazka.pocet_svatebcanu) : "—"} />
              </div>
            </SectionCard>

            {/* Videohovor */}
            <SectionCard title="Videohovor" accent="#38bdf8">
              {zakazka.videohovor_datum ? (
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#156a3a", fontWeight: 600, fontSize: 13 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", background: "#e6f7ee",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
                    }}>✓</span>
                    Proběhl {new Date(zakazka.videohovor_datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                  <input
                    type="date"
                    value={zakazka.videohovor_datum}
                    onChange={e => ulozVideohovor(e.target.value)}
                    style={{
                      fontSize: 13, border: "1px solid var(--line)", borderRadius: "var(--radius-md)",
                      padding: "5px 10px", color: "var(--ink)", background: "var(--bg)", outline: "none",
                    }}
                  />
                  <button
                    onClick={() => ulozVideohovor(null)}
                    style={{
                      fontSize: 11.5, color: "var(--muted)", background: "none", border: "none",
                      cursor: "pointer", padding: 0,
                    }}
                    onMouseOver={e => (e.currentTarget.style.color = "#ef4444")}
                    onMouseOut={e => (e.currentTarget.style.color = "var(--muted)")}
                  >
                    Zrušit
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>Zatím neproběhl</span>
                  <button
                    onClick={() => ulozVideohovor(new Date().toISOString().slice(0, 10))}
                    style={{
                      background: "#e0f2fe", color: "#0369a1", fontSize: 12.5, fontWeight: 600,
                      padding: "6px 14px", borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = "#bae6fd")}
                    onMouseOut={e => (e.currentTarget.style.background = "#e0f2fe")}
                  >
                    Označit jako proběhlý dnes
                  </button>
                  <input
                    type="date"
                    onChange={e => { if (e.target.value) ulozVideohovor(e.target.value) }}
                    style={{
                      fontSize: 13, border: "1px solid var(--line)", borderRadius: "var(--radius-md)",
                      padding: "5px 10px", color: "var(--ink-2)", background: "var(--bg)", outline: "none",
                    }}
                    placeholder="Jiné datum"
                  />
                </div>
              )}
            </SectionCard>

            {/* Místa */}
            <SectionCard title="Místa" accent="#4ade80">
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
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
            </SectionCard>

            {/* Další info */}
            {zakazka.dalsi_info && (
              <SectionCard title="Další info o svatbě" accent="#94a3b8">
                <p style={{ fontSize: 13.5, color: "var(--ink)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {zakazka.dalsi_info}
                </p>
              </SectionCard>
            )}

            {/* Poznámky */}
            {zakazka.poznamky && (
              <SectionCard title="Poznámky (soukromé)" accent="#94a3b8">
                <p style={{ fontSize: 13.5, color: "var(--ink)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {zakazka.poznamky}
                </p>
              </SectionCard>
            )}

          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Finance */}
            <SectionCard title="Finance" accent="#fbbf24">
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em",
                  textTransform: "uppercase", color: "var(--muted)", marginBottom: 4,
                }}>
                  Cena s DPH
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
                  {formatCena(zakazka.cena)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Row label="Rezervační poplatek" value="2 900 Kč" mono />
                {zakazka.cena_benzinu ? (
                  <Row label="Cena benzínu ke dni svatby" value={`${zakazka.cena_benzinu.toFixed(2).replace(".", ",")} Kč/l`} mono />
                ) : null}
              </div>
            </SectionCard>

            {/* Služba */}
            <SectionCard title="Služba & doplňky" accent="#f97316">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            </SectionCard>

            {/* Stav výstupu */}
            <SectionCard title="Stav výstupu" accent="#c084fc">
              {zakazka.vystup_odevzdan ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%", background: "#e6f7ee",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, color: "#156a3a", flexShrink: 0,
                    }}>✓</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "#156a3a" }}>Odevzdáno</span>
                  </div>
                  {zakazka.datum_odevzdani && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                      {new Date(zakazka.datum_odevzdani).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", background: "#fb923c", flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13.5, color: "#8a5a00", fontWeight: 500 }}>Čeká na odevzdání</span>
                </div>
              )}
            </SectionCard>

            {/* Historie */}
            <SectionCard title="Historie stavů" accent="#94a3b8">
              {historie.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--muted)" }}>Zatím žádné záznamy.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {historie.map((h, i) => {
                    const info = historieInfo(h.stav)
                    // Determine dot color from info.barva class hint
                    const dotColor =
                      info.barva.includes("green") ? "#4ade80" :
                      info.barva.includes("sky") ? "#38bdf8" :
                      info.barva.includes("blue") ? "#60a5fa" :
                      info.barva.includes("yellow") ? "#fbbf24" :
                      info.barva.includes("orange") ? "#fb923c" :
                      info.barva.includes("purple") ? "#c084fc" :
                      info.barva.includes("slate") ? "#94a3b8" :
                      "#9ca3af"
                    return (
                      <div key={h.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingBottom: 12 }}>
                        {/* Timeline column */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 12 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, marginTop: 2, flexShrink: 0 }} />
                          {i < historie.length - 1 && (
                            <div style={{ width: 1, flex: 1, minHeight: 16, background: "var(--line)", marginTop: 3 }} />
                          )}
                        </div>
                        {/* Content */}
                        <div style={{ flex: 1, paddingBottom: i < historie.length - 1 ? 0 : 0 }}>
                          <span style={{
                            display: "inline-block", fontSize: 11.5, fontWeight: 600,
                            padding: "2px 10px", borderRadius: "var(--radius-md)",
                            background:
                              info.barva.includes("green") ? "#e6f7ee" :
                              info.barva.includes("sky") ? "#e0f2fe" :
                              info.barva.includes("blue") ? "#dbeafe" :
                              info.barva.includes("yellow") ? "#fef9c3" :
                              info.barva.includes("orange") ? "#fff2dd" :
                              info.barva.includes("purple") ? "#f3e8ff" :
                              info.barva.includes("slate") ? "#f1f5f9" :
                              "#f3f4f6",
                            color:
                              info.barva.includes("green") ? "#156a3a" :
                              info.barva.includes("sky") ? "#0369a1" :
                              info.barva.includes("blue") ? "#1d4ed8" :
                              info.barva.includes("yellow") ? "#7a5c00" :
                              info.barva.includes("orange") ? "#8a5a00" :
                              info.barva.includes("purple") ? "#6b21a8" :
                              info.barva.includes("slate") ? "#475569" :
                              "#4b5563",
                          }}>
                            {info.label}
                          </span>
                          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
                            {new Date(h.created_at).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}
                            {" v "}
                            {new Date(h.created_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>

          </div>
        </div>
      </div>
    </AppShell>
  )
}
