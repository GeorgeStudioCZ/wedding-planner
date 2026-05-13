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
        html: htmlFaktura({ jmeno: body.klient.jmeno_display, invoice_no: faktura.invoice_no, pdf_url: faktura.pdf_url }),
      })
    }

    return NextResponse.json({ ok: true, invoice_no: faktura.invoice_no, pdf_url: faktura.pdf_url })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[pujcovna/faktura-zaplaceno]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}
function pocetDni(a: string, b: string) {
  return Math.round((+new Date(b) - +new Date(a)) / 86400000) + 1
}

export interface HtmlFakturaOpts {
  jmeno:      string
  invoice_no: string
  pdf_url:    string
  polozka?:   string   // název autostanu
  startDate?: string   // ISO
  endDate?:   string   // ISO
}

export function htmlFaktura(opts: HtmlFakturaOpts): string {
  const { jmeno, invoice_no, pdf_url, polozka, startDate, endDate } = opts

  const termin = startDate && endDate
    ? `${formatDatum(startDate)} – ${formatDatum(endDate)}&nbsp;&nbsp;(${pocetDni(startDate, endDate)}&nbsp;${pocetDni(startDate,endDate) === 1 ? "den" : pocetDni(startDate,endDate) < 5 ? "dny" : "dní"})`
    : null

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <!-- hlavička -->
    <div style="background:#10b981;padding:28px 32px">
      <div style="font-size:32px;margin-bottom:6px">✅</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff">Platba přijata – rezervace potvrzena!</h1>
      <p style="margin:6px 0 0;font-size:14px;color:#d1fae5">stanujnaaute.cz</p>
    </div>

    <!-- tělo -->
    <div style="padding:28px 32px">

      <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6">
        Ahoj <strong>${jmeno}</strong>,<br>
        vaše platba byla úspěšně přijata a rezervace je potvrzena. Těšíme se na vás!
      </p>

      <!-- shrnutí rezervace -->
      ${polozka || termin ? `
      <div style="background:#f0fdf4;border-radius:10px;padding:14px 18px;margin-bottom:20px;border:1px solid #bbf7d0">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#16a34a;margin-bottom:8px">Vaše rezervace</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${polozka ? `<tr><td style="padding:3px 0;color:#6b7280;width:35%">Položka</td><td style="color:#111827;font-weight:600">${polozka}</td></tr>` : ""}
          ${termin  ? `<tr><td style="padding:3px 0;color:#6b7280">Termín</td><td style="color:#111827">${termin}</td></tr>` : ""}
        </table>
      </div>` : ""}

      <!-- faktura -->
      <div style="text-align:center;margin:24px 0">
        <a href="${pdf_url}"
           style="display:inline-block;background:#10b981;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none">
          📄 Stáhnout fakturu ${invoice_no}
        </a>
      </div>

      <!-- kauce -->
      <div style="background:#fffbeb;border-radius:10px;padding:16px 18px;margin-bottom:20px;border:1px solid #fde68a">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#b45309;margin-bottom:6px">💰 Kauce při vyzvednutí</div>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">
          Při převzetí autostanu je splatná <strong>kauce 5&nbsp;000&nbsp;Kč v hotovosti</strong>.
          Kauce bude vrácena po vrácení veškeré výbavy v pořádku.
        </p>
      </div>

      <!-- jak se dostat -->
      <div style="background:#f0f9ff;border-radius:10px;padding:16px 18px;margin-bottom:24px;border:1px solid #bae6fd">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#0369a1;margin-bottom:6px">📍 Jak nás najít</div>
        <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6">
          Na naší stránce najdete fotky místa, popis cesty a veškeré kontaktní informace.
        </p>
        <a href="https://stanujnaaute.cz/kontakt/"
           style="display:inline-block;background:#0ea5e9;color:#fff;padding:9px 20px;border-radius:7px;font-weight:600;font-size:14px;text-decoration:none">
          Zobrazit kontakt a popis cesty →
        </a>
      </div>

      <p style="margin:0 0 4px;font-size:14px;color:#6b7280">Máte otázky? Napište nebo zavolejte:</p>
      <a href="mailto:info@stanujnaaute.cz" style="color:#10b981;font-weight:600;font-size:14px">info@stanujnaaute.cz</a>

    </div>

    <!-- patička -->
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Stanuj na autě · stanujnaaute.cz</p>
    </div>
  </div>
  </body></html>`
}
