"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

// ── Konfigurace dostupných hodin ─────────────────────────────────────────────
const DOSTUPNE_HODINY = [9, 10, 11, 14, 15, 16, 17]

const MESICE = [
  "Leden","Únor","Březen","Duben","Květen","Červen",
  "Červenec","Srpen","Září","Říjen","Listopad","Prosinec",
]
const DNY_ZKRATKY = ["Po","Út","St","Čt","Pá","So","Ne"]

type KontaktTyp = "whatsapp" | "facetime" | "osobne"
type Krok = "vyber" | "formular" | "odeslano"

// ── Helpers ───────────────────────────────────────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, "0") }

function datumStr(rok: number, mesic: number, den: number) {
  return `${rok}-${pad2(mesic + 1)}-${pad2(den)}`
}

function jeMinulost(rok: number, mesic: number, den: number) {
  const dnes = new Date(); dnes.setHours(0,0,0,0)
  const d = new Date(rok, mesic, den)
  return d <= dnes
}

// ── Komponenta Kalendář ───────────────────────────────────────────────────────
function Kalendar({
  rok, mesic, vybraneDatum, obsazene,
  onChange, onPrev, onNext,
}: {
  rok: number
  mesic: number
  vybraneDatum: string | null
  obsazene: Record<string, number>   // datum -> počet obsazených hodin
  onChange: (datum: string) => void
  onPrev: () => void
  onNext: () => void
}) {
  const prvniDen = new Date(rok, mesic, 1).getDay()
  const offset = prvniDen === 0 ? 6 : prvniDen - 1
  const pocetDni = new Date(rok, mesic + 1, 0).getDate()

  const bunky: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: pocetDni }, (_, i) => i + 1),
  ]
  while (bunky.length % 7 !== 0) bunky.push(null)

  const dnesNow = new Date(); dnesNow.setHours(0,0,0,0)
  const minMesic = new Date(); minMesic.setDate(1); minMesic.setHours(0,0,0,0)
  const jeAktualniNeboNovejsi = new Date(rok, mesic, 1) >= minMesic

  return (
    <div style={{ background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,.08)", border: "1px solid #f0f0f0" }}>
      {/* Záhlaví */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#be123c" }}>
        <button
          onClick={onPrev}
          disabled={!jeAktualniNeboNovejsi || new Date(rok, mesic, 1) <= minMesic}
          style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "white", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", opacity: new Date(rok, mesic, 1) <= minMesic ? .4 : 1 }}
        >‹</button>
        <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>
          {MESICE[mesic]} {rok}
        </span>
        <button
          onClick={onNext}
          style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "white", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
        >›</button>
      </div>

      {/* Hlavičky dnů */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #f3f4f6" }}>
        {DNY_ZKRATKY.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#9ca3af", padding: "8px 0" }}>{d}</div>
        ))}
      </div>

      {/* Dny */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "4px 6px 8px" }}>
        {bunky.map((den, i) => {
          if (!den) return <div key={i} />
          const datum = datumStr(rok, mesic, den)
          const minuly = jeMinulost(rok, mesic, den)
          const plnyDen = obsazene[datum] !== undefined && obsazene[datum] >= DOSTUPNE_HODINY.length
          const disabled = minuly || plnyDen
          const vybran = vybraneDatum === datum
          const castecne = obsazene[datum] !== undefined && obsazene[datum] > 0 && !plnyDen

          return (
            <button
              key={i}
              onClick={() => !disabled && onChange(datum)}
              style={{
                margin: 2, padding: "7px 4px", border: "none", borderRadius: 9, cursor: disabled ? "default" : "pointer",
                fontSize: 13, fontWeight: vybran ? 700 : 400,
                background: vybran ? "#be123c" : castecne ? "#fff1f2" : "transparent",
                color: disabled ? "#d1d5db" : vybran ? "white" : castecne ? "#be123c" : "#374151",
                outline: "none", textDecoration: plnyDen ? "line-through" : "none",
              }}
            >
              {den}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function VideohovorPage() {
  const dnes = new Date()
  const [rok,   setRok]   = useState(dnes.getFullYear())
  const [mesic, setMesic] = useState(dnes.getMonth())

  const [vybraneDatum, setVybraneDatum] = useState<string | null>(null)
  const [vybranyCas,   setVybranyCas]   = useState<number | null>(null)

  // Obsazenost — načteme pro aktuální + příští měsíc
  const [obsazene, setObsazene] = useState<Record<string, number>>({})

  // Formulář
  const [jmeno,        setJmeno]        = useState("")
  const [datumSvatby,  setDatumSvatby]  = useState("")
  const [typKontaktu,  setTypKontaktu]  = useState<KontaktTyp>("whatsapp")
  const [kontakt,      setKontakt]      = useState("")
  const [nazevPodniku, setNazevPodniku] = useState("")
  const [adresa,       setAdresa]       = useState("")
  const [otazky,       setOtazky]       = useState("")

  const [krok,     setKrok]     = useState<Krok>("vyber")
  const [odeslani, setOdeslani] = useState(false)
  const [chyba,    setChyba]    = useState("")

  // Načtení obsazenosti
  useEffect(() => {
    const od = `${rok}-${pad2(mesic + 1)}-01`
    const do_ = new Date(rok, mesic + 2, 0)
    const doStr = `${do_.getFullYear()}-${pad2(do_.getMonth() + 1)}-${pad2(do_.getDate())}`

    supabase
      .from("schuzky")
      .select("datum, cas")
      .gte("datum", od)
      .lte("datum", doStr)
      .neq("stav", "zrusena")
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, number> = {}
        for (const r of data) {
          map[r.datum] = (map[r.datum] ?? 0) + 1
        }
        setObsazene(prev => ({ ...prev, ...map }))
      })
  }, [rok, mesic])

  // Obsazené časy pro vybraný den
  const [obsazeneCasy, setObsazeneCasy] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!vybraneDatum) { setObsazeneCasy(new Set()); return }
    supabase
      .from("schuzky")
      .select("cas")
      .eq("datum", vybraneDatum)
      .neq("stav", "zrusena")
      .then(({ data }) => {
        const h = new Set((data ?? []).map((r: {cas: string}) => parseInt(r.cas.split(":")[0])))
        setObsazeneCasy(h)
        // resetuj čas pokud je obsazený
        if (vybranyCas !== null && h.has(vybranyCas)) setVybranyCas(null)
      })
  }, [vybraneDatum])

  function prevMesic() {
    if (mesic === 0) { setRok(r => r - 1); setMesic(11) } else setMesic(m => m - 1)
  }
  function nextMesic() {
    if (mesic === 11) { setRok(r => r + 1); setMesic(0) } else setMesic(m => m + 1)
  }

  async function handleOdeslat() {
    if (!jmeno.trim()) { setChyba("Vyplň jméno"); return }
    if (typKontaktu === "osobne") {
      if (!adresa.trim()) { setChyba("Vyplň adresu místa schůzky"); return }
    } else {
      if (!kontakt.trim()) { setChyba("Vyplň kontakt"); return }
    }
    setChyba("")
    setOdeslani(true)
    // Pro osobní schůzku uložíme adresu (a případně název podniku) jako kontakt
    const kontaktUlozit = typKontaktu === "osobne"
      ? [nazevPodniku.trim(), adresa.trim()].filter(Boolean).join(" · ")
      : kontakt.trim()
    const { error } = await supabase.from("schuzky").insert({
      jmeno:         jmeno.trim(),
      datum_svadby:  datumSvatby || null,
      kontakt:       kontaktUlozit,
      typ_kontaktu:  typKontaktu,
      otazky:        otazky.trim() || null,
      datum:         vybraneDatum,
      cas:           `${pad2(vybranyCas!)}:00`,
      stav:          "nova",
    })
    setOdeslani(false)
    if (error) { setChyba("Nepodařilo se uložit. Zkus to znovu."); return }
    setKrok("odeslano")
  }

  // ── Hotovo ────────────────────────────────────────────────────────────────
  if (krok === "odeslano") {
    return (
      <div style={{ minHeight: "100vh", background: "#fafaf9", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "white", borderRadius: 20, padding: "40px 32px", maxWidth: 440, textAlign: "center", boxShadow: "0 4px 32px rgba(0,0,0,.1)" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Výborně, schůzka zarezervována!</h2>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
            Rezervace na <strong>{vybraneDatum}</strong> v <strong>{pad2(vybranyCas!)}:00</strong> byla přijata.
            {typKontaktu === "osobne"
              ? <> Těším se na osobní setkání na adrese <strong>{adresa}</strong>.</>
              : <> Brzy se vám ozvu přes {typKontaktu === "whatsapp" ? "WhatsApp" : "FaceTime"} na <strong>{kontakt}</strong>.</>
            }
          </p>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Těším se na setkání ✨</div>
        </div>
      </div>
    )
  }

  const dnesStr = datumStr(dnes.getFullYear(), dnes.getMonth(), dnes.getDate())
  const datumCitelne = vybraneDatum
    ? new Date(vybraneDatum).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
    : null

  return (
    <div style={{ minHeight: "100vh", background: "#fafaf9", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Hlavička */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#be123c", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>
            Rezervace videohovoru
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 8px" }}>
            Nezávazná konzultace
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0, lineHeight: 1.6 }}>
            Vyberte termín a zodpovím všechny vaše otázky ohledně videozáznamu vaší svatby.
          </p>
        </div>

        {krok === "vyber" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>

              {/* Kalendář */}
              <Kalendar
                rok={rok} mesic={mesic}
                vybraneDatum={vybraneDatum}
                obsazene={obsazene}
                onChange={d => { setVybraneDatum(d); setVybranyCas(null) }}
                onPrev={prevMesic}
                onNext={nextMesic}
              />

              {/* Časy */}
              <div style={{ background: "white", borderRadius: 16, padding: "16px 14px", boxShadow: "0 2px 16px rgba(0,0,0,.08)", border: "1px solid #f0f0f0", minWidth: 110 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#9ca3af", marginBottom: 10, textAlign: "center" }}>
                  {vybraneDatum ? datumCitelne!.split(" ").slice(0,2).join(" ") : "Čas"}
                </div>
                {vybraneDatum ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {DOSTUPNE_HODINY.map(h => {
                      const volny = !obsazeneCasy.has(h)
                      const aktivni = vybranyCas === h
                      return (
                        <button
                          key={h}
                          onClick={() => volny && setVybranyCas(h)}
                          disabled={!volny}
                          style={{
                            padding: "9px 14px", border: "1.5px solid", borderRadius: 10, cursor: volny ? "pointer" : "default",
                            borderColor: aktivni ? "#be123c" : volny ? "#e5e7eb" : "#f3f4f6",
                            background: aktivni ? "#be123c" : volny ? "white" : "#f9f9f9",
                            color: aktivni ? "white" : volny ? "#374151" : "#d1d5db",
                            fontWeight: aktivni ? 700 : 400, fontSize: 14, textDecoration: !volny ? "line-through" : "none",
                          }}
                        >
                          {pad2(h)}:00
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", color: "#d1d5db", fontSize: 12, padding: "20px 0" }}>
                    Nejdřív<br />vyber den
                  </div>
                )}
              </div>
            </div>

            {/* Pokračovat */}
            {vybraneDatum && vybranyCas !== null && (
              <div style={{ marginTop: 20, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>
                  Vybrán termín:{" "}
                  <strong style={{ color: "#111827" }}>
                    {datumCitelne} v {pad2(vybranyCas)}:00
                  </strong>
                </div>
                <button
                  onClick={() => setKrok("formular")}
                  style={{
                    padding: "12px 32px", borderRadius: 12, border: "none", cursor: "pointer",
                    background: "linear-gradient(135deg, #be123c, #9f1239)",
                    color: "white", fontSize: 15, fontWeight: 700,
                    boxShadow: "0 4px 16px rgba(190,18,60,.3)",
                  }}
                >
                  Pokračovat →
                </button>
              </div>
            )}
          </>
        )}

        {krok === "formular" && (
          <div style={{ background: "white", borderRadius: 16, padding: "24px 20px", boxShadow: "0 2px 16px rgba(0,0,0,.08)", border: "1px solid #f0f0f0" }}>

            {/* Shrnutí termínu */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, paddingBottom: 18, borderBottom: "1px solid #f3f4f6" }}>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Vybraný termín</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
                  {datumCitelne} · {pad2(vybranyCas!)}:00
                </div>
              </div>
              <button
                onClick={() => setKrok("vyber")}
                style={{ fontSize: 12, color: "#be123c", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Změnit
              </button>
            </div>

            {/* Vaše jméno */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Vaše jméno *</label>
              <input
                value={jmeno}
                onChange={e => setJmeno(e.target.value)}
                placeholder="Jméno a příjmení"
                style={inp}
                autoFocus
              />
            </div>

            {/* Datum svatby */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>
                Datum vaší svatby
                <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(volitelné)</span>
              </label>
              <input
                type="date"
                value={datumSvatby}
                onChange={e => setDatumSvatby(e.target.value)}
                style={inp}
              />
            </div>

            {/* Kontakt */}
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Způsob kontaktu *</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {(["whatsapp", "facetime", "osobne"] as KontaktTyp[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTypKontaktu(t)}
                    style={{
                      flex: 1, padding: "8px 6px", borderRadius: 9, cursor: "pointer", fontSize: 12.5,
                      border: "1.5px solid",
                      borderColor: typKontaktu === t ? "#be123c" : "#e5e7eb",
                      background: typKontaktu === t ? "#fff1f2" : "white",
                      color: typKontaktu === t ? "#be123c" : "#6b7280",
                      fontWeight: typKontaktu === t ? 700 : 400,
                    }}
                  >
                    {t === "whatsapp" ? "📱 WhatsApp" : t === "facetime" ? "📹 FaceTime" : "🤝 Osobně"}
                  </button>
                ))}
              </div>

              {/* WhatsApp / FaceTime — kontaktní číslo */}
              {typKontaktu !== "osobne" && (
                <input
                  value={kontakt}
                  onChange={e => setKontakt(e.target.value)}
                  placeholder={typKontaktu === "facetime" ? "Apple ID / telefon" : "+420 000 000 000"}
                  style={inp}
                  type={typKontaktu === "facetime" ? "text" : "tel"}
                  inputMode="tel"
                />
              )}

              {/* Osobně — varování + adresa */}
              {typKontaktu === "osobne" && (
                <div>
                  {/* Červené varování */}
                  <div style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    padding: "12px 14px", borderRadius: 10, marginBottom: 12,
                    background: "#fef2f2", border: "1.5px solid #fecaca",
                  }}>
                    <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
                    <span style={{ fontSize: 13, color: "#991b1b", lineHeight: 1.5 }}>
                      <strong>Upozornění:</strong> Osobní schůzka je možná pouze v{" "}
                      <strong>Hradci Králové</strong>. Pokud jste z jiného města, zvolte prosím videohovor přes WhatsApp nebo FaceTime.
                    </span>
                  </div>

                  {/* Název podniku */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ ...lbl, marginBottom: 5 }}>
                      Název podniku / kavárny
                      <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(volitelné)</span>
                    </label>
                    <input
                      value={nazevPodniku}
                      onChange={e => setNazevPodniku(e.target.value)}
                      placeholder="např. Kavárna U Martina, Coworking Hub…"
                      style={inp}
                    />
                  </div>

                  {/* Adresa */}
                  <div>
                    <label style={{ ...lbl, marginBottom: 5 }}>Adresa *</label>
                    <input
                      value={adresa}
                      onChange={e => setAdresa(e.target.value)}
                      placeholder="Ulice a číslo, Hradec Králové"
                      style={inp}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Otázky */}
            <div style={{ marginBottom: 24 }}>
              <label style={lbl}>
                Vaše otázky a přání
                <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(volitelné)</span>
              </label>
              <textarea
                value={otazky}
                onChange={e => setOtazky(e.target.value)}
                placeholder="Na co se chcete zeptat? Popište svou představu, styl svatby, zvláštní přání…"
                rows={4}
                style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
              />
            </div>

            {chyba && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", borderRadius: 8, color: "#ef4444", fontSize: 13 }}>
                {chyba}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setKrok("vyber")}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 14, cursor: "pointer" }}
              >
                ← Zpět
              </button>
              <button
                onClick={handleOdeslat}
                disabled={odeslani}
                style={{
                  flex: 2, padding: "11px", borderRadius: 10, border: "none", cursor: odeslani ? "default" : "pointer",
                  background: "linear-gradient(135deg, #be123c, #9f1239)",
                  color: "white", fontSize: 14, fontWeight: 700, opacity: odeslani ? .7 : 1,
                  boxShadow: "0 4px 16px rgba(190,18,60,.25)",
                }}
              >
                {odeslani ? "Odesílám…" : "Rezervovat schůzku ✓"}
              </button>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11.5, color: "#d1d5db" }}>
          Rezervace je nezávazná · Odpovím do 24 hodin
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const lbl: React.CSSProperties = {
  display: "block", fontSize: 12.5, fontWeight: 600, color: "#374151", marginBottom: 6,
}
const inp: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "10px 13px", borderRadius: 9,
  border: "1.5px solid #e5e7eb", fontSize: 14, color: "#111827", outline: "none",
  background: "white",
}
