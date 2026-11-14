"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import AppShell from "@/components/AppShell"

// ── Typy ──────────────────────────────────────────────────────────────────────
type Polozka = {
  id: number
  name: string
  barva: string
  typ: "sluzba" | "material" | null
  sazba: number            // prodejní cena (služba = /hod, materiál = /jednotku)
  sazba_typ: string        // "hodina" | "kus" — zachováno kvůli timeru
  jednotka: string | null
  nakupni_cena: number | null
  dodavatel: string | null
  kod_produktu: string | null
  odkaz: string | null
  sort_order: number
  skupina_id?: number | null // vlastní skupina v ceníku (číselník george_cenik_skupiny)
  rocni?: boolean           // roční služba — eviduje se ve Správě hostingu
}

// Pevné barvy podle typu — červená = služba, modrá = materiál
const BARVA_SLUZBA   = "#ef4444"
const BARVA_MATERIAL = "#3b82f6"
function barvaTypu(typ: "sluzba" | "material") {
  return typ === "sluzba" ? BARVA_SLUZBA : BARVA_MATERIAL
}

type Skupina = { id: number; nazev: string; sort_order: number }

const JEDNOTKY = ["ks", "sada", "m", "km", "kg", "rok"]

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
  copy:  ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
  search:["M11 19a8 8 0 100-16 8 8 0 000 16z", "M21 21l-4.3-4.3"],
  folder:["M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"],
  link:  ["M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1", "M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"],
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({
  onClose, onSaved, editItem, pocetPolozek, skupiny, vychoziSkupina, onSkupinaVytvorena,
}: {
  onClose: () => void
  onSaved: (p: Polozka) => void
  editItem?: Polozka
  pocetPolozek: number
  skupiny: Skupina[]
  vychoziSkupina?: number | null
  onSkupinaVytvorena: (s: Skupina) => void
}) {
  const isEdit = !!editItem?.id
  const [typ,         setTyp]         = useState<"sluzba" | "material">(editItem?.typ ?? "sluzba")
  const [sluzbaRezim, setSluzbaRezim] = useState<"hodina" | "kus">(editItem?.sazba_typ === "kus" ? "kus" : "hodina")
  const [name,     setName]     = useState(editItem?.name ?? "")
  const [skupinaId, setSkupinaId] = useState<string>(editItem?.skupina_id != null ? String(editItem.skupina_id) : vychoziSkupina ? String(vychoziSkupina) : "")
  const [novaSkupina, setNovaSkupina] = useState("")
  const [rocni,    setRocni]    = useState(!!editItem?.rocni)
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
    // Nová skupina se založí spolu s položkou
    let skupId: number | null = skupinaId && skupinaId !== "__new" ? Number(skupinaId) : null
    if (skupinaId === "__new") {
      const nazev = novaSkupina.trim()
      if (!nazev) { setSaving(false); setErr("Zadej název nové skupiny"); return }
      const existuje = skupiny.find(g => g.nazev.toLowerCase() === nazev.toLowerCase())
      if (existuje) skupId = existuje.id
      else {
        const { data: ns, error: nsErr } = await db.from("george_cenik_skupiny").insert({ nazev, sort_order: skupiny.length }).select().single()
        if (nsErr || !ns) { setSaving(false); setErr("Skupinu se nepodařilo vytvořit"); return }
        skupId = ns.id
        onSkupinaVytvorena(ns as Skupina)
      }
    }
    const jeRocni = typ === "sluzba" && rocni
    const kusMode = jeRocni || typ === "material" || (typ === "sluzba" && sluzbaRezim === "kus")
    const payload = {
      name:          name.trim(),
      barva,
      typ,
      sazba:         parseNum(prodej)!,
      sazba_typ:     jeRocni ? "kus" : typ === "sluzba" ? sluzbaRezim : "kus",
      jednotka:      jeRocni ? "rok" : kusMode ? jednotka : null,
      skupina_id:    skupId,
      rocni:         jeRocni,
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
        style={{ background: "white", borderRadius: 18, padding: 28, width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 12px 48px rgba(0,0,0,.2)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Hlavička */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>
            {isEdit ? "Upravit položku" : editItem ? "Duplikovat položku" : "Nová položka ceníku"}
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

        {/* Skupina v ceníku */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Skupina</label>
          <select value={skupinaId} onChange={e => setSkupinaId(e.target.value)} style={{ ...inp, background: "white" }}>
            <option value="">— bez skupiny —</option>
            {skupiny.map(g => <option key={g.id} value={g.id}>{g.nazev}</option>)}
            <option value="__new">＋ Nová skupina…</option>
          </select>
          {skupinaId === "__new" && (
            <input
              value={novaSkupina}
              onChange={e => setNovaSkupina(e.target.value)}
              placeholder="Název nové skupiny, např. Tiskové služby"
              style={{ ...inp, marginTop: 8 }}
              autoFocus
            />
          )}
        </div>

        {typ === "sluzba" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 13, color: "var(--ink-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={rocni} onChange={e => { setRocni(e.target.checked); if (e.target.checked) { setSluzbaRezim("kus"); setJednotka("rok") } }} />
            Hosting (doména, hosting, e-mail…) – roční služba, eviduje se ve Správě hostingu
          </label>
        )}

        {/* ── Služba ── */}
        {typ === "sluzba" && (
          <>
            {/* Přepínač hodinová / kusová */}
            {!rocni && <div style={{ marginBottom: 18 }}>
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
            </div>}

            {sluzbaRezim === "hodina" && !rocni ? (
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Hodinová sazba</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ position: "relative", width: 140 }}>
                    <input value={prodej} onChange={e => setProdej(e.target.value)} placeholder="0" inputMode="decimal" style={{ ...inp, paddingRight: 36 }} />
                    <span style={suffix}>Kč</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Jednotka */}
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Jednotka</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  <label style={lbl}>Prodejní cena / {jednotka}</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ position: "relative", width: 140 }}>
                      <input value={prodej} onChange={e => setProdej(e.target.value)} placeholder="0" inputMode="decimal" style={{ ...inp, paddingRight: 36 }} />
                      <span style={suffix}>Kč</span>
                    </div>
                  </div>
                </div>
                {/* Nákupní cena */}
                <div style={{ marginBottom: 20 }}>
                  <label style={lbl}>
                    Nákupní cena / {jednotka}
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
              <label style={lbl}>Prodejní cena / {jednotka}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ position: "relative", width: 140 }}>
                  <input value={prodej} onChange={e => setProdej(e.target.value)} placeholder="0" inputMode="decimal" style={{ ...inp, paddingRight: 36 }} />
                  <span style={suffix}>Kč</span>
                </div>
              </div>
            </div>

            {/* Nákupní cena */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>
                Nákupní cena / {jednotka}
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

// ── Správa skupin ─────────────────────────────────────────────────────────────
function SkupinyModal({ skupiny, pocty, onClose, onZmena }: {
  skupiny: Skupina[]
  pocty: Map<number, number>
  onClose: () => void
  onZmena: () => void
}) {
  const [nova, setNova] = useState("")
  const [err,  setErr]  = useState("")
  const [nazvy, setNazvy] = useState<Record<number, string>>(() => Object.fromEntries(skupiny.map(g => [g.id, g.nazev])))

  async function pridat() {
    const nazev = nova.trim()
    if (!nazev) return
    const { error } = await createClient().from("george_cenik_skupiny").insert({ nazev, sort_order: skupiny.length })
    if (error) { setErr(error.code === "23505" ? "Skupina s tímto názvem už existuje" : "Skupinu se nepodařilo vytvořit"); return }
    setErr(""); setNova(""); onZmena()
  }
  async function prejmenovat(g: Skupina) {
    const nazev = (nazvy[g.id] ?? "").trim()
    if (!nazev || nazev === g.nazev) { setNazvy(n => ({ ...n, [g.id]: g.nazev })); return }
    const { error } = await createClient().from("george_cenik_skupiny").update({ nazev }).eq("id", g.id)
    if (error) { setErr(error.code === "23505" ? "Skupina s tímto názvem už existuje" : "Přejmenování se nepovedlo"); setNazvy(n => ({ ...n, [g.id]: g.nazev })); return }
    setErr(""); onZmena()
  }
  async function smazat(g: Skupina) {
    const n = pocty.get(g.id) ?? 0
    if (!window.confirm(`Smazat skupinu „${g.nazev}“?${n ? `\n\n${n} položek zůstane v ceníku, jen budou bez skupiny.` : ""}`)) return
    const { error } = await createClient().from("george_cenik_skupiny").delete().eq("id", g.id)
    if (error) { setErr("Smazání se nepovedlo"); return }
    onZmena()
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 18, padding: 26, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 48px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>Skupiny ceníku</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}><Ico d={IC.x} size={18} /></button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input value={nova} onChange={e => setNova(e.target.value)} onKeyDown={e => { if (e.key === "Enter") pridat() }}
            placeholder="Nová skupina, např. Tiskové služby" style={inp} autoFocus />
          <button onClick={pridat} style={{ padding: "0 16px", borderRadius: 9, border: "none", cursor: "pointer", color: "white", fontWeight: 600, fontSize: 13.5, background: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))" }}>Přidat</button>
        </div>
        {err && <div style={{ fontSize: 12.5, color: "#ef4444", marginBottom: 10 }}>{err}</div>}

        {skupiny.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", padding: "10px 0" }}>Zatím žádné skupiny.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {skupiny.map(g => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input value={nazvy[g.id] ?? g.nazev}
                  onChange={e => setNazvy(n => ({ ...n, [g.id]: e.target.value }))}
                  onBlur={() => prejmenovat(g)}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                  style={{ ...inp, padding: "7px 10px" }} />
                <span style={{ fontSize: 12, color: "var(--muted)", width: 62, textAlign: "right", flexShrink: 0 }}>{pocty.get(g.id) ?? 0} pol.</span>
                <Btn onClick={() => smazat(g)} title="Smazat skupinu"><Ico d={IC.trash} size={14} /></Btn>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: "#9ca3af", marginTop: 14 }}>Název upravíš přepsáním. Smazáním skupiny se položky nemažou.</div>
      </div>
    </div>
  )
}

