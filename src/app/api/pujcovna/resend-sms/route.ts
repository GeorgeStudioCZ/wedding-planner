// Ruční odeslání SMS zákazníkovi pro libovolnou rezervaci
//
// POST /api/pujcovna/resend-sms
// Body: { "rezervaceId": 123 }
//
// Podle stavu rezervace pošle:
//  - cekam-platbu / web-rezervace / rezervace  → smsNoveRezervace (platební údaje)
//  - zaplaceno / vypujceno / dokonceno         → smsPlatbaPrijata (faktura potvrzena)

import { NextRequest, NextResponse } from "next/server"
import { createClient }              from "@supabase/supabase-js"
import { sendSms, smsNoveRezervace, smsPlatbaPrijata, normalizePhone } from "@/lib/bulkgate"
import { logSms }                    from "@/lib/email-log"

const SF_CISLO_UCTU = process.env.SF_CISLO_UCTU ?? ""

export async function POST(req: NextRequest) {
  try {
    const { rezervaceId } = (await req.json()) as { rezervaceId: number }
    if (!rezervaceId) return NextResponse.json({ ok: false, error: "rezervaceId chybí" }, { status: 400 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // 1. Načti rezervaci
    const { data: rez, error } = await sb
      .from("pujcovna_rezervace")
      .select("id, customer, zakaznik_id, stav, sf_vs, sf_faktura_id, sf_platba_data, pujcovna_polozky(name)")
      .eq("id", rezervaceId)
      .single()

    if (error || !rez) {
      return NextResponse.json({ ok: false, error: `Rezervace nenalezena: ${error?.message ?? ""}` }, { status: 404 })
    }

    // 2. Telefon a jméno — záložně z zakaznici
    const platba = (rez.sf_platba_data ?? {}) as {
      klient?: { jmeno_display?: string; telefon?: string }
      celkem?: number
      invoice_no?: string
    }

    let telefonTo = platba.klient?.telefon ?? ""
    let jmenoTo   = platba.klient?.jmeno_display ?? rez.customer ?? ""

    if ((!telefonTo || !jmenoTo) && rez.zakaznik_id) {
      const { data: zak } = await sb
        .from("zakaznici")
        .select("jmeno, prijmeni, telefon")
        .eq("id", rez.zakaznik_id)
        .maybeSingle()
      if (zak) {
        if (!telefonTo && zak.telefon) telefonTo = zak.telefon
        if (!jmenoTo) jmenoTo = `${zak.jmeno ?? ""} ${zak.prijmeni ?? ""}`.trim()
      }
    }

    if (!telefonTo) {
      return NextResponse.json({ ok: false, error: "Zákazník nemá telefon (ani v sf_platba_data ani v zakaznici)" }, { status: 422 })
    }

    if (!normalizePhone(telefonTo)) {
      return NextResponse.json({ ok: false, error: `Neplatné telefonní číslo: ${telefonTo}` }, { status: 422 })
    }

    const polozka = (rez.pujcovna_polozky as unknown as { name: string } | null)?.name ?? "Výpůjčka"
    const stavRez = rez.stav as string

    // 3. Sestavit SMS podle stavu
    let smsText: string
    let typ: string

    if (["zaplaceno", "vypujceno", "dokonceno"].includes(stavRez)) {
      // SMS potvrzení platby
      const invoice_no = platba.invoice_no ?? `VS ${rez.sf_vs ?? ""}`
      smsText = smsPlatbaPrijata({ jmeno: jmenoTo.split(" ")[0], invoice_no })
      typ     = "sms-platba"
    } else {
      // SMS s platebními údaji (nová rezervace / čeká na platbu)
      if (!rez.sf_vs) {
        return NextResponse.json({ ok: false, error: "Rezervace nemá variabilní symbol (sf_vs) — nelze poslat SMS s platebními údaji" }, { status: 422 })
      }
      smsText = smsNoveRezervace({
        jmeno:     jmenoTo.split(" ")[0],
        polozka,
        vs:        rez.sf_vs,
        castka:    platba.celkem ?? 0,
        cisloUctu: SF_CISLO_UCTU,
      })
      typ = "sms-rezervace"
    }

    // 4. Odeslat a zalogovat
    try {
      await sendSms(telefonTo, smsText)
      await logSms({ sluzba: "stany", typ, to_tel: telefonTo, to_name: jmenoTo, text: smsText })
    } catch (smsErr) {
      const smsMsg = smsErr instanceof Error ? smsErr.message : String(smsErr)
      await logSms({ sluzba: "stany", typ, to_tel: telefonTo, to_name: jmenoTo, text: smsText, status: "error", error: smsMsg })
      return NextResponse.json({ ok: false, error: `BulkGate: ${smsMsg}` }, { status: 502 })
    }

    return NextResponse.json({ ok: true, to: telefonTo, typ, text: smsText })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[resend-sms]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
