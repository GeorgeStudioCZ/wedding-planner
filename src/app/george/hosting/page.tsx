"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import AppShell from "@/components/AppShell"
import { createClient } from "@/lib/supabase-browser"

// ── Typy ──────────────────────────────────────────────────────────────────────
type Zakaznik = { id: number; jmeno: string; prijmeni: string; firma: string | null; projekty?: string[] | null }
type Kat      = { id: number; name: string; sazba: number; sort_order: number }
type Sluzba = {
  id: number
  zakaznik_id: number
  kategorie_id: number
  web: string
  kvota_gb: number | null
  cena_rok: number
  stav: "ok" | "pozastaveno" | "zruseno"
  poznamka: string | null
}
type Fakt = { id: number; hosting_id: number; rok: number; cena: number; sf_faktura_id: number | null; sf_faktura_no: string | null }

const STAVY: { v: Sluzba["stav"]; label: string; bg: string; fg: string }[] = [
  { v: "ok",          label: "OK",          bg: "#dcfce7", fg: "#166534" },
  { v: "pozastaveno", label: "Pozastaveno", bg: "#fef9c3", fg: "#854d0e" },
  { v: "zruseno",     label: "Zrušeno",     bg: "#f3f4f6", fg: "#6b7280" },
]

function zakLabel(z: Zakaznik) { return z.firma?.trim() || `${z.jmeno} ${z.prijmeni}`.trim() || `#${z.id}` }
function fKc(n: number) { return Math.round(n).toLocaleString("cs-CZ") + " Kč" }
function parseNum(s: string) { const v = parseFloat(s.replace(",", ".")); return isNaN(v) || v < 0 ? null : v }

const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 9, boxSizing: "border-box",
  border: "1.5px solid #e5e7eb", fontSize: 14, color: "var(--ink)", outline: "none", background: "white",
}

