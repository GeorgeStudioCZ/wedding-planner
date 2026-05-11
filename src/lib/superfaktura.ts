// SuperFaktura API — Czech Republic
// Docs: https://github.com/superfaktura/docs

import { bezDPH } from "@/lib/dph"

const SF_BASE       = "https://moje.superfaktura.cz"
const SF_MODULE     = "SvatebniCRM"

// Číselné řady půjčovny stanů
const SEQ_ZALOHA    = 372113   // "Zálohová faktura - STANY"
const SEQ_FAKTURA   = 372111   // "Faktura - STANY"
const BANK_ACC_ID   = 34491    // Bankovní účet v SF

function authHeader(): string {
  const email     = process.env.SF_EMAIL!
  const apikey    = process.env.SF_API_KEY!
  const companyId = process.env.SF_COMPANY_ID!
  return `SFAPI email=${encodeURIComponent(email)}&apikey=${apikey}&module=${SF_MODULE}&company_id=${companyId}`
}

async function sfPost(endpoint: string, payload: object): Promise<Record<string, unknown>> {
  const res = await fetch(`${SF_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": authHeader(),
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: `data=${encodeURIComponent(JSON.stringify(payload))}`,
  })
  if (!res.ok) throw new Error(`SF HTTP ${res.status}: ${await res.text()}`)
  const json = await res.json() as Record<string, unknown>
  if (json.error && json.error !== 0) throw new Error(`SF: ${json.message ?? JSON.stringify(json)}`)
  return json
}

// ── Typy ───────────────────────────────────────────────────────────────────────

export interface SFKlient {
  jmeno: string
  email?: string
  telefon?: string
  ulice?: string
  mesto?: string
  psc?: string
}

export interface SFPolozka {
  nazev: string
  cena_sdph: number      // Cena S DPH (z DB) — přepočítáme na bez DPH pro SF
  pocet: number
  jednotka?: string      // "den", "ks" …
  popis?: string
}

export interface SFProformaVystup {
  id: number
  invoice_no: string
  vs: string             // Variabilní symbol
  token: string
  pdf_url: string
}

// ── Zálohová faktura (proforma) ───────────────────────────────────────────────

export async function vytvorZalohFakturu(
  klient: SFKlient,
  polozky: SFPolozka[],
  poznamka?: string,
): Promise<SFProformaVystup> {
  const payload = {
    Invoice: {
      type: "proforma",
      name: "Zálohová faktura - STANY",
      sequence_id: SEQ_ZALOHA,
      invoice_currency: "CZK",
      bank_accounts: [{ id: BANK_ACC_ID }],
      ...(poznamka ? { internal_comment: poznamka } : {}),
    },
    Client: buildClient(klient),
    InvoiceItem: polozky.map(buildItem),
  }

  const json = await sfPost("/invoices/create", payload)
  // SF vrací buď přímo json.Invoice nebo json.data.Invoice
  const wrapper = (json.data ?? json) as Record<string, unknown>
  const inv = (wrapper.Invoice ?? wrapper.invoice ?? json.Invoice ?? json.invoice) as Record<string, unknown>
  if (!inv?.id) throw new Error(`SF: nepodařilo se načíst Invoice z odpovědi: ${JSON.stringify(json).slice(0, 300)}`)

  return {
    id:         Number(inv.id),
    invoice_no: String(inv.invoice_no_formatted ?? inv.invoice_no ?? inv.id),
    vs:         String(inv.variable ?? inv.id),
    token:      String(inv.token ?? ""),
    pdf_url:    `${SF_BASE}/invoices/pdf/${inv.id}/token:${inv.token}`,
  }
}

// ── Ostrá faktura ze zálohy ───────────────────────────────────────────────────

export interface SFFakturaVystup {
  id: number
  invoice_no: string
  pdf_url: string
}

export async function vytvorFakturuZeZalohy(
  proformaId: number,
  klient: SFKlient,
  polozky: SFPolozka[],
): Promise<SFFakturaVystup> {
  const payload = {
    Invoice: {
      type: "regular",
      name: "Faktura - STANY",
      sequence_id: SEQ_FAKTURA,
      invoice_currency: "CZK",
      proforma_id: String(proformaId),
      already_paid: 1,
      bank_accounts: [{ id: BANK_ACC_ID }],
    },
    Client: buildClient(klient),
    InvoiceItem: polozky.map(buildItem),
  }

  const json = await sfPost("/invoices/create", payload)
  const wrapper = (json.data ?? json) as Record<string, unknown>
  const inv = (wrapper.Invoice ?? wrapper.invoice ?? json.Invoice ?? json.invoice) as Record<string, unknown>
  if (!inv?.id) throw new Error(`SF: nepodařilo se načíst Invoice z odpovědi: ${JSON.stringify(json).slice(0, 300)}`)

  return {
    id:         Number(inv.id),
    invoice_no: String(inv.invoice_no_formatted ?? inv.invoice_no ?? inv.id),
    pdf_url:    `${SF_BASE}/invoices/pdf/${inv.id}/token:${inv.token}`,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildClient(k: SFKlient): Record<string, unknown> {
  return {
    name:           k.jmeno,
    country_iso_id: "CZ",
    ...(k.email   ? { email:   k.email   } : {}),
    ...(k.telefon ? { phone:   k.telefon } : {}),
    ...(k.ulice   ? { address: k.ulice   } : {}),
    ...(k.mesto   ? { city:    k.mesto   } : {}),
    ...(k.psc     ? { zip:     k.psc     } : {}),
  }
}

function buildItem(p: SFPolozka): Record<string, unknown> {
  return {
    name:       p.nazev,
    unit_price: Math.round(bezDPH(p.cena_sdph) * 100) / 100,
    tax:        21,
    quantity:   p.pocet,
    ...(p.jednotka ? { unit:        p.jednotka } : {}),
    ...(p.popis    ? { description: p.popis    } : {}),
  }
}

// ── QR platba (Czech SPD standard) ───────────────────────────────────────────

export function qrPlatbaUrl(iban: string, vs: string, castka: number): string {
  const data = `SPD*1.0*ACC:${iban}*AM:${castka.toFixed(2)}*CC:CZK*X-VS:${vs}*MSG:Zalohova faktura STANY`
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data)}&size=200x200&margin=8`
}
