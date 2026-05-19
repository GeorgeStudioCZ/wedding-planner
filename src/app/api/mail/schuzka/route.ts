import { NextRequest, NextResponse } from "next/server"
import { sendMail } from "@/lib/mailer"

const NOTIFIKACE_EMAIL = "info@svatebni-video-hk.cz"

export interface SchuzkaMailPayload {
  jmeno: string
  email: string
  datum: string          // "2025-08-15"
  cas: string            // "10:00"
  typ_kontaktu: string   // "whatsapp" | "facetime" | "osobne"
  kontakt: string        // číslo / Apple ID / adresa
  datum_svadby: string | null
  otazky: string | null
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}

function kontaktLabel(typ: string, kontakt: string) {
  if (typ === "whatsapp")  return `📱 WhatsApp: <strong>${kontakt}</strong>`
  if (typ === "facetime")  return `📹 FaceTime: <strong>${kontakt}</strong>`
  return `🤝 Osobně: <strong>${kontakt}</strong>`
}

// ── Email zákazníkovi ─────────────────────────────────────────────────────────
function htmlZakaznik(d: SchuzkaMailPayload): string {
  const datumFmt = formatDatum(d.datum)
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
<div style="max-width:540px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.10)">

  <!-- Hlavička -->
  <div style="background:linear-gradient(135deg,#be123c,#9f1239);padding:32px 32px 28px">
    <div style="font-size:32px;margin-bottom:8px">💍</div>
    <h1 style="margin:0;font-size:21px;font-weight:800;color:#fff;line-height:1.2">Schůzka potvrzena!</h1>
    <p style="margin:8px 0 0;font-size:14px;color:#fecdd3">svatebni-video-hk.cz</p>
  </div>

  <!-- Tělo -->
  <div style="padding:28px 32px">
    <p style="margin:0 0 18px;font-size:15px;color:#374151">Dobrý den <strong>${d.jmeno}</strong>,</p>
    <p style="margin:0 0 22px;font-size:14px;color:#6b7280;line-height:1.6">
      vaše rezervace konzultace byla přijata. Níže najdete shrnutí termínu.
      Ozvu se vám pro potvrzení a případné upřesnění.
    </p>

    <!-- Box s termínem -->
    <div style="background:#fff1f2;border:1.5px solid #fecdd3;border-radius:12px;padding:18px 20px;margin-bottom:22px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#be123c;margin-bottom:12px">Termín schůzky</div>
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

    <p style="margin:0 0 6px;font-size:14px;color:#6b7280;line-height:1.6">
      Pokud máte jakékoliv dotazy nebo potřebujete termín změnit, napište mi přímo na
      <a href="mailto:${NOTIFIKACE_EMAIL}" style="color:#be123c">${NOTIFIKACE_EMAIL}</a>.
    </p>
  </div>

  <!-- Patička -->
  <div style="padding:20px 32px;background:#fafaf9;border-top:1px solid #f3f4f6;text-align:center">
    <p style="margin:0;font-size:12px;color:#9ca3af">
      Jiří Larva · Svatební video HK · <a href="https://www.svatebni-video-hk.cz" style="color:#be123c;text-decoration:none">svatebni-video-hk.cz</a>
    </p>
  </div>

</div>
</body></html>`
}

// ── Notifikace mně ────────────────────────────────────────────────────────────
function htmlNotifikace(d: SchuzkaMailPayload): string {
  const datumFmt = formatDatum(d.datum)
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
<div style="max-width:480px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

  <div style="background:#111827;padding:20px 24px;display:flex;align-items:center;gap:12px">
    <div style="font-size:24px">📅</div>
    <div>
      <div style="font-size:16px;font-weight:800;color:#fff">Nová schůzka!</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px">Rezervace z webu</div>
    </div>
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
       style="font-size:12px;color:#be123c;text-decoration:none">
      → Zobrazit v CRM
    </a>
  </div>

</div>
</body></html>`
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const data: SchuzkaMailPayload = await req.json()

    // Oba emaily paralelně
    await Promise.all([
      // Potvrzení zákazníkovi
      sendMail({
        sluzba:  "svatby",
        to:      data.email,
        subject: `Potvrzení schůzky — ${formatDatum(data.datum)} v ${data.cas}`,
        html:    htmlZakaznik(data),
      }),
      // Notifikace mně
      sendMail({
        sluzba:  "svatby",
        to:      NOTIFIKACE_EMAIL,
        subject: `📅 Nová schůzka: ${data.jmeno} — ${formatDatum(data.datum)} v ${data.cas}`,
        html:    htmlNotifikace(data),
        replyTo: data.email,
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Schuzka mail error:", err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
