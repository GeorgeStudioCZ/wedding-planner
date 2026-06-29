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

    // Seskup záznamy dle kategorie — každá kategorie = jedna položka na faktuře
    type KatSkupina = { kat: { id: number; name: string; sazba: number; typ: string | null; jednotka: string | null } | null; zaznamy: typeof zaznamy }
    const skupiny = new Map<number | null, KatSkupina>()
    for (const z of zaznamy) {
      const key = z.kategorie_id ?? null
      if (!skupiny.has(key)) skupiny.set(key, { kat: key ? katMap[key] ?? null : null, zaznamy: [] })
      skupiny.get(key)!.zaznamy.push(z)
    }

    const polozky: SFPolozkaGeorge[] = []
    for (const { kat, zaznamy: skupina } of skupiny.values()) {
      const jeMaterial = skupina[0].pocet != null

      if (jeMaterial) {
        // Materiál / kusová služba — sečti kusy a ceny
        let totalBezDPH = 0
        let totalPocet = 0
        for (const z of skupina) {
          const kusCena = z.cena_prodej_kus ?? kat?.sazba ?? 0
          totalBezDPH += (z.pocet ?? 0) * kusCena
          totalPocet  += z.pocet ?? 0
        }
        totalBezDPH = Math.round(totalBezDPH * 100) / 100
        if (totalBezDPH <= 0) continue
        polozky.push({
          nazev:       kat?.name ?? "Materiál",
          cena_bezDPH: totalBezDPH,
          popis:       `${totalPocet} ${kat?.jednotka ?? "ks"}`,
        })
      } else {
        // Časová služba — sečti hodiny, žádné od-do (to je jen v reportu)
        let totalMs = 0
        let totalBezDPH = 0
        for (const z of skupina) {
          if (!z.end_at) continue
          const ms = new Date(z.end_at).getTime() - new Date(z.start_at).getTime()
          totalMs    += ms
          totalBezDPH += (ms / 3_600_000) * (kat?.sazba ?? 0)
        }
        totalBezDPH = Math.round(totalBezDPH * 100) / 100
        if (totalBezDPH <= 0) continue
        const h = Math.floor(totalMs / 3_600_000)
        const m = Math.round(((totalMs / 3_600_000) - h) * 60)
        polozky.push({
          nazev:       kat?.name ?? "Práce",
          cena_bezDPH: totalBezDPH,
          popis:       `${h}:${String(m).padStart(2, "0")} hod`,
        })
      }
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
