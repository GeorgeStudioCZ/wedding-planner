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

    // Záznam už vyfakturovaný nebo označený jako zaplacený hotově se do faktury znovu nedává
    const uzVyrizene = zaznamy.filter(z => z.fakturovano)
    if (uzVyrizene.length > 0) {
      return NextResponse.json({
        ok: false,
        error: `${uzVyrizene.length} z vybraných záznamů už je vyfakturováno nebo označeno jako zaplaceno hotově. Obnov stránku a zkus to znovu.`,
      }, { status: 409 })
    }

    const katIds = [...new Set(zaznamy.map(z => z.kategorie_id).filter(Boolean))]
    const { data: kategorie } = katIds.length
      ? await sb.from("george_kategorie").select("id, name, sazba, sazba_typ, typ, jednotka").in("id", katIds)
      : { data: [] }
    const katMap = Object.fromEntries((kategorie ?? []).map(k => [k.id, k]))

    // Jedna položka = název zakázky (záznamu) + popis (kategorie z ceníku).
    // Záznamy se stejným názvem, kategorií a cenou se sečtou.
    type Skup = { nazev: string; popis: string; material: boolean; cena: number; jednotka: string; mnozstvi: number }
    const skupiny = new Map<string, Skup>()
    for (const z of zaznamy) {
      const kat = z.kategorie_id ? katMap[z.kategorie_id] : null
      const material = z.pocet != null
      // Ceny zmražené u záznamu mají přednost před aktuálním ceníkem
      const cena = material ? (z.cena_prodej_kus ?? kat?.sazba ?? 0) : (z.sazba_snapshot ?? kat?.sazba ?? 0)
      let mnozstvi = 0
      if (material) mnozstvi = z.pocet ?? 0
      else if (z.end_at) mnozstvi = (new Date(z.end_at).getTime() - new Date(z.start_at).getTime()) / 3_600_000
      if (mnozstvi <= 0 || cena <= 0) continue
      const nazev = (z.nazev?.trim() || kat?.name || (material ? "Materiál" : "Práce"))
      const popis = kat?.name && kat.name !== nazev ? kat.name : ""
      const key = [nazev, popis, material, cena].join("|")
      const g = skupiny.get(key) ?? {
        nazev, popis, material, cena, mnozstvi: 0,
        jednotka: material ? (kat?.jednotka ?? "ks") : "hod",
      }
      g.mnozstvi += mnozstvi
      skupiny.set(key, g)
    }

    const polozky: SFPolozkaGeorge[] = [...skupiny.values()].map(g => ({
      nazev:      g.nazev,
      popis:      g.popis || undefined,
      unit_price: g.cena,
      // Hodiny jako desetinné číslo (1,4167 h), kusy celé
      quantity:   g.material ? g.mnozstvi : Math.round(g.mnozstvi * 10000) / 10000,
      unit:       g.jednotka,
    }))

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

    // Spočítej celkovou cenu pro uložení (konečné ceny)
    const celkem = Math.round(polozky.reduce((a, p) => a + p.unit_price * p.quantity, 0) * 100) / 100

    // Vytvoř fakturu
    const faktura = await vytvorFakturuGeorge(klient, polozky, sfKlientId, poznamka)

    // Ulož fakturu do george_faktury
    const { error: insertErr } = await sb.from("george_faktury").insert({
      sf_id:       faktura.id,
      sf_no:       faktura.invoice_no,
      zakaznik_id: zakaznikId,
      pdf_url:     faktura.pdf_url,
      celkem_sdph: celkem,   // název sloupce v DB; hodnota je konečná cena
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