// ── Řádek položky (tabulkový) ─────────────────────────────────────────────────
const GRID = "minmax(240px, 1fr) 110px 120px 110px 150px 80px 104px"

function typInfo(p: Polozka) {
  if (p.rocni)              return { label: "Hosting",  bg: "#fef3c7", fg: "#92400e" }
  if (p.typ === "material") return { label: "Materiál", bg: "#dbeafe", fg: "#1d4ed8" }
  return                           { label: "Služba",   bg: "#fee2e2", fg: "#b91c1c" }
}

function PolozkaRadek({ p, pouzito, onEdit, onDelete, onDuplicate }: {
  p: Polozka
  pouzito: number
  onEdit: (p: Polozka) => void
  onDelete: (p: Polozka) => void
  onDuplicate: (p: Polozka) => void
}) {
  const hodinova = (p.typ ?? "sluzba") === "sluzba" && p.sazba_typ !== "kus"
  const marze    = p.nakupni_cena != null ? p.sazba - p.nakupni_cena : null
  const marzePct = marze != null && p.sazba > 0 ? Math.round((marze / p.sazba) * 100) : null
  const t = typInfo(p)
  const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13.5 }

  return (
    <div className="cenik-radek" style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 12, padding: "10px 18px", borderTop: "1px solid #f3f4f6" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>{p.name}</span>
          {p.odkaz && (
            <a href={p.odkaz} target="_blank" rel="noopener noreferrer" title="Otevřít odkaz" style={{ color: "#3b82f6", display: "flex", flexShrink: 0 }}>
              <Ico d={IC.link} size={13} />
            </a>
          )}
        </div>
        {(p.dodavatel || p.kod_produktu) && (
          <div style={{ fontSize: 11.5, color: "#9ca3af", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[p.dodavatel, p.kod_produktu].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <div>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: t.bg, color: t.fg, letterSpacing: ".03em" }}>{t.label}</span>
      </div>
      <div style={{ ...num, fontWeight: 700, color: "var(--ink)" }}>
        {fKc(p.sazba)}<span style={{ fontWeight: 400, color: "#9ca3af", fontSize: 12 }}> /{hodinova ? "hod" : (p.jednotka ?? "ks")}</span>
      </div>
      <div style={{ ...num, color: "var(--ink-2)" }}>{p.nakupni_cena != null ? fKc(p.nakupni_cena) : <span style={{ color: "#d1d5db" }}>—</span>}</div>
      <div style={{ ...num, fontWeight: 600, color: marze == null ? "#d1d5db" : marze >= 0 ? "#059669" : "#ef4444" }}>
        {marze == null ? "—" : <>{fKc(marze)}{marzePct != null && <span style={{ fontWeight: 400, fontSize: 12 }}> · {marzePct} %</span>}</>}
      </div>
      <div style={{ textAlign: "right", fontSize: 12.5, color: pouzito ? "var(--ink-2)" : "#d1d5db" }} title="Kolikrát je položka použitá v záznamech a hostingu">
        {pouzito ? `${pouzito}×` : "—"}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn onClick={() => onEdit(p)} title="Upravit"><Ico d={IC.edit} size={14} /></Btn>
        <Btn onClick={() => onDuplicate(p)} title="Duplikovat"><Ico d={IC.copy} size={14} /></Btn>
        <Btn onClick={() => onDelete(p)} title="Smazat"><Ico d={IC.trash} size={14} /></Btn>
      </div>
    </div>
  )
}

function Btn({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="cenik-btn" style={{
      background: "none", border: "none", cursor: "pointer", padding: "6px 7px",
      borderRadius: 7, color: "var(--muted)", display: "flex",
    }}>
      {children}
    </button>
  )
}

function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap",
      border: "1.5px solid", borderColor: active ? "var(--ink)" : "#e5e7eb",
      background: active ? "var(--ink)" : "white", color: active ? "white" : "var(--ink-2)",
      fontWeight: active ? 600 : 500, display: "flex", alignItems: "center", gap: 6,
    }}>
      {children}
      {count != null && <span style={{ fontSize: 11.5, opacity: .65 }}>{count}</span>}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
