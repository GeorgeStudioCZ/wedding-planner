import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { vytvorZalohFakturu, qrPlatbaUrl, SFKlient, SFPolozka } from "@/lib/superfaktura"

const SF_IBAN       = process.env.SF_IBAN ?? ""
const SF_CISLO_UCTU = process.env.SF_CISLO_UCTU ?? "2302601281/2010"

export interface ZalohFakturaPayload {
  rezervaceId: number
  groupId: string
  klient: SFKlient
  polozky: SFPolozka[]
  celkem: number
  poznamka?: string
}

export interface ZalohFakturaVystup {
  vs: string
  invoice_no: string
  castka: number
  cislo_uctu: string
  qr_url: string
  pdf_url: string
}

export async function POST(req: NextRequest) {
  try {
    const body: ZalohFakturaPayload = await req.json()

    // 1. Vytvoř zálohovou fakturu v SF
    const faktura = await vytvorZalohFakturu(body.klient, body.polozky, body.poznamka)

    // 2. Ulož sf_proforma_id + sf_vs do rezervace a přesuň do stavu cekam-platbu
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    await sb.from("pujcovna_rezervace")
      .update({ sf_proforma_id: faktura.id, sf_vs: faktura.vs, stav: "cekam-platbu" })
      .eq("group_id", body.groupId)

    await sb.from("pujcovna_rezervace_historie").insert({
      rezervace_id: body.rezervaceId,
      stav: "cekam-platbu",
    })

    // 3. Vrať platební údaje
    const vystup: ZalohFakturaVystup = {
      vs:          faktura.vs,
      invoice_no:  faktura.invoice_no,
      castka:      body.celkem,
      cislo_uctu:  SF_CISLO_UCTU,
      qr_url:      SF_IBAN ? qrPlatbaUrl(SF_IBAN, faktura.vs, body.celkem) : "",
      pdf_url:     faktura.pdf_url,
    }

    return NextResponse.json({ ok: true, ...vystup })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[pujcovna/zaloh-faktura]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
