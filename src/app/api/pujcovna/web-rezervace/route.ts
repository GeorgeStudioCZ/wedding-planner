import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/supabase-admin"
import { vytvorZalohFakturu, qrPlatbaUrl, SFPolozka } from "@/lib/superfaktura"
import { jeEmail, jeIsoDatum } from "@/lib/html"
import {
  type Polozka, type Stupen, type RezRow,
  PRISL_CATS, NOT_MAIN_CATS, DRZAK_KAT, DRZAK_THULE_NAME, DRZAK_VARIANTY,
  stanDetail, pocetDni, cenaPolozky, volnych, freeUnit, barvaPolozky, montazniPoplatek,
} from "@/lib/pujcovna-web"

// Veřejný endpoint: kompletní zpracování rezervace z webového formuláře.
// Server si sám ověří dostupnost a spočítá cenu z ceníku — z prohlížeče přijímá
// jen výběr položek, termín a kontaktní údaje. Ceně z prohlížeče se nevěří.

const SF_IBAN       = process.env.SF_IBAN ?? ""
const SF_CISLO_UCTU = process.env.SF_CISLO_UCTU ?? ""
const MAX_DNI       = 60
const MAX_KS_PRISL  = 10

type Form = {
  jmeno: string; prijmeni: string; email: string; telefon: string
  ulice: string; mesto: string; psc: string
  vozidlo: string; pricniky: string; cas_vyzvednuti: string; cas_vraceni: string
  poznamka: string
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

function chyba(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body !== "object") return chyba("Neplatný požadavek.")

    // ── Vstupy ───────────────────────────────────────────────────────────────
    const itemId   = Number(body.itemId)
    const dateFrom = body.dateFrom
    const dateTo   = body.dateTo
    const f        = (body.form ?? {}) as Record<string, unknown>
    const form: Form = {
      jmeno: text(f.jmeno, 80), prijmeni: text(f.prijmeni, 80),
      email: text(f.email, 254), telefon: text(f.telefon, 30),
      ulice: text(f.ulice, 120), mesto: text(f.mesto, 80), psc: text(f.psc, 12),
      vozidlo: text(f.vozidlo, 120), pricniky: text(f.pricniky, 20),
      cas_vyzvednuti: text(f.cas_vyzvednuti, 30), cas_vraceni: text(f.cas_vraceni, 30),
      poznamka: text(f.poznamka, 1000),
    }

    if (!Number.isInteger(itemId)) return chyba("Vyberte položku.")
    if (!jeIsoDatum(dateFrom) || !jeIsoDatum(dateTo)) return chyba("Neplatný termín.")
    if (dateFrom > dateTo) return chyba("Datum vrácení musí být stejné nebo pozdější než vyzvednutí.")
    const vcera = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    if (dateFrom < vcera) return chyba("Termín je v minulosti.")
    const dni = pocetDni(dateFrom, dateTo)
    if (dni < 1 || dni > MAX_DNI) return chyba(`Rezervaci lze vytvořit nejvýše na ${MAX_DNI} dní.`)

    if (!form.jmeno || !form.prijmeni) return chyba("Vyplňte jméno a příjmení.")
    if (!jeEmail(form.email)) return chyba("Zadejte platný e-mail.")
    if (!/^[+0-9 ()\-]{6,30}$/.test(form.telefon)) return chyba("Zadejte platný telefon.")
    if (!form.cas_vyzvednuti || !form.cas_vraceni) return chyba("Vyberte čas vyzvednutí a vrácení.")

    // ── Data z databáze ──────────────────────────────────────────────────────
    const db = adminDb()
    const [polRes, stRes, rezRes] = await Promise.all([
      db.from("pujcovna_polozky").select("*"),
      db.from("pujcovna_ceny_stupne").select("*"),
      db.from("pujcovna_rezervace")
        .select("id,item_id,unit_index,start_date,end_date,group_id")
        .neq("stav", "storno"),
    ])
    if (polRes.error || stRes.error || rezRes.error) throw new Error("Načtení dat selhalo")
    const polozky = (polRes.data ?? []) as Polozka[]
    const stupne  = (stRes.data ?? []) as Stupen[]
    const rez     = (rezRes.data ?? []) as RezRow[]

    const sel = polozky.find(p => p.id === itemId)
    if (!sel) return chyba("Položka neexistuje.")
    const jeDrzak = sel.name === DRZAK_THULE_NAME
    if (NOT_MAIN_CATS.has(sel.category) && !jeDrzak) return chyba("Tuto položku nelze rezervovat samostatně.")
    const jeStany      = sel.category === "Stany"
    const jeBezVozidla = sel.category === "Paddleboardy" || jeDrzak

    if (!jeBezVozidla && !form.vozidlo) return chyba("Vyplňte vozidlo.")
    if (jeStany && !["vlastni", "pujcit"].includes(form.pricniky)) return chyba("Vyberte variantu příčníků.")

    const drzakVariant = jeDrzak ? text(body.drzakVariant, 40) : ""
    if (jeDrzak && !DRZAK_VARIANTY.some(v => v.label === drzakVariant)) return chyba("Vyberte variantu držáku.")

    // ── Dostupnost hlavní položky ────────────────────────────────────────────
    if (volnych(sel.id, sel.unit_num, sel.neomezene, dateFrom, dateTo, rez) === 0) {
      return chyba("Položka už v tomto termínu není dostupná. Zvolte prosím jiný termín.", 409)
    }

    // ── Příslušenství (jen u stanů) ──────────────────────────────────────────
    const prislVstup = (jeStany && body.prisl && typeof body.prisl === "object" ? body.prisl : {}) as Record<string, unknown>
    const prislRadky: { pol: Polozka; cnt: number; cena: number | null }[] = []
    for (const [ids, cntRaw] of Object.entries(prislVstup)) {
      const cnt = Number(cntRaw)
      if (!cnt) continue
      if (!Number.isInteger(cnt) || cnt < 0 || cnt > MAX_KS_PRISL) return chyba("Neplatný počet kusů příslušenství.")
      const pol = polozky.find(p => p.id === Number(ids))
      if (!pol || !(PRISL_CATS.has(pol.category) || pol.category === "Příčníky")) return chyba("Neplatné příslušenství.")
      if (volnych(pol.id, pol.unit_num, pol.neomezene, dateFrom, dateTo, rez) < cnt) {
        return chyba(`${pol.name} už v tomto termínu není v požadovaném počtu dostupné.`, 409)
      }
      prislRadky.push({ pol, cnt, cena: cenaPolozky(pol, stupne, dni) })
    }
    if (jeStany && form.pricniky === "pujcit" && !prislRadky.some(r => r.pol.category === "Příčníky")) {
      return chyba("Vyberte typ příčníků k zapůjčení.")
    }

    // ── Cena (počítá server) ─────────────────────────────────────────────────
    const cenaStan   = cenaPolozky(sel, stupne, dni)
    const montazPopl = montazniPoplatek(jeStany, dni)
    const celkem     = (cenaStan ?? 0) + prislRadky.reduce((s, r) => s + (r.cena ?? 0) * r.cnt, 0) + montazPopl

    // ── Jednoduchá ochrana proti zahlcení ────────────────────────────────────
    const pred10min = new Date(Date.now() - 10 * 60000).toISOString()
    const { count: nedavne } = await db.from("pujcovna_rezervace_historie")
      .select("id", { count: "exact", head: true })
      .eq("stav", "web-rezervace").gte("created_at", pred10min)
    if ((nedavne ?? 0) >= 15) return chyba("Systém je přetížen, zkuste to prosím za několik minut.", 429)

    // ── Zákazník ─────────────────────────────────────────────────────────────
    let zakaznikId: number | null = null
    const { data: byEmail } = await db.from("zakaznici").select("id").eq("email", form.email).limit(1).maybeSingle()
    if (byEmail) zakaznikId = byEmail.id
    else {
      const { data: byPhone } = await db.from("zakaznici").select("id").eq("telefon", form.telefon).limit(1).maybeSingle()
      if (byPhone) zakaznikId = byPhone.id
      else {
        const { data: nz } = await db.from("zakaznici")
          .insert({ jmeno: form.jmeno, prijmeni: form.prijmeni, email: form.email, telefon: form.telefon,
            ulice: form.ulice, mesto: form.mesto, psc: form.psc, projekty: ["Půjčovna"] })
          .select("id").single()
        zakaznikId = nz?.id ?? null
      }
    }

    // ── Uložení rezervace ────────────────────────────────────────────────────
    const groupId  = crypto.randomUUID()
    const customer = `${form.jmeno} ${form.prijmeni}`.trim()
    const used: Record<number, number[]> = {}
    const mainUnit = freeUnit(sel.id, sel.unit_num, dateFrom, dateTo, rez, [])
    used[sel.id] = [mainUnit]

    const { data: mainRez, error: mainErr } = await db.from("pujcovna_rezervace").insert({
      item_id: sel.id, unit_index: mainUnit, customer,
      start_date: dateFrom, end_date: dateTo, color: barvaPolozky(sel),
      notes: [form.poznamka, drzakVariant ? `Varianta: ${drzakVariant}` : ""].filter(Boolean).join("\n"),
      group_id: groupId, zakaznik_id: zakaznikId,
      vozidlo: form.vozidlo, cas_vyzvednuti: form.cas_vyzvednuti,
      cas_vraceni: form.cas_vraceni, pricniky: form.pricniky, stav: "web-rezervace",
    }).select("id").single()
    if (mainErr || !mainRez) throw new Error(`Uložení rezervace selhalo: ${mainErr?.message ?? "?"}`)

    const rows = []
    for (const r of prislRadky) {
      used[r.pol.id] = used[r.pol.id] ?? []
      for (let i = 0; i < r.cnt; i++) {
        const slot = freeUnit(r.pol.id, r.pol.unit_num, dateFrom, dateTo, rez, used[r.pol.id])
        used[r.pol.id].push(slot)
        rows.push({ item_id: r.pol.id, unit_index: slot, customer, start_date: dateFrom, end_date: dateTo,
          color: barvaPolozky(sel), notes: "", group_id: groupId,
          zakaznik_id: zakaznikId, stav: "web-rezervace",
          cas_vyzvednuti: form.cas_vyzvednuti, cas_vraceni: form.cas_vraceni })
      }
    }
    if (rows.length) await db.from("pujcovna_rezervace").insert(rows)
    await db.from("pujcovna_rezervace_historie").insert({ rezervace_id: mainRez.id, stav: "web-rezervace" })

    // ── Zálohová faktura v SuperFaktuře ──────────────────────────────────────
    const stanNazev = stanDetail(sel)?.nazev ?? sel.name
    const sfPolozky: SFPolozka[] = [
      ...(cenaStan != null && dni > 0
        ? [{ nazev: stanNazev, cena_sdph: cenaStan / dni, pocet: dni, jednotka: "den" }]
        : []),
      ...prislRadky.filter(r => r.cena != null).map(r => ({
        nazev: r.pol.name + (r.cnt > 1 ? ` × ${r.cnt}` : ""),
        cena_sdph: (r.cena! * r.cnt) / dni,
        pocet: dni,
        jednotka: "den",
      })),
      ...(montazPopl > 0 ? [{ nazev: "Poplatek za montáž", cena_sdph: montazPopl, pocet: 1 }] : []),
    ]

    let platba: { vs: string; invoice_no: string; castka: number; cislo_uctu: string; qr_url: string; pdf_url: string } | null = null
    if (sfPolozky.length > 0) {
      try {
        const klient = { jmeno: customer, email: form.email, telefon: form.telefon,
          ulice: form.ulice, mesto: form.mesto, psc: form.psc }
        const faktura = await vytvorZalohFakturu(klient, sfPolozky, form.poznamka || undefined)
        await db.from("pujcovna_rezervace").update({
          sf_proforma_id: faktura.id,
          sf_vs:          faktura.vs,
          stav:           "cekam-platbu",
          sf_platba_data: { klient: { ...klient, jmeno_display: klient.jmeno }, polozky: sfPolozky },
        }).eq("group_id", groupId)
        await db.from("pujcovna_rezervace_historie").insert({ rezervace_id: mainRez.id, stav: "cekam-platbu" })
        platba = {
          vs: faktura.vs, invoice_no: faktura.invoice_no, castka: celkem,
          cislo_uctu: SF_CISLO_UCTU,
          qr_url: SF_IBAN ? qrPlatbaUrl(SF_IBAN, faktura.vs, celkem) : "",
          pdf_url: faktura.pdf_url,
        }
      } catch (e) {
        // Rezervace zůstane ve stavu web-rezervace; zálohu lze vystavit ručně v CRM
        console.error("[web-rezervace] SF záloha:", e instanceof Error ? e.message : e)
      }
    }

    // ── E-mail + kalendář (interní volání chráněných endpointů) ──────────────
    const interni = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
    }
    const origin = req.nextUrl.origin
    await Promise.allSettled([
      fetch(`${origin}/api/mail/rezervace-pujcovna`, {
        method: "POST", headers: interni,
        body: JSON.stringify({
          zakaznik: { jmeno: form.jmeno, prijmeni: form.prijmeni, email: form.email, telefon: form.telefon },
          polozka: jeDrzak ? (drzakVariant || DRZAK_KAT) : stanNazev,
          dateFrom, dateTo, dni,
          vozidlo: form.vozidlo,
          casVyzvednuti: form.cas_vyzvednuti,
          casVraceni: form.cas_vraceni,
          pricniky: form.pricniky,
          poznamka: form.poznamka,
          drzakVariant,
          prisl: prislRadky.map(r => ({ nazev: r.pol.name, cnt: r.cnt, cena: r.cena })),
          cenaStan, montazPopl, celkem, groupId,
          platba: platba ? { vs: platba.vs, invoice_no: platba.invoice_no, cislo_uctu: platba.cislo_uctu, qr_url: platba.qr_url } : undefined,
        }),
      }),
      fetch(`${origin}/api/pujcovna/gcal-sync`, {
        method: "POST", headers: interni,
        body: JSON.stringify({ rezervaceId: mainRez.id }),
      }),
    ])

    return NextResponse.json({ ok: true, platba })
  } catch (err: unknown) {
    console.error("[web-rezervace]", err instanceof Error ? err.message : err)
    return chyba("Rezervaci se nepodařilo zpracovat. Zkuste to prosím znovu nebo nás kontaktujte.", 500)
  }
}