type TypFiltr = "vse" | "sluzba" | "material" | "rocni"

export default function CenikPage() {
  const [polozky,   setPolozky]   = useState<Polozka[]>([])
  const [skupiny,   setSkupiny]   = useState<Skupina[]>([])
  const [pouziti,   setPouziti]   = useState<Map<number, number>>(new Map())
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem,  setEditItem]  = useState<Polozka | undefined>()
  const [vychoziSk, setVychoziSk] = useState<number | null>(null)
  const [skModal,   setSkModal]   = useState(false)
  const [fSkupina,  setFSkupina]  = useState<number | "vse" | "bez">("vse")
  const [fTyp,      setFTyp]      = useState<TypFiltr>("vse")
  const [hledat,    setHledat]    = useState("")
  const [sbalene,   setSbalene]   = useState<Set<string>>(new Set())

  const nacti = useCallback(async () => {
    const db = createClient()
    const [k, s, z, h] = await Promise.all([
      db.from("george_kategorie").select("*").order("sort_order"),
      db.from("george_cenik_skupiny").select("*").order("sort_order").order("nazev"),
      db.from("george_zaznamy").select("kategorie_id").not("kategorie_id", "is", null),
      db.from("george_hosting").select("kategorie_id"),
    ])
    const m = new Map<number, number>()
    for (const r of [...(z.data ?? []), ...(h.data ?? [])]) m.set(r.kategorie_id, (m.get(r.kategorie_id) ?? 0) + 1)
    setPolozky((k.data ?? []) as Polozka[])
    setSkupiny((s.data ?? []) as Skupina[])
    setPouziti(m)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { nacti() }, [nacti])

  function handleSaved(item: Polozka) {
    setPolozky(prev => prev.find(p => p.id === item.id) ? prev.map(p => p.id === item.id ? item : p) : [...prev, item])
    setShowModal(false); setEditItem(undefined); setVychoziSk(null)
  }

  async function handleDelete(p: Polozka) {
    const db = createClient()
    const [{ count: zc }, { count: hc }] = await Promise.all([
      db.from("george_zaznamy").select("id", { count: "exact", head: true }).eq("kategorie_id", p.id),
      db.from("george_hosting").select("id", { count: "exact", head: true }).eq("kategorie_id", p.id),
    ])
    if ((hc ?? 0) > 0) {
      alert(`Položku „${p.name}“ používá ${hc} služeb ve Správě hostingu, proto ji nejde smazat. Nejdřív tam služby odeber nebo jim změň položku.`)
      return
    }
    const msg = (zc ?? 0) > 0
      ? `Položku „${p.name}“ používá ${zc} zadaných záznamů v přehledu. Záznamy zůstanou i se svou cenou, ale ztratí vazbu na ceník (název kategorie a jednotku). Opravdu smazat?`
      : `Smazat položku „${p.name}“ z ceníku?`
    if (!window.confirm(msg)) return
    const { error } = await db.from("george_kategorie").delete().eq("id", p.id)
    if (error) { alert("Smazání se nepovedlo: " + error.message); return }
    setPolozky(prev => prev.filter(x => x.id !== p.id))
  }

  function openEdit(p: Polozka) { setEditItem(p); setShowModal(true) }
  // Duplikace = nová položka předvyplněná podle vzoru (id 0 → modal ji uloží jako novou)
  function openDuplicate(p: Polozka) { setEditItem({ ...p, id: 0, name: p.name + " (kopie)" }); setShowModal(true) }
  function openNova(skupinaId?: number | null) { setEditItem(undefined); setVychoziSk(skupinaId ?? null); setShowModal(true) }

  const poctySkupin = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of polozky) if (p.skupina_id != null) m.set(p.skupina_id, (m.get(p.skupina_id) ?? 0) + 1)
    return m
  }, [polozky])
  const pocetBez = polozky.filter(p => p.skupina_id == null).length

  const jeTyp = (p: Polozka, t: TypFiltr) =>
    t === "vse" ? true : t === "rocni" ? !!p.rocni : t === "material" ? p.typ === "material" : (p.typ ?? "sluzba") === "sluzba" && !p.rocni

  const viditelne = useMemo(() => {
    const q = hledat.trim().toLowerCase()
    return polozky.filter(p => {
      if (fSkupina === "bez" && p.skupina_id != null) return false
      if (typeof fSkupina === "number" && p.skupina_id !== fSkupina) return false
      if (!jeTyp(p, fTyp)) return false
      if (q && ![p.name, p.dodavatel, p.kod_produktu].some(v => v?.toLowerCase().includes(q))) return false
      return true
    })
  }, [polozky, fSkupina, fTyp, hledat])

  // Sekce: skupiny v pořadí číselníku, na konci položky bez skupiny
  const sekce = useMemo(() => {
    const out: { key: string; id: number | null; nazev: string; polozky: Polozka[] }[] = []
    for (const g of skupiny) {
      const rows = viditelne.filter(p => p.skupina_id === g.id)
      const filtrovano = hledat.trim() || fTyp !== "vse"
      if (rows.length || (!filtrovano && (fSkupina === "vse" || fSkupina === g.id))) out.push({ key: "g" + g.id, id: g.id, nazev: g.nazev, polozky: rows })
    }
    const bez = viditelne.filter(p => p.skupina_id == null || !skupiny.some(g => g.id === p.skupina_id))
    if (bez.length) out.push({ key: "bez", id: null, nazev: "Bez skupiny", polozky: bez })
    return out
  }, [skupiny, viditelne, hledat, fTyp, fSkupina])

  const prepniSbaleni = (key: string) => setSbalene(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })

  const th: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }

  return (
    <AppShell module="studio">
      <style>{`.cenik-radek:hover{background:#fafafa}.cenik-btn:hover{background:#f3f4f6;color:var(--ink)}`}</style>

      {showModal && (
        <Modal
          onClose={() => { setShowModal(false); setEditItem(undefined); setVychoziSk(null) }}
          onSaved={handleSaved}
          editItem={editItem}
          pocetPolozek={polozky.length}
          skupiny={skupiny}
          vychoziSkupina={vychoziSk}
          onSkupinaVytvorena={g => setSkupiny(prev => [...prev, g])}
        />
      )}
      {skModal && <SkupinyModal skupiny={skupiny} pocty={poctySkupin} onClose={() => setSkModal(false)} onZmena={nacti} />}

      <div style={{ padding: 28 }}>
        {/* Hlavička */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Ceník</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "5px 0 0" }}>
              {polozky.length} položek · {skupiny.length} skupin
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setSkModal(true)} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, cursor: "pointer",
              border: "1.5px solid #e5e7eb", background: "white", color: "var(--ink-2)", fontSize: 13.5, fontWeight: 600,
            }}>
              <Ico d={IC.folder} size={14} /> Skupiny
            </button>
            <button onClick={() => openNova(typeof fSkupina === "number" ? fSkupina : null)} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))",
              color: "white", fontSize: 13.5, fontWeight: 600, boxShadow: "0 2px 10px rgba(99,102,241,.3)",
            }}>
              <Ico d={IC.plus} size={14} /> Přidat položku
            </button>
          </div>
        </div>

        {/* Filtry */}
        <div style={{ background: "white", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px", marginBottom: 20, boxShadow: "var(--shadow-1)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", display: "flex" }}><Ico d={IC.search} size={15} /></span>
              <input value={hledat} onChange={e => setHledat(e.target.value)} placeholder="Hledat v ceníku…" style={{ ...inp, paddingLeft: 34 }} />
            </div>
            <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 10, padding: 3 }}>
              {([["vse", "Vše"], ["sluzba", "Služby"], ["material", "Materiál"], ["rocni", "Hosting"]] as [TypFiltr, string][]).map(([v, l]) => (
                <button key={v} onClick={() => setFTyp(v)} style={{
                  padding: "6px 13px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
                  background: fTyp === v ? "white" : "transparent", color: fTyp === v ? "var(--ink)" : "#6b7280",
                  fontWeight: fTyp === v ? 600 : 500, boxShadow: fTyp === v ? "0 1px 3px rgba(0,0,0,.1)" : "none",
                }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Chip active={fSkupina === "vse"} onClick={() => setFSkupina("vse")} count={polozky.length}>Všechny skupiny</Chip>
            {skupiny.map(g => (
              <Chip key={g.id} active={fSkupina === g.id} onClick={() => setFSkupina(g.id)} count={poctySkupin.get(g.id) ?? 0}>{g.nazev}</Chip>
            ))}
            {pocetBez > 0 && skupiny.length > 0 && <Chip active={fSkupina === "bez"} onClick={() => setFSkupina("bez")} count={pocetBez}>Bez skupiny</Chip>}
          </div>
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</div>
        ) : polozky.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>Ceník je prázdný</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Klikni na Přidat položku a vytvoř první</div>
          </div>
        ) : sekce.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", fontSize: 14, color: "var(--muted)" }}>Filtru nic neodpovídá.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {sekce.map(sk => {
              const zavreno = sbalene.has(sk.key)
              return (
                <section key={sk.key} style={{ background: "white", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "var(--shadow-1)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: "#fafafa" }}>
                    <button onClick={() => prepniSbaleni(sk.key)} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, flex: 1, textAlign: "left" }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", width: 10, display: "inline-block", transform: zavreno ? "rotate(-90deg)" : "none", transition: "transform .15s" }}>▼</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: sk.id == null ? "var(--muted)" : "var(--ink)" }}>{sk.nazev}</span>
                      <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>{sk.polozky.length}</span>
                    </button>
                    {sk.id != null && (
                      <button onClick={() => openNova(sk.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>
                        <Ico d={IC.plus} size={12} /> Položka
                      </button>
                    )}
                  </div>
                  {!zavreno && (
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ minWidth: 960 }}>
                        <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "8px 18px", borderTop: "1px solid #f3f4f6" }}>
                          <div style={th}>Název</div>
                          <div style={th}>Typ</div>
                          <div style={{ ...th, textAlign: "right" }}>Prodej</div>
                          <div style={{ ...th, textAlign: "right" }}>Nákup</div>
                          <div style={{ ...th, textAlign: "right" }}>Marže</div>
                          <div style={{ ...th, textAlign: "right" }}>Použito</div>
                          <div />
                        </div>
                        {sk.polozky.length === 0 ? (
                          <div style={{ padding: "14px 18px", borderTop: "1px solid #f3f4f6", fontSize: 13, color: "#9ca3af" }}>Ve skupině zatím nic není.</div>
                        ) : sk.polozky.map(p => (
                          <PolozkaRadek key={p.id} p={p} pouzito={pouziti.get(p.id) ?? 0} onEdit={openEdit} onDelete={handleDelete} onDuplicate={openDuplicate} />
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