// ── Modal: přidat / upravit službu ────────────────────────────────────────────
function SluzbaModal({ edit, zakaznici, kategorie, predvolenyZakaznik, onClose, onSaved }: {
  edit?: Sluzba
  zakaznici: Zakaznik[]
  kategorie: Kat[]
  predvolenyZakaznik: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [zakId,  setZakId]  = useState<string>(edit ? String(edit.zakaznik_id) : predvolenyZakaznik ? String(predvolenyZakaznik) : "")
  const [katId,  setKatId]  = useState<string>(edit ? String(edit.kategorie_id) : "")
  const [web,    setWeb]    = useState(edit?.web ?? "")
  const [kvota,  setKvota]  = useState(edit?.kvota_gb != null ? String(edit.kvota_gb) : "")
  const [cena,   setCena]   = useState(edit ? String(edit.cena_rok) : "")
  const [stav,   setStav]   = useState<Sluzba["stav"]>(edit?.stav ?? "ok")
  const [pozn,   setPozn]   = useState(edit?.poznamka ?? "")
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState("")

  function zmenaKategorie(id: string) {
    setKatId(id)
    // Cena z ceníku se předvyplní jen při zakládání — dá se přepsat
    if (!edit) {
      const k = kategorie.find(x => String(x.id) === id)
      if (k) setCena(String(k.sazba))
    }
  }

  async function ulozit() {
    if (!zakId) { setErr("Vyber zákazníka"); return }
    if (!katId) { setErr("Vyber službu z ceníku"); return }
    const cenaNum = parseNum(cena)
    if (cenaNum === null) { setErr("Zadej platnou cenu za rok"); return }
    const kvotaNum = kvota.trim() ? parseNum(kvota) : null
    if (kvota.trim() && kvotaNum === null) { setErr("Kvóta musí být číslo"); return }
    setErr(""); setSaving(true)
    const payload = {
      zakaznik_id: Number(zakId), kategorie_id: Number(katId), web: web.trim(),
      kvota_gb: kvotaNum, cena_rok: cenaNum, stav, poznamka: pozn.trim() || null,
    }
    const db = createClient()
    const { error } = edit
      ? await db.from("george_hosting").update(payload).eq("id", edit.id)
      : await db.from("george_hosting").insert(payload)
    setSaving(false)
    if (error) { setErr("Chyba při ukládání: " + error.message); return }
    onSaved()
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 18, padding: 26, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 12px 48px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 20 }}>{edit ? "Upravit službu" : "Přidat službu"}</div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Zákazník</label>
          <select value={zakId} onChange={e => setZakId(e.target.value)} style={inp}>
            <option value="">— vyber —</option>
            {zakaznici.map(z => <option key={z.id} value={z.id}>{zakLabel(z)}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Služba z ceníku</label>
          <select value={katId} onChange={e => zmenaKategorie(e.target.value)} style={inp}>
            <option value="">— vyber —</option>
            {kategorie.map(k => <option key={k.id} value={k.id}>{k.name} ({fKc(k.sazba)})</option>)}
          </select>
          {kategorie.length === 0 && (
            <div style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>
              V ceníku zatím není žádná roční služba. V Ceníku přidej položku a zaškrtni „Roční služba“.
            </div>
          )}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Web / doména / e-mail</label>
          <input value={web} onChange={e => setWeb(e.target.value)} placeholder="např. www.spravcak.eu nebo info@firma.cz" style={inp} />
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Cena za rok (Kč)</label>
            <input value={cena} onChange={e => setCena(e.target.value)} inputMode="decimal" placeholder="0" style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Kvóta (GB)</label>
            <input value={kvota} onChange={e => setKvota(e.target.value)} inputMode="decimal" placeholder="volitelné" style={inp} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Stav</label>
          <div style={{ display: "flex", gap: 8 }}>
            {STAVY.map(s => (
              <button key={s.v} onClick={() => setStav(s.v)} style={{
                flex: 1, padding: "8px 6px", borderRadius: 9, cursor: "pointer", fontSize: 13,
                border: "1.5px solid", borderColor: stav === s.v ? "#6366f1" : "#e5e7eb",
                background: stav === s.v ? "#eef2ff" : "white", color: stav === s.v ? "#4338ca" : "#6b7280",
                fontWeight: stav === s.v ? 700 : 400,
              }}>{s.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>Fakturují se jen služby ve stavu OK.</div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={lbl}>Poznámka</label>
          <input value={pozn} onChange={e => setPozn(e.target.value)} placeholder="volitelné" style={inp} />
        </div>

        {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 13.5 }}>Zrušit</button>
          <button onClick={ulozit} disabled={saving} style={{
            padding: "9px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "white",
            background: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))", opacity: saving ? .6 : 1,
          }}>{saving ? "Ukládám…" : "Uložit"}</button>
        </div>
      </div>
    </div>
  )
}

// ── Stránka ───────────────────────────────────────────────────────────────────
export default function HostingPage() {
  const [zakaznici, setZakaznici] = useState<Zakaznik[]>([])
  const [kategorie, setKategorie] = useState<Kat[]>([])
  const [sluzby,    setSluzby]    = useState<Sluzba[]>([])
  const [fakt,      setFakt]      = useState<Fakt[]>([])
  const [loading,   setLoading]   = useState(true)
  const [rok,       setRok]       = useState(new Date().getFullYear())
  const [hledat,    setHledat]    = useState("")
  const [modal,     setModal]     = useState<{ edit?: Sluzba; zakaznik?: number } | null>(null)
  const [busy,      setBusy]      = useState<number | null>(null)
  const [zprava,    setZprava]    = useState<{ ok: boolean; text: string } | null>(null)

  const nacti = useCallback(async () => {
    const db = createClient()
    const [z, k, s, f] = await Promise.all([
      db.from("zakaznici").select("id, jmeno, prijmeni, firma, projekty").order("prijmeni"),
      db.from("george_kategorie").select("id, name, sazba, sort_order").eq("rocni", true).order("sort_order"),
      db.from("george_hosting").select("*").order("web").order("id"),
      db.from("george_hosting_fakturace").select("*"),
    ])
    setZakaznici(z.data ?? [])
    setKategorie(k.data ?? [])
    setSluzby((s.data ?? []) as Sluzba[])
    setFakt((f.data ?? []) as Fakt[])
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { nacti() }, [nacti])

  const katMap  = useMemo(() => new Map(kategorie.map(k => [k.id, k])), [kategorie])
  const zakMap  = useMemo(() => new Map(zakaznici.map(z => [z.id, z])), [zakaznici])
  const faktMap = useMemo(() => {
    const m = new Map<number, Fakt>()
    for (const f of fakt) if (f.rok === rok) m.set(f.hosting_id, f)
    return m
  }, [fakt, rok])

  // Kategorie může být i neroční (zůstala z dřívějška) — název dohledáme zvlášť
  const [nazvyKat, setNazvyKat] = useState<Map<number, string>>(new Map())
  useEffect(() => {
    const chybi = [...new Set(sluzby.map(s => s.kategorie_id))].filter(id => !katMap.has(id))
    if (!chybi.length) return
    createClient().from("george_kategorie").select("id, name").in("id", chybi)
      .then(({ data }) => setNazvyKat(new Map((data ?? []).map(k => [k.id, k.name]))))
  }, [sluzby, katMap])
  const nazevSluzby = (id: number) => katMap.get(id)?.name ?? nazvyKat.get(id) ?? "—"

  // Seskupení podle zákazníka
  const skupiny = useMemo(() => {
    const q = hledat.trim().toLowerCase()
    const byZak = new Map<number, Sluzba[]>()
    for (const s of sluzby) {
      const arr = byZak.get(s.zakaznik_id) ?? []
      arr.push(s); byZak.set(s.zakaznik_id, arr)
    }
    return [...byZak.entries()]
      .map(([zid, rows]) => ({ zid, zak: zakMap.get(zid), rows }))
      .filter(g => g.zak)
      .filter(g => {
        if (!q) return true
        return zakLabel(g.zak!).toLowerCase().includes(q) || g.rows.some(r => r.web.toLowerCase().includes(q))
      })
      .sort((a, b) => zakLabel(a.zak!).localeCompare(zakLabel(b.zak!), "cs"))
  }, [sluzby, zakMap, hledat])

  const aktivni      = sluzby.filter(s => s.stav === "ok")
  const rocniTrzba   = aktivni.reduce((a, s) => a + Number(s.cena_rok), 0)
  const kFakturaci   = aktivni.filter(s => !faktMap.has(s.id))
  const kFakturaciKc = kFakturaci.reduce((a, s) => a + Number(s.cena_rok), 0)
  const pocetZak     = new Set(sluzby.map(s => s.zakaznik_id)).size

  async function vyfakturovat(zid: number) {
    const zak = zakMap.get(zid)
    const radky = aktivni.filter(s => s.zakaznik_id === zid && !faktMap.has(s.id) && Number(s.cena_rok) > 0)
    if (!zak || !radky.length) return
    const suma = radky.reduce((a, s) => a + Number(s.cena_rok), 0)
    if (!window.confirm(`Vystavit fakturu pro ${zakLabel(zak)} za rok ${rok}?\n\n${radky.length} služeb, celkem ${fKc(suma)}.`)) return
    setBusy(zid); setZprava(null)
    try {
      const res = await fetch("/api/george/hosting-fakturace", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zakaznikId: zid, rok }),
      })
      const j = await res.json()
      if (!j.ok) setZprava({ ok: false, text: j.error ?? "Fakturu se nepodařilo vystavit" })
      else {
        setZprava({ ok: true, text: `Faktura ${j.invoice_no} vystavena (${fKc(j.celkem)}).` })
        if (j.pdf_url) window.open(j.pdf_url, "_blank")
        await nacti()
      }
    } catch (e) {
      setZprava({ ok: false, text: e instanceof Error ? e.message : "Chyba spojení" })
    }
    setBusy(null)
  }

  async function zrusitFakturu(f: Fakt) {
    if (!f.sf_faktura_id) return
    if (!window.confirm(`Zrušit fakturu ${f.sf_faktura_no}?\n\nFaktura se smaže v SuperFaktuře a všechny její služby se vrátí mezi nevyfakturované.`)) return
    setBusy(-f.hosting_id); setZprava(null)
    const res = await fetch("/api/george/hosting-fakturace/zrus", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sfId: f.sf_faktura_id }),
    })
    const j = await res.json().catch(() => ({ ok: false, error: "Chyba spojení" }))
    setZprava(j.ok ? { ok: true, text: `Faktura ${f.sf_faktura_no} zrušena.` } : { ok: false, text: j.error ?? "Zrušení se nepovedlo" })
    await nacti()
    setBusy(null)
  }

  async function smazat(s: Sluzba) {
    const mela = fakt.some(f => f.hosting_id === s.id)
    if (!window.confirm(`Smazat službu „${nazevSluzby(s.kategorie_id)}${s.web ? " – " + s.web : ""}“?${mela ? "\n\nSmaže se i historie fakturace této služby (faktury ve SuperFaktuře zůstanou). Pokud službu jen ukončuješ, nastav raději stav Zrušeno." : ""}`)) return
    const { error } = await createClient().from("george_hosting").delete().eq("id", s.id)
    if (error) { setZprava({ ok: false, text: "Smazání se nepovedlo: " + error.message }); return }
    await nacti()
  }

  const karta: React.CSSProperties = { background: "white", borderRadius: 14, padding: "16px 20px", boxShadow: "var(--shadow-1)", border: "1px solid var(--line)", flex: "1 1 180px" }

  return (
    <AppShell module="studio">
      {modal && (
        <SluzbaModal
          edit={modal.edit} kategorie={kategorie}
          // Ve výběru jen zákazníci studia (+ aktuální zákazník při úpravě)
          zakaznici={zakaznici.filter(z => z.projekty?.includes("Studio") || z.id === modal.edit?.zakaznik_id || z.id === modal.zakaznik)}
          predvolenyZakaznik={modal.zakaznik ?? null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); nacti() }}
        />
      )}

      <div style={{ padding: 28, maxWidth: 1000 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", margin: 0 }}>Správa hostingu</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "5px 0 0" }}>Domény, hosting a e-maily zákazníků — roční fakturace</p>
          </div>
          <button onClick={() => setModal({})} style={{
            padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "white",
            background: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))", boxShadow: "0 2px 10px rgba(99,102,241,.3)",
          }}>+ Přidat službu</button>
        </div>

        {/* Souhrn */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={karta}><div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Zákazníků</div><div style={{ fontSize: 24, fontWeight: 700 }}>{pocetZak}</div></div>
          <div style={karta}><div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Aktivních služeb</div><div style={{ fontSize: 24, fontWeight: 700 }}>{aktivni.length}</div></div>
          <div style={karta}><div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Roční tržba</div><div style={{ fontSize: 24, fontWeight: 700 }}>{fKc(rocniTrzba)}</div></div>
          <div style={karta}><div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>K vyfakturování {rok}</div><div style={{ fontSize: 24, fontWeight: 700, color: kFakturaciKc > 0 ? "#dc2626" : "#059669" }}>{fKc(kFakturaciKc)}</div></div>
        </div>

        {/* Filtry */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setRok(r => r - 1)} style={{ ...inp, width: 36, padding: "8px 0", cursor: "pointer", textAlign: "center" }}>‹</button>
            <div style={{ fontWeight: 700, fontSize: 15, minWidth: 90, textAlign: "center" }}>Rok {rok}</div>
            <button onClick={() => setRok(r => r + 1)} style={{ ...inp, width: 36, padding: "8px 0", cursor: "pointer", textAlign: "center" }}>›</button>
          </div>
          <input value={hledat} onChange={e => setHledat(e.target.value)} placeholder="Hledat zákazníka nebo web…" style={{ ...inp, maxWidth: 280 }} />
        </div>

        {zprava && (
          <div style={{
            marginBottom: 16, padding: "10px 14px", borderRadius: 10, fontSize: 13.5,
            background: zprava.ok ? "#f0fdf4" : "#fef2f2", color: zprava.ok ? "#166534" : "#b91c1c",
            border: `1px solid ${zprava.ok ? "#bbf7d0" : "#fecaca"}`,
          }}>{zprava.text}</div>
        )}

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Načítám…</div>
        ) : skupiny.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 0" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              {sluzby.length === 0 ? "Zatím tu nejsou žádné služby" : "Nic nenalezeno"}
            </div>
            {sluzby.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                1) V Ceníku vytvoř položky (doména, hosting, e-mail…) se zaškrtnutím „Roční služba“.<br />
                2) Tady klikni na „Přidat službu“ a přiřaď ji zákazníkovi.
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {skupiny.map(({ zid, zak, rows }) => {
              const akt        = rows.filter(r => r.stav === "ok")
              const rocni      = akt.reduce((a, r) => a + Number(r.cena_rok), 0)
              const nevyfakt   = akt.filter(r => !faktMap.has(r.id) && Number(r.cena_rok) > 0)
              const nevyfaktKc = nevyfakt.reduce((a, r) => a + Number(r.cena_rok), 0)
              return (
                <section key={zid} style={{ background: "white", borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)", boxShadow: "var(--shadow-1)" }}>
                  <div style={{ background: "#111", color: "white", padding: "11px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 15, flex: 1, minWidth: 160 }}>{zakLabel(zak!)}</div>
                    <div style={{ fontSize: 13, opacity: .8 }}>Ročně <b style={{ color: "white" }}>{fKc(rocni)}</b></div>
                    {nevyfakt.length > 0 ? (
                      <button onClick={() => vyfakturovat(zid)} disabled={busy === zid} style={{
                        padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                        background: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))", color: "white", opacity: busy === zid ? .6 : 1,
                      }}>{busy === zid ? "Vystavuji…" : `Vyfakturovat ${rok} · ${fKc(nevyfaktKc)}`}</button>
                    ) : akt.length > 0 ? (
                      <span style={{ fontSize: 12, color: "#86efac", fontWeight: 600 }}>✓ Rok {rok} vyfakturován</span>
                    ) : null}
                    <button onClick={() => setModal({ zakaznik: zid })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.3)", background: "transparent", color: "white", cursor: "pointer", fontSize: 12.5 }}>+ Služba</button>
                  </div>

                  {rows.map((s, i) => {
                    const st = STAVY.find(x => x.v === s.stav)!
                    const f  = faktMap.get(s.id)
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderTop: i === 0 ? "none" : "1px solid #f3f4f6", flexWrap: "wrap", opacity: s.stav === "zruseno" ? .55 : 1 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: st.bg, color: st.fg, minWidth: 28, textAlign: "center" }}>{st.label}</span>
                        <div style={{ flex: "2 1 220px", minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "#2563eb", overflow: "hidden", textOverflow: "ellipsis" }}>{s.web || "—"}</div>
                          {s.poznamka && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{s.poznamka}</div>}
                        </div>
                        <div style={{ flex: "1 1 120px", fontSize: 13.5 }}>{nazevSluzby(s.kategorie_id)}</div>
                        <div style={{ width: 60, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>{s.kvota_gb != null ? `${s.kvota_gb} GB` : "—"}</div>
                        <div style={{ width: 84, fontWeight: 700, fontSize: 14, textAlign: "right" }}>{fKc(Number(s.cena_rok))}</div>
                        <div style={{ width: 150, textAlign: "center" }}>
                          {f ? (
                            <button onClick={() => zrusitFakturu(f)} disabled={busy === -s.id} title="Kliknutím fakturu zrušíš" style={{
                              fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 99, cursor: "pointer",
                              border: "1.5px solid #86efac", background: "#f0fdf4", color: "#166534",
                            }}>✓ {f.sf_faktura_no}</button>
                          ) : s.stav === "ok" ? (
                            <span style={{ fontSize: 11.5, color: "#9ca3af" }}>nevyfakturováno</span>
                          ) : <span style={{ fontSize: 11.5, color: "#d1d5db" }}>—</span>}
                        </div>
                        <div style={{ display: "flex", gap: 2 }}>
                          <button onClick={() => setModal({ edit: s })} title="Upravit" style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "var(--muted)" }}>✎</button>
                          <button onClick={() => smazat(s)} title="Smazat" style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "var(--muted)" }}>🗑</button>
                        </div>
                      </div>
                    )
                  })}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
