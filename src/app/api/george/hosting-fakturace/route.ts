import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  searchSFClientByIco,
  vytvorFakturuGeorge,
  SFKlientGeorge,
  SFPolozkaGeorge,
} from "@/lib/superfaktura"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// POST /api/george/hosting-fakturace
// Body: { zakaznikId: number, rok: number }
// Vystaví jednu fakturu za všechny aktivní roční služby zákazníka, které za daný rok ještě nejsou vyfakturované.
export async function POST(req: NextRequest) {
  try {
    const { zakaznikId, rok } = await req.json() as { zakaznikId: number; rok: number }
    if (!zakaznikId || !Number.isInteger(rok) || rok < 2020 || rok > 2100) {
      return NextResponse.json({ ok: false, error: "Chybí zákazník nebo rok" }, { status: 400 })
    }

    const { data: zak } = await sb
      .from("zakaznici")
      .select("id, jmeno, prijmeni, firma, ico, dic, email, telefon, ulice, mesto, psc")
      .eq("id", zakaznikId)
      .single()
    if (!zak) return NextResponse.json({ ok: false, error: "Zákazník nenalezen" }, { status: 404 })

    const { data: sluzby } = await sb
      .from("george_hosting")
      .select("id, web, typ, cena_rok, kvota_gb, kategorie_id, stav, george_kategorie(name, sazba)")
      .eq("zakaznik_id", zakaznikId)
      .eq("stav", "ok")
      .order("web", { ascending: true })
      .order("id", { ascending: true })
    if (!sluzby?.length) return NextResponse.json({ ok: false, error: "Zákazník nemá žádné aktivní služby" }, { status: 422 })

    const { data: hotove } = await sb
      .from("george_hosting_fakturace")
      .select("hosting_id")
      .eq("rok", rok)
      .in("hosting_id", sluzby.map(s => s.id))
    const hotoveSet = new Set((hotove ?? []).map(h => h.hosting_id))
    // Cena služby: vlastní (pevná), jinak cena z ceníku × kvóta GB
    const cenaSluzby = (s: (typeof sluzby)[number]) => {
      if (s.cena_rok != null) return Number(s.cena_rok)
      const sazba = Number((s.george_kategorie as unknown as { sazba: number } | null)?.sazba ?? 0)
      const kv = s.kvota_gb != null && Number(s.kvota_gb) > 0 ? Number(s.kvota_gb) : 1
      return Math.round(sazba * kv * 100) / 100
    }
    const k_fakturaci = sluzby.filter(s => !hotoveSet.has(s.id) && cenaSluzby(s) > 0)
    if (!k_fakturaci.length) {
      return NextResponse.json({ ok: false, error: `Všechny služby jsou za rok ${rok} už vyfakturované` }, { status: 409 })
    }

    // Pořadí na faktuře: domény, hostingy, redirecty, e-maily; uvnitř typu podle webu
    const poradiTypu = ["domena", "hosting", "redirect", "email"]
    const serazene = [...k_fakturaci].sort((a, b) =>
      poradiTypu.indexOf(a.typ) - poradiTypu.indexOf(b.typ) || (a.web ?? "").localeCompare(b.web ?? "", "cs") || a.id - b.id)

    // Položka: název = služba z ceníku, popis = web / doména / e-mail.
    // E-mail: množství = kvóta, jednotka = GB (cena za 1 GB); ostatní: 1 × rok.
    const polozky: SFPolozkaGeorge[] = serazene.map(s => {
      const sluzba = (s.george_kategorie as unknown as { name: string } | null)?.name ?? "Služba"
      const web = (s.web ?? "").trim()
      const cena = cenaSluzby(s)
      const kvota = s.kvota_gb != null ? Number(s.kvota_gb) : 0
      if (s.typ === "email" && kvota > 0) {
        return { nazev: sluzba, popis: web || undefined, unit_price: Math.round(cena / kvota * 100) / 100, quantity: kvota, unit: "GB" }
      }
      return { nazev: sluzba, popis: web || undefined, unit_price: cena, quantity: 1, unit: "rok" }
    })

    const klient: SFKlientGeorge = {
      jmeno:   zak.firma?.trim() || `${zak.jmeno} ${zak.prijmeni}`.trim(),
      ico:     zak.ico  || undefined,
      dic:     zak.dic  || undefined,
      email:   zak.email  || undefined,
      telefon: zak.telefon || undefined,
      ulice:   zak.ulice  || undefined,
      mesto:   zak.mesto  || undefined,
      psc:     zak.psc    || undefined,
    }
    const sfKlientId = zak.ico ? await searchSFClientByIco(zak.ico) : null
    const celkem = Math.round(k_fakturaci.reduce((a, x) => a + cenaSluzby(x), 0) * 100) / 100

    const faktura = await vytvorFakturuGeorge(klient, polozky, sfKlientId, `Hosting a domény – rok ${rok}`, `Hostingové služby ${rok}`)

    const { error: evErr } = await sb.from("george_faktury").insert({
      sf_id: faktura.id, sf_no: faktura.invoice_no, zakaznik_id: zakaznikId,
      pdf_url: faktura.pdf_url, celkem_sdph: celkem,
    })
    if (evErr) console.error("[george/hosting-fakturace] george_faktury insert failed:", evErr)

    const { error: fErr } = await sb.from("george_hosting_fakturace").insert(
      k_fakturaci.map(s => ({
        hosting_id: s.id, rok, cena: cenaSluzby(s),
        sf_faktura_id: faktura.id, sf_faktura_no: faktura.invoice_no,
      })),
    )
    if (fErr) console.error("[george/hosting-fakturace] hosting_fakturace insert failed:", fErr)

    return NextResponse.json({
      ok: true, sf_id: faktura.id, invoice_no: faktura.invoice_no, pdf_url: faktura.pdf_url, celkem, pocet: polozky.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[george/hosting-fakturace]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
