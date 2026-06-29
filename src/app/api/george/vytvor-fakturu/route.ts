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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })
}

// POST /api/george/vytvor-fakturu
// Body: { zaznamyIds: number[], zakaznikId: number, poznamka?: string }
export async function POST(req: NextRequest) {
  try {
    const { zaznamyIds, zakaznikId, poznamka } = await req.json() as {
      zaznamyIds: number[]
      zakaznikId: number
      poznamka?: string
    }

    if (!zaznamyIds?.length || !zakaznikId) {
      return NextResponse.json({ ok: false, error: "Chybí zaznamyIds nebo zakaznikId" }, { status: 400 })
    }

    // Načti zákazníka
    const { data: zak } = await sb
      .from("zakaznici")
      .select("id, jmeno, prijmeni, firma, ico, dic, email, telefon, ulice, mesto, psc")
      .eq("id", zakaznikId)
      .single()

    if (!zak) return NextResponse.json({ ok: false, error: "Zákazník nenalezen" }, { status: 404 })

    // Načti záznamy + kategorie
    const { data: zaznamy } = await sb
      .from("george_zaznamy")
      .select("*")
      .in("id", zaznamyIds)
      .order("start_at", { ascending: true })

    if (!zaznamy?.length) return NextResponse.json({ ok: false, error: "Záznamy nenalezeny" }, { status: 404 })

    const katIds = [...new Set(zaznamy.map(z => z.kategorie_id).filter(Boolean))]
    const { data: kategorie } = katIds.length
      ? await sb.from("george_kategorie").select("id, name, sazba, sazba_typ, typ, jednotka").in("id", katIds)
      : { data: [] }
    const katMap = Object.fromEntries((kategorie ?? []).map(k => [k.id, k]))

    // Sestav SF položky
    const polozky: SFPolozkaGeorge[] = []
    for (const z of zaznamy) {
      const kat = z.kategorie_id ? katMap[z.kategorie_id] : null
      const jeMatrial = z.pocet != null

      let cena_bezDPH = 0
      let popis = ""

      if (jeMatrial) {
        // Materiál nebo kusová služba — cena_prodej_kus je bezDPH
        const kusCena = z.cena_prodej_kus ?? kat?.sazba ?? 0
        cena_bezDPH = Math.round(z.pocet * kusCena * 100) / 100
        const datumStr = formatDate(z.start_at)
        popis = datumStr
        if (z.poznamka) popis += ` · ${z.poznamka}`
      } else if (z.end_at) {
        // Časová služba — sazba je bezDPH
        const hours = (new Date(z.end_at).getTime() - new Date(z.start_at).getTime()) / 3_600_000
        const sazba = kat?.sazba ?? 0
        cena_bezDPH = Math.round(hours * sazba * 100) / 100

        const datumStr = formatDate(z.start_at)
        const odStr = formatTime(z.start_at)
        const doStr = formatTime(z.end_at)
        popis = `${datumStr} · ${odStr} – ${doStr}`
        if (z.poznamka) popis += ` · ${z.poznamka}`
      }

      if (cena_bezDPH <= 0) continue

      polozky.push({
        nazev:       z.nazev || (kat?.name ?? "Práce"),
        cena_bezDPH,
        popis:       popis || undefined,
      })
    }

    if (!polozky.length) {
      return NextResponse.json({ ok: false, error: "Žádné položky s cenou pro fakturu" }, { status: 422 })
    }

    // SF klient
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

    // Ověř zákazníka v SF adresáři dle IČO
    const sfKlientId = zak.ico ? await searchSFClientByIco(zak.ico) : null

    // Vytvoř fakturu
    const faktura = await vytvorFakturuGeorge(klient, polozky, sfKlientId, poznamka)

    // Označ záznamy jako vyfakturované
    await sb.from("george_zaznamy").update({ fakturovano: true }).in("id", zaznamyIds)

    return NextResponse.json({
      ok:         true,
      sf_id:      faktura.id,
      invoice_no: faktura.invoice_no,
      pdf_url:    faktura.pdf_url,
      sf_klient_linked: sfKlientId !== null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[george/vytvor-fakturu]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
