import { NextRequest, NextResponse } from "next/server"
import { sendMail } from "@/lib/mailer"

const NOTIFIKACE_EMAIL = "info@svatebni-video-hk.cz"

export interface SchuzkaMailPayload {
  typ: "zadost" | "potvrzeni"   // zadost = přijato, potvrzeni = potvrzeno
  jmeno: string
  email: string
  datum: string          // "2025-08-15"
  cas: string            // "10:00"
  typ_kontaktu: string   // "whatsapp" | "facetime" | "osobne"
  kontakt: string
  datum_svadby: string | null
  otazky: string | null
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}

function kontaktLabel(typ: string, kontakt: string) {
  if (typ === "whatsapp") return `📱 WhatsApp: <strong>${kontakt}</strong>`
  if (typ === "facetime") return `📹 FaceTime: <strong>${kontakt}</strong>`
  return `🤝 Osobně: <strong>${kontakt}</strong>`
}

// ── Email zákazníkovi — žádost přijata ───────────────────────────────────────
function htmlZadost(d: SchuzkaMailPayload): string {
  const datumFmt = formatDatum(d.datum)
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
<div style="max-width:540px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.10)">

  <div style="background:linear-gradient(135deg,#be123c,#9f1239);padding:32px 32px 28px">
    <div style="font-size:32px;margin-bottom:8px">📋</div>
    <h1 style="margin:0;font-size:21px;font-weight:800;color:#fff;line-height:1.2">Žádost přijata!</h1>
    <p style="margin:8px 0 0;font-size:14px;color:#fecdd3">svatebni-video-hk.cz</p>
  </div>

  <div style="padding:28px 32px">
    <p style="margin:0 0 18px;font-size:15px;color:#374151">Dobrý den <strong>${d.jmeno}</strong>,</p>
    <p style="margin:0 0 22px;font-size:14px;color:#6b7280;line-height:1.6">
      vaše žádost o konzultaci na termín <strong>${datumFmt} v ${d.cas}</strong> byla úspěšně přijata.
      <br><br>
      Brzy se vám ozvu a termín s vámi potvrdím. Pokud budete potřebovat termín změnit nebo máte jakýkoliv dotaz, napište mi.
    </p>

    <div style="background:#fafaf9;border:1px solid #f0ede8;border-radius:12px;padding:18px 20px;margin-bottom:22px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:12px">Požadovaný termín</div>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#9ca3af;width:40%">Datum</td>
          <td style="padding:4px 0;font-size:14px;font-weight:700;color:#111827">${datumFmt}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#9ca3af">Čas</td>
          <td style="padding:4px 0;font-size:14px;font-weight:700;color:#111827">${d.cas}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#9ca3af">Kontakt</td>
          <td style="padding:4px 0;font-size:14px;color:#374151">${kontaktLabel(d.typ_kontaktu, d.kontakt)}</td>
        </tr>
        ${d.datum_svadby ? `<tr>
          <td style="padding:4px 0;font-size:13px;color:#9ca3af">Datum svatby</td>
          <td style="padding:4px 0;font-size:14px;color:#374151">${formatDatum(d.datum_svadby)}</td>
        </tr>` : ""}
      </table>
    </div>

    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">
      Dotazy: <a href="mailto:${NOTIFIKACE_EMAIL}" style="color:#be123c">${NOTIFIKACE_EMAIL}</a>
    </p>
  </div>

  <div style="padding:20px 32px;background:#fafaf9;border-top:1px solid #f3f4f6;text-align:center">
    <p style="margin:0;font-size:12px;color:#9ca3af">
      Jiří Larva · Svatební video HK · <a href="https://www.svatebni-video-hk.cz" style="color:#be123c;text-decoration:none">svatebni-video-hk.cz</a>
    </p>
  </div>
</div>
</body></html>`
}

// ── Email zákazníkovi — schůzka potvrzena ────────────────────────────────────
function htmlPotvrzeni(d: SchuzkaMailPayload): string {
  const datumFmt = formatDatum(d.datum)
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
<div style="max-width:540px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.10)">

  <div style="background:linear-gradient(135deg,#be123c,#9f1239);padding:32px 32px 28px">
    <div style="font-size:32px;margin-bottom:8px">✅</div>
    <h1 style="margin:0;font-size:21px;font-weight:800;color:#fff;line-height:1.2">Schůzka potvrzena!</h1>
    <p style="margin:8px 0 0;font-size:14px;color:#fecdd3">svatebni-video-hk.cz</p>
  </div>

  <div style="padding:28px 32px">
    <p style="margin:0 0 18px;font-size:15px;color:#374151">Dobrý den <strong>${d.jmeno}</strong>,</p>
    <p style="margin:0 0 22px;font-size:14px;color:#6b7280;line-height:1.6">
      těším se na naši konzultaci! Níže najdete potvrzený termín.
    </p>

    <div style="background:#fff1f2;border:1.5px solid #fecdd3;border-radius:12px;padding:18px 20px;margin-bottom:22px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#be123c;margin-bottom:12px">✓ Potvrzený termín</div>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#9ca3af;width:40%">Datum</td>
          <td style="padding:4px 0;font-size:14px;font-weight:700;color:#111827">${datumFmt}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#9ca3af">Čas</td>
          <td style="padding:4px 0;font-size:14px;font-weight:700;color:#111827">${d.cas}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#9ca3af">Kontakt</td>
          <td style="padding:4px 0;font-size:14px;color:#374151">${kontaktLabel(d.typ_kontaktu, d.kontakt)}</td>
        </tr>
        ${d.datum_svadby ? `<tr>
          <td style="padding:4px 0;font-size:13px;color:#9ca3af">Datum svatby</td>
          <td style="padding:4px 0;font-size:14px;color:#374151">${formatDatum(d.datum_svadby)}</td>
        </tr>` : ""}
      </table>
    </div>

    ${d.otazky ? `
    <div style="background:#fafaf9;border-radius:10px;padding:14px 16px;margin-bottom:22px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px">Vaše otázky</div>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap">${d.otazky}</p>
    </div>` : ""}

    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">
      Potřebujete termín změnit? Napište na <a href="mailto:${NOTIFIKACE_EMAIL}" style="color:#be123c">${NOTIFIKACE_EMAIL}</a>
    </p>
  </div>

  <div style="padding:20px 32px;background:#fafaf9;border-top:1px solid #f3f4f6;text-align:center">
    <p style="margin:0;font-size:12px;color:#9ca3af">
      Jiří Larva · Svatební video HK · <a href="https://www.svatebni-video-hk.cz" style="color:#be123c;text-decoration:none">svatebni-video-hk.cz</a>
    </p>
  </div>
</div>
</body></html>`
}

