"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { createClient } from "@/lib/supabase-browser"
import AppShell from "@/components/AppShell"

// ── Typy ──────────────────────────────────────────────────────────────────────
type Polozka = {
  id: number
  name: string
  barva: string
  typ: "sluzba" | "material" | null
  sazba: number            // prodejní cena bez DPH (služba = /hod, materiál = /jednotku)
  sazba_typ: string        // "hodina" | "kus" — zachováno kvůli timeru
  jednotka: string | null
  nakupni_cena: number | null
  dodavatel: string | null
  kod_produktu: string | null
  odkaz: string | null
  sort_order: number
}

const DPH = 1.21

// Pevné barvy podle typu — červená = služba, modrá = materiál
const BARVA_SLUZBA   = "#ef4444"
const BARVA_MATERIAL = "#3b82f6"
function barvaTypu(typ: "sluzba" | "material") {
  return typ === "sluzba" ? BARVA_SLUZBA : BARVA_MATERIAL
}

const JEDNOTKY = ["ks", "sada", "m", "kg"]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fKc(n: number) {
  return n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Kč"
}

function parseNum(s: string) {
  const v = parseFloat(s.replace(",", "."))
  return isNaN(v) || v < 0 ? null : v
}

function Ico({ d, size = 16 }: { d: string | string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

const IC = {
  plus:  ["M12 5v14", "M5 12h14"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
  edit:  ["M12 20h9", "M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"],
  x:     ["M18 6L6 18", "M6 6l12 12"],
}

// ── DPH hint ──────────────────────────────────────────────────────────────────
function DphHint({ bezDph, suffix }: { bezDph: number; suffix?: string }) {
  if (!bezDph) return null
  return (
    <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
      s DPH:{" "}
      <strong style={{ color: "#059669" }}>
        {fKc(bezDph * DPH)}{suffix}
      </strong>
    </span>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({
  onClose, onSaved, editItem, pocetPolozek,
}: {
  onClose: () => void
  onSaved: (p: Polozka) => void
  editItem?: Polozka
  pocetPolozek: number
}) {
  const isEdit = !!editItem
  const [typ,         setTyp]         = useState<"sluzba" | "material">(editItem?.typ ?? "sluzba")
  const [sluzbaRezim, setSluzbaRezim] = useState<"hodina" | "kus">(editItem?.sazba_typ === "kus" ? "kus" : "hodina")
  const [name,     setName]     = useState(editItem?.name ?? "")
  const barva = barvaTypu(typ)   // automaticky podle typu, nepotřebuje state
  const [prodej,      setProdej]      = useState(editItem ? String(editItem.sazba) : "")
  const [jednotka,   setJednotka]    = useState(editItem?.jednotka ?? "ks")
  const [nakup,      setNakup]       = useState(editItem?.nakupni_cena != null ? String(editItem.nakupni_cena) : "")
  const [dodavatel,  setDodavatel]   = useState(editItem?.dodavatel ?? "")
  const [kodProd,    setKodProd]     = useState(editItem?.kod_produktu ?? "")
  const [odkaz,      setOdkaz]       = useState(editItem?.odkaz ?? "")
  const [saving,     setSaving]      = useState(false)
  const [err,        setErr]         = useState("")

  const prodejNum = parseNum(prodej) ?? 0
  const nakupNum  = parseNum(nakup)  ?? 0
  const marze     = prodejNum - nakupNum

  async function handleSave() {
    if (!name.trim())                { setErr("Vyplň název"); return }
    if (parseNum(prodej) === null)   { setErr("Zadej platnou cenu"); return }
    setErr("")
    setSaving(true)
    const db = createClient()
    const kusMode = typ === "material" || (typ === "sluzba" && sluzbaRezim === "kus")
    const payload = {
      name:          name.trim(),
      barva,
      typ,
      sazba:         parseNum(prodej)!,
      sazba_typ:     typ === "sluzba" ? sluzbaRezim : "kus",
      jednotka:      kusMode ? jednotka : null,
      nakupni_cena:  kusMode && parseNum(nakup) !== null ? parseNum(nakup) : null,
      dodavatel:     typ === "material" && dodavatel.trim() ? dodavatel.trim() : null,
      kod_produktu:  typ === "material" && kodProd.trim()   ? kodProd.trim()   : null,
      odkaz:         typ === "material" && odkaz.trim()      ? odkaz.trim()     : null,
    }
    let data, error
    if (isEdit) {
      ;({ data, error } = await db.from("george_kategorie").update(payload).eq("id", editItem.id).select().single())
    } else {
      ;({ data, error } = await db.from("george_kategorie").insert({ ...payload, sort_order: pocetPolozek }).select().single())
    }
    setSaving(false)
    if (error || !data) { setErr("Chyba při ukládání"); return }
    onSaved(data as Polozka)
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: "white", borderRadius: 18, padding: 28, width: "100%", maxWidth: 460, boxShadow: "0 12px 48px rgba(0,0,0,.2)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Hlavička */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>
            {isEdit ? "Upravit položku" : "Nová položka ceníku"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, borderRadius: 6 }}>
            <Ico d={IC.x} size={18} />
          </button>
        </div>

        {/* Typ */}
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Typ položky</label>
          <div style={{ display: "flex", gap: 10 }}>
            {(["sluzba", "material"] as const).map(t => (
              <button key={t} onClick={() => setTyp(t)} style={{
                flex: 1, padding: "10px 12px", borderRadius: 11, cursor: "pointer",
                border: "2px solid",
                borderColor: typ === t ? (t === "sluzba" ? "#6366f1" : "#10b981") : "#e5e7eb",
                background: typ === t ? (t === "sluzba" ? "#eef2ff" : "#f0fdf4") : "white",
                color: typ === t ? (t === "sluzba" ? "#4338ca" : "#166534") : "#6b7280",
                fontWeight: typ === t ? 700 : 400, fontSize: 14,
              }}>
                {t === "sluzba" ? "⚡ Služba" : "📦 Materiál"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "#9ca3af", marginTop: 6 }}>
            {typ === "sluzba"
              ? (sluzbaRezim === "hodina" ? "Účtováno hodinovou sazbou" : "Účtováno za kus / jednotku")
              : "Účtováno za jednotku (ks, sada, m, kg…)"}
          </div>
        </div>

        {/* Název */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Název</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave() }}
            placeholder={typ === "sluzba" ? "např. Programování, Grafika, Střih…" : "např. Tisk A3, Plakát, Folie…"}
            style={inp}
            autoFocus
          />
        </div>

        {/* ── Služba ── */}
        {typ === "sluzba" && (
          <>
            {/* Přepínač hodinová / kusová */}
            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>Způsob účtování</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["hodina", "kus"] as const).map(r => (
                  <button key={r} onClick={() => setSluzbaRezim(r)} style={{
                    flex: 1, padding: "8px 10px", borderRadius: 9, cursor: "pointer", fontSize: 13,
                    border: "1.5px solid",
                    borderColor: sluzbaRezim === r ? "#6366f1" : "#e5e7eb",
                    background: sluzbaRezim === r ? "#eef2ff" : "white",
                    color: sluzbaRezim === r ? "#4338ca" : "#6b7280",
                    fontWeight: sluzbaRezim === r ? 700 : 400,
                  }}>
                    {r === "hodina" ? "⏱ Hodinová sazba" : "📦 Kusová cena"}
                  </button>
                ))}
              </div>
            </div>

            {sluzbaRezim === "hodina" ? (
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Hodinová sazba bez DPH</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ position: "relative", width: 140 }}>
                    <input value={prodej} onChange={e => setProdej(e.target.value)} placeholder="0" inputMode="decimal" style={{ ...inp, paddingRight: 36 }} />
                    <span style={suffix}>Kč</span>
                  </div>
                  <DphHint bezDph={prodejNum} suffix="/hod" />
                </div>
              </div>
            ) : (
              <>
                {/* Jednotka */}
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Jednotka</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {JEDNOTKY.map(j => (
                      <button key={j} onClick={() => setJednotka(j)} style={{
                        padding: "7px 16px", borderRadius: 9, cursor: "pointer", fontSize: 13.5,
                        border: "1.5px solid",
                        borderColor: jednotka === j ? "#6366f1" : "#e5e7eb",
                        background: jednotka === j ? "#eef2ff" : "white",
                        color: jednotka === j ? "#4338ca" : "#374151",
                        fontWeight: jednotka === j ? 700 : 400,
                      }}>
                        {j}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Prodejní cena */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Prodejní cena bez DPH / {jednotka}</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ position: "relative", width: 140 }}>
                      <input value={prodej} onChange={e => setProdej(e.target.value)} placeholder="0" inputMode="decimal" style={{ ...inp, paddingRight: 36 }} />
                      <span style={suffix}>Kč</span>
                    </div>
                    <DphHint bezDph={prodejNum} />
                  </div>
                </div>
                {/* Nákupní cena */}
                <div style={{ marginBottom: 20 }}>
                  <label style={lbl}>
                    Nákupní cena bez DPH / {jednotka}
                    <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(volitelné)</span>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ position: "relative", width: 140 }}>
                      <input value={nakup} onChange={e => setNakup(e.target.value)} placeholder="0" inputMode="decimal" style={{ ...inp, paddingRight: 36 }} />
                      <span style={suffix}>Kč</span>
                    </div>
                    {prodejNum > 0 && nakupNum > 0 && (
                      <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                        Marže:{" "}
                        <strong style={{ color: marze >= 0 ? "#059669" : "#ef4444" }}>
                          {fKc(marze)}
                        </strong>
                        <span style={{ color: "#9ca3af" }}> ({Math.round((marze / prodejNum) * 100)} %)</span>
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Materiál — jednotka + ceny ── */}
        {typ === "material" && (
          <>
            {/* Jednotka */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Jednotka</label>
              <div style={{ display: "flex", gap: 8 }}>
                {JEDNOTKY.map(j => (
                  <button key={j} onClick={() => setJednotka(j)} style={{
                    padding: "7px 16px", borderRadius: 9, cursor: "pointer", fontSize: 13.5,
                    border: "1.5px solid",
                    borderColor: jednotka === j ? "#10b981" : "#e5e7eb",
                    background: jednotka === j ? "#f0fdf4" : "white",
                    color: jednotka === j ? "#166534" : "#374151",
                    fontWeight: jednotka === j ? 700 : 400,
                  }}>
                    {j}
                  </button>
                ))}
              </div>
            </div>

            {/* Prodejní cena */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Prodejní cena bez DPH / {jednotka}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ position: "relative", width: 140 }}>
                  <input value={prodej} onChange={e => setProdej(e.target.value)} placeholder="0" inputMode="decimal" style={{ ...inp, paddingRight: 36 }} />
                  <span style={suffix}>Kč</span>
                </div>
                <DphHint bezDph={prodejNum} />
              </div>
            </div>

            {/* Nákupní cena */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>
                Nákupní cena bez DPH / {jednotka}
                <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(volitelné)</span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ position: "relative", width: 140 }}>
                  <input value={nakup} onChange={e => setNakup(e.target.value)} placeholder="0" inputMode="decimal" style={{ ...inp, paddingRight: 36 }} />
                  <span style={suffix}>Kč</span>
                </div>
                {prodejNum > 0 && nakupNum > 0 && (
                  <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                    Marže:{" "}
                    <strong style={{ color: marze >= 0 ? "#059669" : "#ef4444" }}>
                      {fKc(marze)}
                    </strong>
                    {prodejNum > 0 && (
                      <span style={{ color: "#9ca3af" }}>
                        {" "}({Math.round((marze / prodejNum) * 100)} %)
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Dodavatel + Kód produktu */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>
                  Dodavatel
                  <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(vol.)</span>
                </label>
                <input
                  value={dodavatel}
                  onChange={e => setDodavatel(e.target.value)}
                  placeholder="např. Alza, Mall…"
                  style={inp}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>
                  Kód produktu
                  <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(vol.)</span>
                </label>
                <input
                  value={kodProd}
                  onChange={e => setKodProd(e.target.value)}
                  placeholder="SKU, EAN…"
                  style={inp}
                />
              </div>
            </div>

            {/* Odkaz */}
            <div style={{ marginBottom: 6 }}>
              <label style={lbl}>
                Odkaz
                <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(vol.)</span>
              </label>
              <input
                value={odkaz}
                onChange={e => setOdkaz(e.target.value)}
                placeholder="https://…"
                style={inp}
                type="url"
                inputMode="url"
              />
            </div>
          </>
        )}

        {err && <div style={{ marginBottom: 10, fontSize: 12, color: "#ef4444" }}>{err}</div>}

        {/* Tlačítka */}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px", borderRadius: 10,
            border: "1.5px solid #e5e7eb", background: "white",
            color: "#374151", fontSize: 14, fontWeight: 500, cursor: "pointer",
          }}>
            Zrušit
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 2, padding: "10px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))",
            color: "white", fontSize: 14, fontWeight: 600, opacity: saving ? .6 : 1,
          }}>
            {saving ? "Ukládám…" : isEdit ? "Uložit změny" : "Přidat do ceníku"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared input styles ────────────────────────────────────────────────────────
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }
const inp: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 9,
  border: "1.5px solid #e5e7eb", fontSize: 14, color: "var(--ink)", outline: "none",
}
const suffix: React.CSSProperties = {
  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
  fontSize: 12, color: "#9ca3af", pointerEvents: "none",
}

// ── PolozkaRadek ───────────────────────────────────────────────────────────────
function PolozkaRadek({ p, onEdit, onDelete }: {
  p: Polozka
  onEdit: (p: Polozka) => void
  onDelete: (id: number) => void
}) {
  const cenaSdph = p.sazba * DPH
  const marze    = p.nakupni_cena != null ? p.sazba - p.nakupni_cena : null
  const marzePct = marze != null && p.sazba > 0 ? Math.round((marze / p.sazba) * 100) : null
  const typEff   = p.typ ?? "sluzba"

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 18px", background: "white",
      borderRadius: 12, boxShadow: "var(--shadow-1)", border: "1px solid var(--line)",
    }}>
      {/* S / M čtvereček */}
      <div style={{
        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
        background: barvaTypu(typEff as "sluzba" | "material"),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800, color: "white", letterSpacing: ".02em",
      }}>
        {typEff === "sluzba" ? "S" : "M"}
      </div>

      {/* Obsah */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{p.name}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, letterSpacing: ".04em", textTransform: "uppercase",
            background: typEff === "sluzba" ? "#eef2ff" : "#f0fdf4",
            color: typEff === "sluzba" ? "#4338ca" : "#166534",
          }}>
            {typEff === "sluzba" ? "Služba" : "Materiál"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          {typEff === "sluzba" ? (
            p.sazba_typ === "kus" ? (
              <>
                <Cell label="jednotka" value={p.jednotka ?? "—"} />
                <Cell label="prodej bez DPH" value={fKc(p.sazba)} />
                <Cell label="prodej s DPH" value={fKc(cenaSdph)} accent />
                {p.nakupni_cena != null && (
                  <>
                    <Cell label="nákup bez DPH" value={fKc(p.nakupni_cena)} />
                    <Cell
                      label="marže"
                      value={`${fKc(marze!)}${marzePct != null ? ` (${marzePct} %)` : ""}`}
                      accent={marze != null && marze >= 0}
                      warn={marze != null && marze < 0}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <Cell label="bez DPH" value={fKc(p.sazba) + "/hod"} />
                <Cell label="s DPH" value={fKc(cenaSdph) + "/hod"} accent />
              </>
            )
          ) : (
            <>
              <Cell label="jednotka" value={p.jednotka ?? "—"} />
              <Cell label="prodej bez DPH" value={fKc(p.sazba)} />
              <Cell label="prodej s DPH" value={fKc(cenaSdph)} accent />
              {p.nakupni_cena != null && (
                <>
                  <Cell label="nákup bez DPH" value={fKc(p.nakupni_cena)} />
                  <Cell
                    label="marže"
                    value={`${fKc(marze!)}${marzePct != null ? ` (${marzePct} %)` : ""}`}
                    accent={marze != null && marze >= 0}
                    warn={marze != null && marze < 0}
                  />
                </>
              )}
            </>
          )}
        </div>

        {/* Dodavatel / Kód / Odkaz */}
        {typEff === "material" && (p.dodavatel || p.kod_produktu || p.odkaz) && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 7 }}>
            {p.dodavatel && (
              <span style={{ fontSize: 11.5, color: "#6b7280" }}>
                <span style={{ color: "#9ca3af", marginRight: 3 }}>Dodavatel:</span>
                <strong style={{ color: "var(--ink-2)" }}>{p.dodavatel}</strong>
              </span>
            )}
            {p.kod_produktu && (
              <span style={{ fontSize: 11.5, color: "#6b7280" }}>
                <span style={{ color: "#9ca3af", marginRight: 3 }}>Kód:</span>
                <strong style={{ color: "var(--ink-2)", fontFamily: "monospace" }}>{p.kod_produktu}</strong>
              </span>
            )}
            {p.odkaz && (
              <a
                href={p.odkaz}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11.5, color: "#3b82f6", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}
              >
                🔗 Odkaz
              </a>
            )}
          </div>
        )}
      </div>

      {/* Akce */}
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        <Btn onClick={() => onEdit(p)} title="Upravit"><Ico d={IC.edit} size={14} /></Btn>
        <Btn onClick={() => onDelete(p.id)} title="Smazat"><Ico d={IC.trash} size={14} /></Btn>
      </div>
    </div>
  )
}

