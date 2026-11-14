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
      .select("id, web, cena_rok, kvota_gb, kategorie_id, stav, george_kategorie(name)")
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
    const k_fakturaci = sluzby.filter(s => !hotoveSet.has(s.id) && Number(s.cena_rok) > 0)
    if (!k_fakturaci.length) {
      return NextResponse.json({ ok: false, error: `Všechny služby jsou za rok ${rok} už vyfakturované` }, { status: 409 })
    }

    const polozky: SFPolozkaGeorge[] = k_fakturaci.map(s => {
      const katJmeno = (s.george_kategorie as unknown as { name: string } | null)?.name ?? "Služba"
      const web = (s.web ?? "").trim()
      const kvota = s.kvota_gb != null ? ` – ${Number(s.kvota_gb)} GB` : ""
      return {
        nazev:      web || katJmeno + kvota,
        popis:      web ? katJmeno + kvota : undefined,
        unit_price: Number(s.cena_rok),
        quantity:   1,
        unit:       "rok",
      }
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
    const celkem = Math.round(polozky.reduce((a, p) => a + p.unit_price * p.quantity, 0) * 100) / 100

    const faktura = await vytvorFakturuGeorge(klient, polozky, sfKlientId, `Hosting a domény – rok ${rok}`)

    const { error: evErr } = await sb.from("george_faktury").insert({
      sf_id: faktura.id, sf_no: faktura.invoice_no, zakaznik_id: zakaznikId,
      pdf_url: faktura.pdf_url, celkem_sdph: celkem,
    })
    if (evErr) console.error("[george/hosting-fakturace] george_faktury insert failed:", evErr)

    const { error: fErr } = await sb.from("george_hosting_fakturace").insert(
      k_fakturaci.map(s => ({
        hosting_id: s.id, rok, cena: Number(s.cena_rok),
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