// ── Notifikace mně — jen pro žádost ──────────────────────────────────────────
function htmlNotifikace(d: SchuzkaMailPayload): string {
  const datumFmt = formatDatum(d.datum)
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
<div style="max-width:480px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

  <div style="background:#111827;padding:20px 24px">
    <div style="font-size:24px;margin-bottom:4px">📅</div>
    <div style="font-size:16px;font-weight:800;color:#fff">Nová žádost o schůzku</div>
    <div style="font-size:12px;color:#9ca3af;margin-top:2px">Rezervace z webu — čeká na potvrzení</div>
  </div>

  <div style="padding:20px 24px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af;width:38%">Jméno</td>
          <td style="padding:5px 0;font-size:14px;font-weight:700;color:#111">${d.jmeno}</td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af">Email</td>
          <td style="padding:5px 0;font-size:14px;color:#374151"><a href="mailto:${d.email}" style="color:#be123c">${d.email}</a></td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af">Datum</td>
          <td style="padding:5px 0;font-size:14px;font-weight:700;color:#111">${datumFmt}</td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af">Čas</td>
          <td style="padding:5px 0;font-size:14px;font-weight:700;color:#111">${d.cas}</td></tr>
      <tr><td style="padding:5px 0;font-size:12px;color:#9ca3af">Kontakt</td>
          <td style="padding:5px 0;font-size:14px;color:#374151">${kontaktLabel(d.typ_kontaktu, d.kontakt)}</td></tr>
      ${d.datum_svadby ? `<tr><td style="padding:5px 0;font-size:12px;color:#9ca3af">Datum svatby</td>
          <td style="padding:5px 0;font-size:14px;color:#374151">${formatDatum(d.datum_svadby)}</td></tr>` : ""}
    </table>

    ${d.otazky ? `
    <div style="margin-top:16px;padding:12px 14px;background:#fafaf9;border-radius:8px;border-left:3px solid #be123c">
      <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;margin-bottom:6px">Otázky klienta</div>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap">${d.otazky}</p>
    </div>` : ""}
  </div>

  <div style="padding:14px 24px;background:#fafaf9;border-top:1px solid #f3f4f6">
    <a href="https://myplanner.svatebni-video-hk.cz/svatby/schuzky"
       style="font-size:13px;font-weight:600;color:#be123c;text-decoration:none">
      → Potvrdit v CRM
    </a>
  </div>
</div>
</body></html>`
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const data: SchuzkaMailPayload = await req.json()

    if (data.typ === "zadost") {
      // Žádost: email zákazníkovi + notifikace mně
      await Promise.all([
        sendMail({
          sluzba:  "svatby",
          to:      data.email,
          subject: `Žádost o schůzku přijata — ${formatDatum(data.datum)} v ${data.cas}`,
          html:    htmlZadost(data),
        }),
        sendMail({
          sluzba:  "svatby",
          to:      NOTIFIKACE_EMAIL,
          subject: `📅 Nová žádost: ${data.jmeno} — ${formatDatum(data.datum)} v ${data.cas}`,
          html:    htmlNotifikace(data),
          replyTo: data.email,
        }),
      ])
    } else {
      // Potvrzení: email zákazníkovi
      await sendMail({
        sluzba:  "svatby",
        to:      data.email,
        subject: `✅ Schůzka potvrzena — ${formatDatum(data.datum)} v ${data.cas}`,
        html:    htmlPotvrzeni(data),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Schuzka mail error:", err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