function Cell({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: warn ? "#ef4444" : accent ? "#059669" : "var(--ink-2)" }}>{value}</div>
    </div>
  )
}

function Btn({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "none", border: "none", cursor: "pointer", padding: "6px 7px",
      borderRadius: 7, color: "var(--muted)",
    }}>
      {children}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CenikPage() {
  const [polozky,   setPolozky]   = useState<Polozka[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem,  setEditItem]  = useState<Polozka | undefined>()

  useEffect(() => {
    supabase.from("george_kategorie").select("*").order("sort_order")
      .then(({ data }) => { setPolozky(data ?? []); setLoading(false) })
  }, [])

  function handleSaved(item: Polozka) {
    setPolozky(prev =>
      prev.find(p => p.id === item.id)
        ? prev.map(p => p.id === item.id ? item : p)
        : [...prev, item]
    )
    setShowModal(false)
    setEditItem(undefined)
  }

  async function handleDelete(id: number) {
    const db = createClient()
    await db.from("george_kategorie").delete().eq("id", id)
    setPolozky(prev => prev.filter(p => p.id !== id))
  }

  function openEdit(p: Polozka) {
    setEditItem(p)
    setShowModal(true)
  }

  const sluzby   = polozky.filter(p => (p.typ ?? "sluzba") === "sluzba")
  const materialy = polozky.filter(p => p.typ === "material")

  return (
    <AppShell module="studio">
      {showModal && (
        <Modal
          onClose={() => { setShowModal(false); setEditItem(undefined) }}
          onSaved={handleSaved}
          editItem={editItem}
          pocetPolozek={polozky.length}
        />
      )}

      <div style={{ padding: "28px", maxWidth: 700 }}>
        {/* Hlavička */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Ceník</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "5px 0 0" }}>
              Služby a materiál — pro fakturaci a sledování času
            </p>
          </div>
          <button onClick={() => setShowModal(true)} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "9px 18px",
            borderRadius: 10, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))",
            color: "white", fontSize: 13.5, fontWeight: 600,
            boxShadow: "0 2px 10px rgba(99,102,241,.3)",
          }}>
            <Ico d={IC.plus} size={14} /> Přidat
          </button>
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</div>
        ) : polozky.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>Ceník je prázdný</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Klikni na Přidat a vytvoř první položku</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {sluzby.length > 0 && (
              <section>
                <SecHeader count={sluzby.length}>Služby</SecHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sluzby.map(p => <PolozkaRadek key={p.id} p={p} onEdit={openEdit} onDelete={handleDelete} />)}
                </div>
              </section>
            )}
            {materialy.length > 0 && (
              <section>
                <SecHeader count={materialy.length}>Materiál</SecHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {materialy.map(p => <PolozkaRadek key={p.id} p={p} onEdit={openEdit} onDelete={handleDelete} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function SecHeader({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#9ca3af" }}>
        {children}
      </div>
      <div style={{ fontSize: 11, color: "#d1d5db", fontWeight: 600 }}>{count}</div>
      <div style={{ flex: 1, height: 1, background: "#f3f4f6" }} />
    </div>
  )
}
