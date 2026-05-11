// SuperFaktura API — Czech Republic
// Docs: https://github.com/superfaktura/docs

import { bezDPH } from "@/lib/dph"

const SF_BASE = "https://moje.superfaktura.cz"
const SF_MODULE = "SvatebniCRM"

function authHeader(): string {
  const email = process.env.SF_EMAIL!
  const apikey = process.env.SF_API_KEY!
  const companyId = process.env.SF_COMPANY_ID!
  // email musí být URL-encoded (@ → %40)
  return `SFAPI email=${encodeURIComponent(email)}&apikey=${apikey}&module=${SF_MODULE}&company_id=${companyId}`
}

// ── Typy ───────────────────────────────────────────────────────────────────────

export interface SFKlient {
  jmeno: string        // Celé jméno nebo název firmy
  email?: string
  telefon?: string
  ulice?: string
  mesto?: string
  psc?: string
}

export interface SFFakturaPolozka {
  nazev: string          // Název položky
  jednotkova_cena_sdph: number   // Cena S DPH (z naší DB) — přepočítáme na bez DPH
  pocet: number
  dph_sazba?: number   // % sazba DPH, default 21
  jednotka?: string    // např. "den", "ks"
  popis?: string
}

export interface SFFakturaVstup {
  cislo?: string           // Volitelné číslo faktury / název
  klient: SFKlient
  polozky: SFFakturaPolozka[]
  poznamka?: string
  typ?: "regular" | "proforma"
}

export interface SFFakturaVystup {
  id: number
  invoice_no: string
  token: string
  pdf_url: string
}

// ── Vytvoření faktury ──────────────────────────────────────────────────────────

export async function vytvorFakturu(vstup: SFFakturaVstup): Promise<SFFakturaVystup> {
  const Invoice: Record<string, unknown> = {
    type: vstup.typ ?? "regular",
    invoice_currency: "CZK",
    ...(vstup.cislo ? { name: vstup.cislo } : {}),
    ...(vstup.poznamka ? { internal_comment: vstup.poznamka } : {}),
  }

  const Client: Record<string, unknown> = {
    name: vstup.klient.jmeno,
    country_iso_id: "CZ",
    ...(vstup.klient.email   ? { email:   vstup.klient.email   } : {}),
    ...(vstup.klient.telefon ? { phone:   vstup.klient.telefon } : {}),
    ...(vstup.klient.ulice   ? { address: vstup.klient.ulice   } : {}),
    ...(vstup.klient.mesto   ? { city:    vstup.klient.mesto   } : {}),
    ...(vstup.klient.psc     ? { zip:     vstup.klient.psc     } : {}),
  }

  const InvoiceItem = vstup.polozky.map(p => {
    const sazba = p.dph_sazba ?? 21
    // SuperFaktura vyžaduje cenu BEZ DPH, naše DB má ceny S DPH
    const unit_price = Math.round(bezDPH(p.jednotkova_cena_sdph) * 100) / 100
    return {
      name: p.nazev,
      unit_price,
      tax: sazba,
      quantity: p.pocet,
      ...(p.jednotka ? { unit: p.jednotka } : {}),
      ...(p.popis    ? { description: p.popis } : {}),
    }
  })

  const payload = JSON.stringify({ Invoice, Client, InvoiceItem })

  const res = await fetch(`${SF_BASE}/invoices/create`, {
    method: "POST",
    headers: {
      "Authorization": authHeader(),
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: `data=${encodeURIComponent(payload)}`,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SuperFaktura HTTP ${res.status}: ${text}`)
  }

  const json = await res.json()

  if (json.status !== "SUCCESS" && json.error !== 0) {
    throw new Error(`SuperFaktura chyba: ${json.message ?? JSON.stringify(json)}`)
  }

  const inv = json.Invoice ?? json.invoice
  return {
    id:         inv.id,
    invoice_no: inv.invoice_no_formatted ?? inv.invoice_no ?? String(inv.id),
    token:      inv.token ?? "",
    pdf_url:    `${SF_BASE}/slo/invoices/pdf/${inv.id}/token:${inv.token}`,
  }
}
