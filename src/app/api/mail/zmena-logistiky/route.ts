import { NextRequest, NextResponse } from "next/server"
import { sendMail } from "@/lib/mailer"
import { logEmail } from "@/lib/email-log"
import { sendSms } from "@/lib/bulkgate"
import { logSms } from "@/lib/email-log"
import { textZmenaLogistiky } from "@/lib/sms-templates"

export interface ZmenaLogistikyPayload {
  zakaznik: {
    jmeno:     string
    prijmeni?: string
    email:     string
    telefon?:  string
  }
  polozka: string
  datumVyzvednuti: string   // ISO "2026-06-10"
  casVyzvednuti:   string   // "9:00 - 10:00"
  datumVraceni:    string
  casVraceni:      string
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}

function htmlZmena(d: ZmenaLogistikyPayload): string {
  const radekCas = (cas: string) => cas ? ` · ${cas} hod` : ""
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <div style="background:#10b981;padding:28px 32px">
      <div style="font-size:28px;margin-bottom:4px">📋</div>
      <h1 style="margin:0;font-size:20px;font-weight:800;color:#fff">Změna termínu vyzvednutí / vrácení</h1>
      <p style="margin:6px 0 0;font-size:14px;color:#a7f3d0">stanujnaaute.cz</p>
    </div>

    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;font-size:15px;color:#374151">
        Ahoj <strong>${d.zakaznik.jmeno}</strong>,<br>
        v Tvé rezervaci jsme aktualizovali termín vyzvednutí nebo vrácení. Níže najdeš aktuální informace.
      </p>

      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;margin-bottom:10px">Aktuální termíny</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr>
            <td style="padding:4px 0;color:#6b7280;width:38%">Položka</td>
            <td style="padding:4px 0;color:#111827;font-weight:600">${d.polozka}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280">⛺ Vyzvednutí</td>
            <td style="padding:4px 0;color:#111827;font-weight:600">${formatDatum(d.datumVyzvednuti)}${radekCas(d.casVyzvednuti)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280">🏁 Vrácení</td>
            <td style="padding:4px 0;color:#111827;font-weight:600">${formatDatum(d.datumVraceni)}${radekCas(d.casVraceni)}</td>
          </tr>
        </table>
      </div>

      <p style="margin:0 0 6px;font-size:14px;color:#6b7280">Otázky? Napište nám:</p>
      <a href="mailto:info@stanujnaaute.cz" style="color:#10b981;font-weight:600;font-size:14px">info@stanujnaaute.cz</a>
    </div>

    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Stanuj na autě · stanujnaaute.cz</p>
    </div>
  </div>
  </body></html>`
}

export async function POST(req: NextRequest) {
  try {
    const data: ZmenaLogistikyPayload = await req.json()

    if (!data.zakaznik.email) {
      return NextResponse.json({ ok: false, error: "Zákazník nemá email" }, { status: 400 })
    }

    const subj = `Změna termínu vyzvednutí/vrácení – ${data.polozka}`
    const html = htmlZmena(data)

    await sendMail({ sluzba: "stany", to: data.zakaznik.email, subject: subj, html })
    await logEmail({ sluzba: "stany", typ: "zmena-logistiky", to_email: data.zakaznik.email, to_name: data.zakaznik.jmeno, subject: subj, html })

    // SMS o změně logistiky
    if (data.zakaznik.telefon) {
      const smsText = await textZmenaLogistiky({
        jmeno:           data.zakaznik.jmeno,
        prijmeni:        data.zakaznik.prijmeni,
        polozka:         data.polozka,
        datumVyzvednuti: data.datumVyzvednuti,
        casVyzvednuti:   data.casVyzvednuti,
        datumVraceni:    data.datumVraceni,
        casVraceni:      data.casVraceni,
      })
      try {
        await sendSms(data.zakaznik.telefon, smsText)
        await logSms({ sluzba: "stany", typ: "sms-logistika", to_tel: data.zakaznik.telefon as string, to_name: data.zakaznik.jmeno, text: smsText })
      } catch (smsErr) {
        const smsMsg = smsErr instanceof Error ? smsErr.message : String(smsErr)
        console.error("[SMS] zmena-logistiky:", smsMsg)
        await logSms({ sluzba: "stany", typ: "sms-logistika", to_tel: data.zakaznik.telefon as string, to_name: data.zakaznik.jmeno, text: smsText, status: "error", error: smsMsg })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[mail/zmena-logistiky]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
