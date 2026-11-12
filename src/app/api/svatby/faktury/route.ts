import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { vytvorSvatebniZalohu, vytvorSvatebniFakturu, SFKlient, SFPolozka } from "@/lib/superfaktura"

export const REZERVACNI_POPLATEK = 2900

const BALICKY: Record<string, { nazev: string; hodiny: number }> = {
  "pul-den-6": { nazev: "PŮL DEN (6 HOD)", hodiny: 6 },
  "pul-den":   { nazev: "PŮL DEN (8 HOD)", hodiny: 8 },
  "cely-den":  { nazev: "CELÝ DEN (10 HOD)", hodiny: 10 },
  "do-vecera": { nazev: "DO VEČERA (12 HOD)", hodiny: 12 },
}

type ZakazkaFakturace = {
  datum_svatby: string | null
  balicek: string | null
  cas_prijezdu: string | null
  adresa_obradu: string | null
}

// Název a popis položky ve faktuře: pevný název + balíček, v popisu datum, čas natáčení a místo obřadu
function polozkaSvatby(z: ZakazkaFakturace, nazevZaklad: string, cenaSdph: number): SFPolozka {
  const balicek = z.balicek ? BALICKY[z.balicek] : undefined
  if (!balicek) throw new Error("Zakázka nemá vyplněný balíček.")
  if (!z.cas_prijezdu) throw new Error("Zakázka nemá vyplněný čas příjezdu (potřeba pro čas natáčení).")
  if (!z.datum_svatby) throw new Error("Zakázka nemá vyplněné datum svatby.")

  const [h, m] = z.cas_prijezdu.slice(0, 5).split(":").map(Number)
  const konec = `${String((h + balicek.hodiny) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  const start = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  const [rok, mesic, den] = z.datum_svatby.split("-")

  const popis = [
    z.adresa_obradu ? `Místo konání svatby : ${z.adresa_obradu}` : null,
    `Datum svatby : ${den}.${mesic}.${rok}`,
    `Čas natáčení : ${start} - ${konec} hod`,
  ].filter(Boolean).join("\n")

  return {
    nazev: `${nazevZaklad} | balíček : ${balicek.nazev}`,
    cena_sdph: cenaSdph,
    pocet: 1,
    jednotka: "ks",
    popis,
  }
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Seznam faktur k zakázce
export async function GET(req: NextRequest) {
  const zakazkaId = req.nextUrl.searchParams.get("zakazka_id")
  if (!zakazkaId) return NextResponse.json({ ok: false, error: "Chybí zakazka_id" }, { status: 400 })

  const { data, error } = await sb()
    .from("svatby_faktury")
    .select("*")
    .eq("zakazka_id", zakazkaId)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, faktury: data ?? [] })
}

// Vystavení faktury: typ = "zaloha" | "ostra" | "doplatek"
export async function POST(req: NextRequest) {
  try {
    const { zakazka_id, typ } = (await req.json()) as { zakazka_id: string; typ: "zaloha" | "ostra" | "doplatek" }
    const db = sb()

    const { data: zakazka, error: zErr } = await db
      .from("zakazky")
      .select("id, cena, datum_svatby, balicek, cas_prijezdu, adresa_obradu, jmeno_nevesty, jmeno_zenicha, zakaznici(*)")
      .eq("id", zakazka_id)
      .single()
    if (zErr || !zakazka) return NextResponse.json({ ok: false, error: "Zakázka nenalezena" }, { status: 404 })

    const zakaznik = zakazka.zakaznici as unknown as {
      jmeno: string; prijmeni: string; email: string; telefon: string
      ulice: string; mesto: string; psc: string
    } | null
    if (!zakaznik) {
      return NextResponse.json({ ok: false, error: "Zakázka nemá přiřazeného zákazníka — doplň ho v editaci zakázky." }, { status: 400 })
    }

    const klient: SFKlient = {
      jmeno:   `${zakaznik.jmeno} ${zakaznik.prijmeni}`.trim(),
      email:   zakaznik.email   || undefined,
      telefon: zakaznik.telefon || undefined,
      ulice:   zakaznik.ulice   || undefined,
      mesto:   zakaznik.mesto   || undefined,
      psc:     zakaznik.psc     || undefined,
    }

    const { data: existujici } = await db
      .from("svatby_faktury")
      .select("*")
      .eq("zakazka_id", zakazka_id)
    const seznam = existujici ?? []

    if (typ === "zaloha") {
      if (seznam.some(f => f.typ === "zaloha")) {
        return NextResponse.json({ ok: false, error: "Zálohová faktura už k zakázce existuje." }, { status: 409 })
      }
      const popis = "Rezervační poplatek"
      const polozky: SFPolozka[] = [polozkaSvatby(zakazka, "Rezervační poplatek za svatební focení/natáčení", REZERVACNI_POPLATEK)]
      const f = await vytvorSvatebniZalohu(klient, polozky, `Zakázka ${zakazka.jmeno_nevesty} & ${zakazka.jmeno_zenicha}`)
      const { data, error } = await db.from("svatby_faktury").insert({
        zakazka_id, typ: "zaloha", sf_id: f.id, cislo: f.invoice_no, vs: f.vs,
        castka: REZERVACNI_POPLATEK, popis, pdf_url: f.pdf_url,
      }).select().single()
      if (error) throw new Error(`Uložení do DB selhalo: ${error.message}`)
      return NextResponse.json({ ok: true, faktura: data })
    }

    if (typ === "ostra") {
      const zaloha = seznam.find(f => f.typ === "zaloha")
      if (!zaloha) return NextResponse.json({ ok: false, error: "Nejdřív vystav zálohovou fakturu." }, { status: 400 })
      if (zaloha.stav !== "zaplacena") return NextResponse.json({ ok: false, error: "Zálohová faktura ještě není označena jako zaplacená." }, { status: 400 })
      if (seznam.some(f => f.typ === "ostra")) {
        return NextResponse.json({ ok: false, error: "Ostrá faktura ze zálohy už existuje." }, { status: 409 })
      }
      const polozky: SFPolozka[] = [polozkaSvatby(zakazka, "Rezervační poplatek za svatební focení/natáčení", Number(zaloha.castka))]
      const f = await vytvorSvatebniFakturu(klient, polozky, zaloha.sf_id, `Úhrada zálohy ${zaloha.cislo}`)
      const { data, error } = await db.from("svatby_faktury").insert({
        zakazka_id, typ: "ostra", parent_id: zaloha.id, sf_id: f.id, cislo: f.invoice_no,
        castka: zaloha.castka, popis: "Rezervační poplatek", pdf_url: f.pdf_url, stav: "zaplacena",
        zaplaceno_at: new Date().toISOString(),
      }).select().single()
      if (error) throw new Error(`Uložení do DB selhalo: ${error.message}`)
      return NextResponse.json({ ok: true, faktura: data })
    }

    if (typ === "doplatek") {
      const dnes = new Date().toISOString().slice(0, 10)
      if (!zakazka.datum_svatby || zakazka.datum_svatby > dnes) {
        return NextResponse.json({ ok: false, error: "Doplatek lze vystavit až po svatbě." }, { status: 400 })
      }
      const cena = Number(zakazka.cena ?? 0)
      const castka = Math.round((cena - REZERVACNI_POPLATEK) * 100) / 100
      if (castka <= 0) {
        return NextResponse.json({ ok: false, error: "Doplatek je nulový — zkontroluj cenu zakázky." }, { status: 400 })
      }
      if (seznam.some(f => f.typ === "doplatek")) {
        return NextResponse.json({ ok: false, error: "Faktura na doplatek už existuje." }, { status: 409 })
      }
      const polozky: SFPolozka[] = [polozkaSvatby(zakazka, "Doplatek za svatební focení/natáčení", castka)]
      const f = await vytvorSvatebniFakturu(klient, polozky, null, `Cena zakázky ${cena} Kč − rezervační poplatek ${REZERVACNI_POPLATEK} Kč`)
      const { data, error } = await db.from("svatby_faktury").insert({
        zakazka_id, typ: "doplatek", sf_id: f.id, cislo: f.invoice_no,
        castka, popis: "Doplatek za svatbu", pdf_url: f.pdf_url,
      }).select().single()
      if (error) throw new Error(`Uložení do DB selhalo: ${error.message}`)
      return NextResponse.json({ ok: true, faktura: data })
    }

    return NextResponse.json({ ok: false, error: "Neznámý typ faktury" }, { status: 400 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[svatby/faktury]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
