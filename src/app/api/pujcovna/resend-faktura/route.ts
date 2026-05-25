// Ruční odeslání faktury zákazníkovi pro rezervaci která je již ve stavu "zaplaceno"
// Použij když byl email s fakturou původně nedoručen (chybějící email v sf_platba_data atd.)
//
// POST /api/pujcovna/resend-faktura
// Body: { "rezervaceId": 123 }

import { NextRequest, NextResponse } from "next/server"
import { createClient }              from "@supabase/supabase-js"
import { getInvoice }                from "@/lib/superfaktura"
import { sendMail }                  from "@/lib/mailer"
import { logEmail }                  from "@/lib/email-log"
import { htmlFaktura }               from "@/app/api/pujcovna/faktura-zaplaceno/route"

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
      .select("id, customer, zakaznik_id, sf_faktura_id, sf_platba_data, start_date, end_date")
      .eq("id", rezervaceId)
      .single()

    if (error || !rez) return NextResponse.json({ ok: false, error: "Rezervace nenalezena" }, { status: 404 })
    if (!rez.sf_faktura_id) return NextResponse.json({ ok: false, error: "Rezervace nemá sf_faktura_id — faktura nebyla vytvořena" }, { status: 422 })

    // 2. Načti email zákazníka — záložně z zakaznici tabulky
    type PlatbaData = { klient?: { email?: string; jmeno_display?: string }; polozky?: Array<{ nazev?: string }> }
    const platba = (rez.sf_platba_data ?? {}) as PlatbaData
    let emailTo = platba.klient?.email ?? ""
    let jmenoTo = platba.klient?.jmeno_display ?? rez.customer ?? ""

    if (!emailTo && rez.zakaznik_id) {
      const { data: zak } = await sb
        .from("zakaznici")
        .select("jmeno, prijmeni, email")
        .eq("id", rez.zakaznik_id)
        .maybeSingle()
      if (zak?.email) {
        emailTo = zak.email
        if (!jmenoTo) jmenoTo = `${zak.jmeno ?? ""} ${zak.prijmeni ?? ""}`.trim()
      }
    }

    if (!emailTo) return NextResponse.json({ ok: false, error: "Email zákazníka nenalezen (ani v sf_platba_data ani v zakaznici)" }, { status: 422 })

    // 3. Načti fakturu ze SuperFaktury (abychom měli aktuální PDF URL)
    const faktura = await getInvoice(rez.sf_faktura_id)

    // 4. Sestaví a odešli email
    const subj = `Platba přijata – rezervace potvrzena ✅`
    const html = htmlFaktura({
      jmeno:      jmenoTo,
      invoice_no: faktura.invoice_no,
      pdf_url:    faktura.pdf_url,
      polozka:    platba.polozky?.[0]?.nazev,
      startDate:  rez.start_date,
      endDate:    rez.end_date,
    })

    await sendMail({ sluzba: "stany", to: emailTo, subject: subj, html })
    await logEmail({
      sluzba:   "stany",
      typ:      "rezervace-pujcovna",
      to_email: emailTo,
      to_name:  jmenoTo,
      subject:  subj,
      html,
    })

    return NextResponse.json({
      ok:         true,
      to:         emailTo,
      invoice_no: faktura.invoice_no,
      pdf_url:    faktura.pdf_url,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[resend-faktura]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
