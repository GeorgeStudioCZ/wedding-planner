import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  searchSFClientByIco,
  vytvorFakturuGeorge,
  SFKlientGeorge,
  SFPolozkaGeorge,
} from "@/lib/superfaktura"

// Vyžaduje sloupce v george_zaznamy:
//   ALTER TABLE george_zaznamy ADD COLUMN IF NOT EXISTS sf_faktura_id integer;
//   ALTER TABLE george_zaznamy ADD COLUMN IF NOT EXISTS sf_faktura_no text;

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
        // Materiál / kusová služba — quantity = kusy, unit_price = cena/ks bez DPH
        let totalPocet = 0
        let kusCena = 0
        for (const z of skupina) {
          totalPocet += z.pocet ?? 0
          if (!kusCena) kusCena = z.cena_prodej_kus ?? kat?.sazba ?? 0
        }
        if (totalPocet <= 0 || kusCena <= 0) continue
        polozky.push({
          nazev:      kat?.name ?? "Materiál",
          unit_price: kusCena,
          quantity:   totalPocet,
          unit:       kat?.jednotka ?? "ks",
        })
      } else {
        // Časová služba — quantity = decimal hodiny, unit_price = hodinová sazba bez DPH
        let totalMs = 0
        for (const z of skupina) {
          if (!z.end_at) continue
          totalMs += new Date(z.end_at).getTime() - new Date(z.start_at).getTime()
        }
        const totalHours = totalMs / 3_600_000
        const sazba = kat?.sazba ?? 0
        if (totalHours <= 0 || sazba <= 0) continue
        const h = Math.floor(totalHours)
        const m = Math.round((totalHours - h) * 60)
        polozky.push({
          nazev:      kat?.name ?? "Práce",
          unit_price: sazba,
          quantity:   Math.round(totalHours * 100) / 100,
          unit:       "hod",
          popis:      `${h}:${String(m).padStart(2, "0")} hod`,
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

    // Spočítej celkovou cenu s DPH pro uložení
    const celkemBezDPH = polozky.reduce((a, p) => a + Math.round(p.unit_price * p.quantity * 100) / 100, 0)
    const celkemSDPH   = Math.round(celkemBezDPH * 1.21 * 100) / 100

    // Vytvoř fakturu
    const faktura = await vytvorFakturuGeorge(klient, polozky, sfKlientId, poznamka)

    // Ulož fakturu do george_faktury
    const { error: insertErr } = await sb.from("george_faktury").insert({
      sf_id:       faktura.id,
      sf_no:       faktura.invoice_no,
      zakaznik_id: zakaznikId,
      pdf_url:     faktura.pdf_url,
      celkem_sdph: celkemSDPH,
    })
    if (insertErr) {
      console.error("[george/vytvor-fakturu] george_faktury insert failed:", insertErr)
      // Fakturu v SF necháme — jen logujeme chybu, odpověď stále ok
    }

    // Označ záznamy jako vyfakturované a ulož odkaz na fakturu
    await sb.from("george_zaznamy").update({
      fakturovano:   true,
      sf_faktura_id: faktura.id,
      sf_faktura_no: faktura.invoice_no,
    }).in("id", zaznamyIds)

    return NextResponse.json({
      ok:               true,
      sf_id:            faktura.id,
      invoice_no:       faktura.invoice_no,
      pdf_url:          faktura.pdf_url,
      sf_klient_linked: sfKlientId !== null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[george/vytvor-fakturu]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
