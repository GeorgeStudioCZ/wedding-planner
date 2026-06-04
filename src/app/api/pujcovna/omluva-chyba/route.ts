// Jednorázová omluva zákazníkům kteří dostali chybnou upomínku platby
// GET /api/pujcovna/omluva-chyba

import { NextResponse }       from "next/server"
import { createClient }       from "@supabase/supabase-js"
import { sendMail }           from "@/lib/mailer"
import { logEmail }           from "@/lib/email-log"
import { sendSms }            from "@/lib/bulkgate"
import { logSms }             from "@/lib/email-log"

const CHYBNE_IDS = [46, 24, 25, 51, 53, 54, 56, 57, 58, 59, 60, 61, 62, 63, 121]

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function htmlOmluva(jmeno: string): string {
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
<div style="max-width:540px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.10)">

  <div style="background:#f97316;padding:28px 32px">
    <div style="font-size:32px;margin-bottom:8px">🙏</div>
    <h1 style="margin:0;font-size:20px;font-weight:800;color:#fff">Omlouváme se za chybný email</h1>
    <p style="margin:8px 0 0;font-size:14px;color:#ffedd5">stanujnaaute.cz</p>
  </div>

  <div style="padding:28px 32px">
    <p style="margin:0 0 18px;font-size:15px;color:#374151">
      Dobrý den${jmeno ? ` <strong>${jmeno}</strong>` : ""},
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.7">
      omlouváme se za email s upomínkou platby, který vám byl dnes chybně odeslán naším systémem.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.7">
      Šlo o <strong>technickou chybu</strong> — email se vás netýká a prosíme, abyste ho ignorovali.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7">
      Máte-li jakékoli dotazy, neváhejte nás kontaktovat na
      <a href="mailto:info@stanujnaaute.cz" style="color:#f97316">info@stanujnaaute.cz</a>.
    </p>
    <p style="margin:0;font-size:14px;color:#374151">
      Ještě jednou se omlouváme za způsobené nepříjemnosti.<br>
      <strong>Tým Stanuj na autě</strong>
    </p>
  </div>

  <div style="padding:16px 32px;background:#fafaf9;border-top:1px solid #f3f4f6;text-align:center">
    <p style="margin:0;font-size:12px;color:#9ca3af">Stanuj na autě · stanujnaaute.cz</p>
  </div>
</div>
</body></html>`
}

const smsOmluvaText = "Omlouváme se za chybný email s upomínkou platby. Šlo o technickou chybu systému — email se vás netýká. Tým Stanuj na autě"

export async function GET() {
  const results: { id: number; jmeno: string; result: string }[] = []

  for (const id of CHYBNE_IDS) {
    try {
      // Načti rezervaci a zákazníka
      const { data: rez } = await sb
        .from("pujcovna_rezervace")
        .select("id, zakaznik_id, sf_platba_data")
        .eq("id", id)
        .single()

      if (!rez) { results.push({ id, jmeno: "", result: "skip_no_rez" }); continue }

      const platba = (rez.sf_platba_data ?? {}) as { klient?: { jmeno_display?: string; email?: string; telefon?: string } }
      let email   = platba.klient?.email   ?? ""
      let telefon = platba.klient?.telefon ?? ""
      let jmeno   = platba.klient?.jmeno_display ?? ""

      if ((!email || !jmeno) && rez.zakaznik_id) {
        const { data: zak } = await sb
          .from("zakaznici")
          .select("jmeno, prijmeni, email, telefon")
          .eq("id", rez.zakaznik_id)
          .maybeSingle()
        if (zak) {
          if (!email && zak.email)     email   = zak.email
          if (!telefon && zak.telefon) telefon = zak.telefon
          if (!jmeno)                  jmeno   = `${zak.jmeno ?? ""} ${zak.prijmeni ?? ""}`.trim()
        }
      }

      const sent: string[] = []

      // Email
      if (email) {
        const subj = "Omlouváme se — chybný email"
        const html = htmlOmluva(jmeno)
        try {
          await sendMail({ sluzba: "stany", to: email, subject: subj, html })
          await logEmail({ sluzba: "stany", typ: "omluva-chyba", to_email: email, to_name: jmeno, subject: subj, html })
          sent.push("email")
        } catch (e) {
          sent.push(`email_err: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // SMS
      if (telefon) {
        try {
          await sendSms(telefon, smsOmluvaText)
          await logSms({ sluzba: "stany", typ: "omluva-chyba", to_tel: telefon, to_name: jmeno, text: smsOmluvaText })
          sent.push("sms")
        } catch (e) {
          sent.push(`sms_err: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      results.push({ id, jmeno, result: sent.length ? sent.join("+") : "skip_no_contact" })
    } catch (err) {
      results.push({ id, jmeno: "", result: `error: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  const sent = results.filter(r => r.result.includes("email") || r.result.includes("sms")).length
  return NextResponse.json({ ok: true, sent, total: CHYBNE_IDS.length, results })
}
