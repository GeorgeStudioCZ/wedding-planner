import { NextRequest, NextResponse } from "next/server"
import { sendMail } from "@/lib/mailer"

export interface StornoMailPayload {
  zakaznik: {
    jmeno: string
    email: string
  }
  polozka: string
  dateFrom: string   // ISO "2025-06-10"
  dateTo: string
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}

function htmlStorno(d: StornoMailPayload): string {
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <div style="background:#ef4444;padding:28px 32px">
      <div style="font-size:28px;margin-bottom:4px">❌</div>
      <h1 style="margin:0;font-size:20px;font-weight:800;color:#fff">Rezervace stornována</h1>
      <p style="margin:6px 0 0;font-size:14px;color:#fecaca">stanujnaute.cz</p>
    </div>

    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;font-size:15px;color:#374151">
        Ahoj <strong>${d.zakaznik.jmeno}</strong>,<br>
        Vaše rezervace byla stornována. Níže najdete shrnutí zrušené rezervace.
      </p>

      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;margin-bottom:10px">Stornovaná rezervace</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr>
            <td style="padding:4px 0;color:#6b7280;width:38%">Položka</td>
            <td style="padding:4px 0;color:#111827;font-weight:600">${d.polozka}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280">Termín od</td>
            <td style="padding:4px 0;color:#111827">${formatDatum(d.dateFrom)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280">Termín do</td>
            <td style="padding:4px 0;color:#111827">${formatDatum(d.dateTo)}</td>
          </tr>
        </table>
      </div>

      <p style="margin:0 0 6px;font-size:14px;color:#6b7280">Máte otázky? Napište nám:</p>
      <a href="mailto:info@stanujnaaute.cz" style="color:#ef4444;font-weight:600;font-size:14px">info@stanujnaaute.cz</a>
    </div>

    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Stanuj na autě · stanujnaaute.cz</p>
    </div>
  </div>
  </body></html>`
}

export async function POST(req: NextRequest) {
  try {
    const data: StornoMailPayload = await req.json()

    if (!data.zakaznik.email) {
      return NextResponse.json({ ok: false, error: "Zákazník nemá email" }, { status: 400 })
    }

    await sendMail({
      sluzba: "stany",
      to: data.zakaznik.email,
      subject: `Stornování rezervace – ${data.polozka}`,
      html: htmlStorno(data),
    })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[mail/storno-pujcovna]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
