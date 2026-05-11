import { NextRequest, NextResponse } from "next/server"
import { sendMail } from "@/lib/mailer"

const NOTIFIKACE_EMAIL = "info@stanujnaaute.cz"

export interface RezervaceMailPayload {
  zakaznik: {
    jmeno: string
    prijmeni: string
    email: string
    telefon: string
  }
  polozka: string          // zobrazovaný název (např. "Autostan MALÁ Alaska pro 2 osoby")
  dateFrom: string         // ISO "2025-06-10"
  dateTo: string
  dni: number
  vozidlo: string
  casVyzvednuti: string
  casVraceni: string
  pricniky: string         // "vlastni" | "pujcit" | ""
  poznamka: string
  drzakVariant: string     // "Držák pro 3 kola" | "" apod.
  prisl: { nazev: string; cnt: number; cena: number | null }[]
  cenaStan: number | null
  montazPopl: number
  celkem: number
  groupId: string
  platba?: {
    vs: string
    invoice_no: string
    cislo_uctu: string
    qr_url: string
  }
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}
function formatKc(c: number) {
  return Math.round(c).toLocaleString("cs-CZ") + " Kč"
}

// ── HTML šablona — potvrzení zákazníkovi ─────────────────────────────────────
function htmlZakaznik(d: RezervaceMailPayload): string {
  const jmeno = `${d.zakaznik.jmeno} ${d.zakaznik.prijmeni}`
  const prislRows = d.prisl.map(r =>
    `<tr><td style="padding:4px 0;color:#374151">${r.nazev} ×${r.cnt}</td>
         <td style="padding:4px 0;color:#374151;text-align:right">${r.cena != null ? formatKc(r.cena * r.cnt) : "—"}</td></tr>`
  ).join("")

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <!-- hlavička -->
    <div style="background:#10b981;padding:28px 32px">
      <div style="font-size:28px;margin-bottom:4px">⛺</div>
      <h1 style="margin:0;font-size:20px;font-weight:800;color:#fff">Rezervace přijata!</h1>
      <p style="margin:6px 0 0;font-size:14px;color:#d1fae5">stanujnaute.cz</p>
    </div>

    <!-- tělo -->
    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;font-size:15px;color:#374151">Ahoj <strong>${jmeno}</strong>,<br>
      děkujeme za vaši rezervaci. Níže najdete shrnutí objednávky. Brzy se vám ozveme pro potvrzení termínu.</p>

      <!-- rezervace -->
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;margin-bottom:10px">Rezervace</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;width:40%">Položka</td>
              <td style="padding:4px 0;color:#111827;font-weight:600">${d.polozka}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Výpůjčka od</td>
              <td style="padding:4px 0;color:#111827">${formatDatum(d.dateFrom)} &nbsp;${d.casVyzvednuti}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Vrácení do</td>
              <td style="padding:4px 0;color:#111827">${formatDatum(d.dateTo)} &nbsp;${d.casVraceni}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Počet dní</td>
              <td style="padding:4px 0;color:#111827">${d.dni} ${d.dni === 1 ? "den" : d.dni < 5 ? "dny" : "dní"}</td></tr>
          ${d.vozidlo ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Vozidlo</td>
              <td style="padding:4px 0;color:#111827">${d.vozidlo}</td></tr>` : ""}
          ${d.pricniky === "pujcit" ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Příčníky</td>
              <td style="padding:4px 0;color:#111827">Půjčení příčníků</td></tr>` : ""}
          ${d.drzakVariant ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Varianta</td>
              <td style="padding:4px 0;color:#111827">${d.drzakVariant}</td></tr>` : ""}
        </table>
      </div>

      <!-- příslušenství -->
      ${d.prisl.length > 0 ? `
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;margin-bottom:10px">Příslušenství</div>
        <table style="width:100%;border-collapse:collapse">
          ${prislRows}
        </table>
      </div>` : ""}

      <!-- cena -->
      <div style="background:#ecfdf5;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6ee7b7;margin-bottom:10px">Předběžná cena</div>
        <table style="width:100%;border-collapse:collapse">
          ${d.cenaStan != null ? `<tr><td style="padding:3px 0;color:#065f46;font-size:13px">${d.polozka}</td>
              <td style="padding:3px 0;color:#065f46;text-align:right">${formatKc(d.cenaStan)}</td></tr>` : ""}
          ${d.prisl.map(r => r.cena != null ? `<tr><td style="padding:3px 0;color:#065f46;font-size:13px">${r.nazev} ×${r.cnt}</td>
              <td style="padding:3px 0;color:#065f46;text-align:right">${formatKc(r.cena * r.cnt)}</td></tr>` : "").join("")}
          ${d.montazPopl > 0 ? `<tr><td style="padding:3px 0;color:#065f46;font-size:13px">Poplatek za montáž</td>
              <td style="padding:3px 0;color:#065f46;text-align:right">${formatKc(d.montazPopl)}</td></tr>` : ""}
          <tr><td colspan="2" style="padding-top:8px;border-top:1px solid #a7f3d0"></td></tr>
          <tr><td style="padding:4px 0;color:#065f46;font-weight:700">Celkem s DPH</td>
              <td style="padding:4px 0;color:#065f46;font-weight:700;text-align:right;font-size:16px">${formatKc(d.celkem)}</td></tr>
        </table>
      </div>

      ${d.poznamka ? `<div style="background:#fef9c3;border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#713f12">
        <strong>Vaše poznámka:</strong> ${d.poznamka}</div>` : ""}

      <!-- platební údaje -->
      ${d.platba ? `
      <div style="background:#fffbeb;border-radius:8px;border:2px solid #f59e0b;padding:16px 20px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#b45309;margin-bottom:12px">
          💳 Platební údaje — ${d.platba.invoice_no}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${d.platba.cislo_uctu ? `<tr><td style="padding:4px 0;color:#6b7280;width:44%">Číslo účtu</td>
              <td style="padding:4px 0;color:#111827;font-weight:600;font-family:monospace">${d.platba.cislo_uctu}</td></tr>` : ""}
          <tr><td style="padding:4px 0;color:#6b7280">Variabilní symbol</td>
              <td style="padding:4px 0;color:#111827;font-weight:700;font-size:16px;font-family:monospace">${d.platba.vs}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280">Částka</td>
              <td style="padding:4px 0;color:#111827;font-weight:700;font-size:16px">${formatKc(d.celkem)}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280">Měna</td>
              <td style="padding:4px 0;color:#111827">CZK</td></tr>
        </table>
        ${d.platba.qr_url ? `
        <div style="margin-top:14px;text-align:center">
          <img src="${d.platba.qr_url}" width="160" height="160" alt="QR platba"
               style="border-radius:8px;border:1px solid #e5e7eb"/>
          <div style="font-size:11px;color:#9ca3af;margin-top:4px">Naskenujte pro rychlou platbu</div>
        </div>` : ""}
      </div>` : ""}

      <p style="margin:0 0 6px;font-size:14px;color:#6b7280">Máte otázky? Napište nám:</p>
      <a href="mailto:info@stanujnaaute.cz" style="color:#10b981;font-weight:600;font-size:14px">info@stanujnaaute.cz</a>
    </div>

    <!-- patička -->
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Stanuj na autě · stanujnaaute.cz</p>
    </div>
  </div>
  </body></html>`
}

// ── HTML šablona — notifikace pro majitele ───────────────────────────────────
function htmlNotifikace(d: RezervaceMailPayload): string {
  const jmeno = `${d.zakaznik.jmeno} ${d.zakaznik.prijmeni}`
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <div style="background:#7c3aed;padding:20px 28px">
      <h1 style="margin:0;font-size:17px;font-weight:800;color:#fff">🔔 Nová web-rezervace</h1>
    </div>
    <div style="padding:24px 28px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280;width:38%">Zákazník</td>
            <td style="padding:8px 12px;color:#111827;font-weight:600">${jmeno}</td></tr>
        <tr><td style="padding:8px 12px;color:#6b7280">Email</td>
            <td style="padding:8px 12px"><a href="mailto:${d.zakaznik.email}" style="color:#7c3aed">${d.zakaznik.email}</a></td></tr>
        <tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280">Telefon</td>
            <td style="padding:8px 12px;color:#111827">${d.zakaznik.telefon}</td></tr>
        <tr><td style="padding:8px 12px;color:#6b7280">Položka</td>
            <td style="padding:8px 12px;color:#111827;font-weight:600">${d.polozka}</td></tr>
        <tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280">Termín</td>
            <td style="padding:8px 12px;color:#111827">${formatDatum(d.dateFrom)} – ${formatDatum(d.dateTo)} (${d.dni} ${d.dni === 1 ? "den" : d.dni < 5 ? "dny" : "dní"})</td></tr>
        <tr><td style="padding:8px 12px;color:#6b7280">Vyzvednutí</td>
            <td style="padding:8px 12px;color:#111827">${d.casVyzvednuti}</td></tr>
        <tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280">Vrácení</td>
            <td style="padding:8px 12px;color:#111827">${d.casVraceni}</td></tr>
        ${d.vozidlo ? `<tr><td style="padding:8px 12px;color:#6b7280">Vozidlo</td>
            <td style="padding:8px 12px;color:#111827">${d.vozidlo}</td></tr>` : ""}
        ${d.prisl.length > 0 ? `<tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280">Příslušenství</td>
            <td style="padding:8px 12px;color:#111827">${d.prisl.map(r => `${r.nazev} ×${r.cnt}`).join(", ")}</td></tr>` : ""}
        ${d.pricniky === "pujcit" ? `<tr><td style="padding:8px 12px;color:#6b7280">Příčníky</td>
            <td style="padding:8px 12px;color:#10b981;font-weight:600">Půjčit</td></tr>` : ""}
        ${d.drzakVariant ? `<tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280">Varianta držáku</td>
            <td style="padding:8px 12px;color:#111827">${d.drzakVariant}</td></tr>` : ""}
        <tr><td style="padding:8px 12px;color:#6b7280;font-weight:700">Celkem s DPH</td>
            <td style="padding:8px 12px;color:#111827;font-weight:700;font-size:16px">${formatKc(d.celkem)}</td></tr>
        ${d.poznamka ? `<tr style="background:#fef9c3"><td style="padding:8px 12px;color:#6b7280">Poznámka</td>
            <td style="padding:8px 12px;color:#713f12">${d.poznamka}</td></tr>` : ""}
      </table>

      <div style="margin-top:20px;text-align:center">
        <a href="https://myplanner.svatebni-video-hk.cz/pujcovna"
           style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 24px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">
          Otevřít v CRM →
        </a>
      </div>
    </div>
  </div>
  </body></html>`
}

// ── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const data: RezervaceMailPayload = await req.json()

    await Promise.all([
      // 1. Potvrzení zákazníkovi
      sendMail({
        sluzba: "stany",
        to: data.zakaznik.email,
        subject: `Potvrzení rezervace – ${data.polozka}`,
        html: htmlZakaznik(data),
      }),
      // 2. Notifikace majiteli
      sendMail({
        sluzba: "stany",
        to: NOTIFIKACE_EMAIL,
        subject: `Nová rezervace: ${data.zakaznik.jmeno} ${data.zakaznik.prijmeni} – ${data.polozka}`,
        html: htmlNotifikace(data),
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[mail/rezervace-pujcovna]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
