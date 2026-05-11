import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { vytvorFakturuZeZalohy, SFKlient, SFPolozka } from "@/lib/superfaktura"
import { sendMail } from "@/lib/mailer"

export interface FakturaZaplacenaPayload {
  rezervaceId: number
  proformaId: number
  klient: SFKlient & { jmeno_display: string }
  polozky: SFPolozka[]
}

export async function POST(req: NextRequest) {
  try {
    const body: FakturaZaplacenaPayload = await req.json()

    // 1. Vytvoř ostrou fakturu ze zálohy
    const faktura = await vytvorFakturuZeZalohy(body.proformaId, body.klient, body.polozky)

    // 2. Ulož ID faktury do rezervace
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    await sb.from("pujcovna_rezervace")
      .update({ sf_faktura_id: faktura.id })
      .eq("id", body.rezervaceId)

    // 3. Pošli fakturu zákazníkovi emailem
    if (body.klient.email) {
      await sendMail({
        sluzba: "stany",
        to: body.klient.email,
        subject: `Faktura ${faktura.invoice_no} – Stanuj na autě`,
        html: htmlFaktura(body.klient.jmeno_display, faktura.invoice_no, faktura.pdf_url),
      })
    }

    return NextResponse.json({ ok: true, invoice_no: faktura.invoice_no, pdf_url: faktura.pdf_url })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[pujcovna/faktura-zaplaceno]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export function htmlFaktura(jmeno: string, invoice_no: string, pdf_url: string): string {
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <div style="background:#10b981;padding:28px 32px">
      <div style="font-size:28px;margin-bottom:4px">🧾</div>
      <h1 style="margin:0;font-size:20px;font-weight:800;color:#fff">Faktura k rezervaci</h1>
      <p style="margin:6px 0 0;font-size:14px;color:#d1fae5">stanujnaute.cz</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;font-size:15px;color:#374151">
        Ahoj <strong>${jmeno}</strong>,<br>
        děkujeme za platbu. V příloze níže najdete fakturu k vaší rezervaci.
      </p>
      <div style="text-align:center;margin:24px 0">
        <a href="${pdf_url}"
           style="display:inline-block;background:#10b981;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none">
          📄 Stáhnout fakturu ${invoice_no}
        </a>
      </div>
      <p style="margin:20px 0 6px;font-size:14px;color:#6b7280">Otázky? Napište nám:</p>
      <a href="mailto:info@stanujnaaute.cz" style="color:#10b981;font-weight:600;font-size:14px">info@stanujnaaute.cz</a>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Stanuj na autě · stanujnaaute.cz</p>
    </div>
  </div>
  </body></html>`
}
