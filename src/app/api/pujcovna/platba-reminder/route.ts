// Vercel Cron: každý den v 7:00 UTC (hodinu po fio-sync)
// Najde nezaplacené web-rezervace starší 48h a pošle připomínku platby

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendMail } from "@/lib/mailer"
import { logEmail } from "@/lib/email-log"
import { sendSms } from "@/lib/bulkgate"
import { logSms } from "@/lib/email-log"
import { textUpominkaPlatby } from "@/lib/sms-templates"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const CISLO_UCTU = process.env.SF_CISLO_UCTU ?? ""

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}

function htmlReminder(data: {
  jmeno:     string
  polozka:   string
  dateFrom:  string
  dateTo:    string
  vs:        string
  castka:    string
}): string {
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <div style="background:#f97316;padding:28px 32px">
      <div style="font-size:28px;margin-bottom:4px">⏰</div>
      <h1 style="margin:0;font-size:20px;font-weight:800;color:#fff">Připomínka platby rezervace</h1>
      <p style="margin:6px 0 0;font-size:14px;color:#ffedd5">stanujnaaute.cz</p>
    </div>

    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;font-size:15px;color:#374151">
        Ahoj <strong>${data.jmeno}</strong>,<br>
        upozorňujeme, že vaše rezervace zatím nebyla uhrazena.
      </p>

      <div style="background:#fff7ed;border:2px solid #f97316;border-radius:8px;padding:14px 18px;margin-bottom:20px">
        <div style="font-size:12px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">
          ⚠️ Zbývá méně než 24 hodin
        </div>
        <p style="margin:0;font-size:13px;color:#9a3412;line-height:1.6">
          Rezervace bude <strong>automaticky stornována po 72 hodinách</strong> od jejího vytvoření.<br>
          Prosíme, proveďte platbu co nejdříve.
        </p>
      </div>

      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;margin-bottom:10px">Vaše rezervace</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr>
            <td style="padding:4px 0;color:#6b7280;width:40%">Položka</td>
            <td style="padding:4px 0;color:#111827;font-weight:600">${data.polozka}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280">Termín od</td>
            <td style="padding:4px 0;color:#111827">${formatDatum(data.dateFrom)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280">Termín do</td>
            <td style="padding:4px 0;color:#111827">${formatDatum(data.dateTo)}</td>
          </tr>
        </table>
      </div>

      <div style="background:#fffbeb;border-radius:8px;border:2px solid #f59e0b;padding:16px 20px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#b45309;margin-bottom:10px">
          💳 Platební údaje
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${CISLO_UCTU ? `<tr>
            <td style="padding:4px 0;color:#6b7280;width:44%">Číslo účtu</td>
            <td style="padding:4px 0;color:#111827;font-weight:600;font-family:monospace">${CISLO_UCTU}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:4px 0;color:#6b7280">Variabilní symbol</td>
            <td style="padding:4px 0;color:#111827;font-weight:700;font-size:16px;font-family:monospace">${data.vs}</td>
          </tr>
          ${data.castka ? `<tr>
            <td style="padding:4px 0;color:#6b7280">Částka</td>
            <td style="padding:4px 0;color:#111827;font-weight:700;font-size:16px">${data.castka} Kč</td>
          </tr>` : ""}
        </table>
      </div>

      <p style="margin:0 0 6px;font-size:14px;color:#6b7280">Otázky? Napište nám:</p>
      <a href="mailto:info@stanujnaaute.cz" style="color:#f97316;font-weight:600;font-size:14px">info@stanujnaaute.cz</a>
    </div>

    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Stanuj na autě · stanujnaaute.cz</p>
    </div>
  </div>
  </body></html>`
}

export async function GET() {
  try {
    const now = Date.now()
    const cutoff48h = new Date(now - 48 * 3600 * 1000).toISOString()

    // Najdi nezaplacené rezervace starší 48h, které ještě nedostaly upomínku
    // Bez horního limitu — pripominacka_sent=true zabrání duplicitám
    const { data: rezervace, error } = await sb
      .from("pujcovna_rezervace")
      .select("*, pujcovna_polozky(name)")
      .in("stav", ["web-rezervace", "rezervace", "cekam-platbu"])
      .lt("created_at", cutoff48h)
      .or("pripominacka_sent.is.null,pripominacka_sent.eq.false")

    if (error) throw new Error(error.message ?? JSON.stringify(error))
    if (!rezervace || rezervace.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: "Žádné rezervace k upomínání" })
    }

    const results: { id: number; result: string }[] = []

    for (const rez of rezervace) {
      try {
        if (!rez.zakaznik_id) { results.push({ id: rez.id, result: "skip_no_customer" }); continue }

        const { data: zak } = await sb
          .from("zakaznici")
          .select("jmeno, prijmeni, email, telefon")
          .eq("id", rez.zakaznik_id)
          .single()

        if (!zak?.email) { results.push({ id: rez.id, result: "skip_no_email" }); continue }

        const polozka = (rez.pujcovna_polozky as { name: string } | null)?.name ?? "Výpůjčka"
        const jmeno   = `${zak.jmeno} ${zak.prijmeni}`.trim()

        const html = htmlReminder({
          jmeno,
          polozka,
          dateFrom: rez.start_date,
          dateTo:   rez.end_date,
          vs:       rez.sf_vs ?? "",
          castka:   "",  // bez částky — zákazník ji má v původním emailu
        })

        const subj = `Připomínka platby – ${polozka}`

        await sendMail({ sluzba: "stany", to: zak.email, subject: subj, html })
        await logEmail({
          sluzba: "stany",
          typ: "platba-reminder",
          to_email: zak.email,
          to_name: jmeno,
          subject: subj,
          html,
        })

        await sb.from("pujcovna_rezervace").update({ pripominacka_sent: true }).eq("id", rez.id)

        // SMS upomínka
        if (zak.telefon) {
          const smsText = await textUpominkaPlatby({ vs: rez.sf_vs ?? "", polozka, jmeno: zak.jmeno ?? "", prijmeni: zak.prijmeni ?? "" })
          try {
            await sendSms(zak.telefon, smsText)
            await logSms({ sluzba: "stany", typ: "sms-upominka", to_tel: zak.telefon as string, to_name: jmeno, text: smsText })
          } catch (smsErr) {
            const smsMsg = smsErr instanceof Error ? smsErr.message : String(smsErr)
            console.error("[SMS] platba-reminder:", smsMsg)
            await logSms({ sluzba: "stany", typ: "sms-upominka", to_tel: zak.telefon as string, to_name: jmeno, text: smsText, status: "error", error: smsMsg })
          }
        }

        // Zapsat do historie výpůjčky
        await sb.from("pujcovna_rezervace_historie").insert([{
          rezervace_id: rez.id,
          stav: "platba-reminder",
          poznamka: "Odeslaná upomínka platby zákazníkovi",
        }])

        results.push({ id: rez.id, result: "sent" })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[platba-reminder] rez ${rez.id}:`, msg)
        results.push({ id: rez.id, result: `error: ${msg}` })
      }
    }

    const sent = results.filter(r => r.result === "sent").length
    return NextResponse.json({ ok: true, sent, total: rezervace.length, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[platba-reminder]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
