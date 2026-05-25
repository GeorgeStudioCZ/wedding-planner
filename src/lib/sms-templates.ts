// SMS šablony — načítá z DB tabulky sms_sablony, fallback na hardcoded text
// Proměnné ve formátu {jmeno}, {vs} atd.

import { createClient } from "@supabase/supabase-js"

export type SmsTyp = "nova-rezervace" | "upominka-platby" | "platba-prijata" | "zmena-logistiky"

export const SMS_TYPY: SmsTyp[] = [
  "nova-rezervace",
  "upominka-platby",
  "platba-prijata",
  "zmena-logistiky",
]

export const SMS_NAZVY: Record<SmsTyp, string> = {
  "nova-rezervace":  "Nová rezervace",
  "upominka-platby": "Upomínka platby",
  "platba-prijata":  "Platba přijata",
  "zmena-logistiky": "Změna logistiky",
}

export const SMS_IKONY: Record<SmsTyp, string> = {
  "nova-rezervace":  "⛺",
  "upominka-platby": "⏰",
  "platba-prijata":  "✅",
  "zmena-logistiky": "📋",
}

// Dostupné proměnné pro každý typ
export const SMS_PROMENNE: Record<SmsTyp, string[]> = {
  "nova-rezervace":  ["{jmeno}", "{polozka}", "{vs}", "{castka}", "{cislo_uctu}"],
  "upominka-platby": ["{polozka}", "{vs}"],
  "platba-prijata":  ["{jmeno}", "{invoice_no}"],
  "zmena-logistiky": ["{polozka}", "{datum_vyzvednuti}", "{cas_vyzvednuti}", "{datum_vraceni}", "{cas_vraceni}"],
}

// Ukázková data pro živý náhled v editoru
export const SMS_PREVIEW_VARS: Record<SmsTyp, Record<string, string>> = {
  "nova-rezervace": {
    jmeno:      "Petr",
    polozka:    "Alaska M",
    vs:         "26000510",
    castka:     "3675",
    cislo_uctu: "1234567890/0800",
  },
  "upominka-platby": {
    polozka: "Alaska M",
    vs:      "26000510",
  },
  "platba-prijata": {
    jmeno:      "Petr",
    invoice_no: "AS260013",
  },
  "zmena-logistiky": {
    polozka:           "Alaska M",
    datum_vyzvednuti:  "12. 6.",
    cas_vyzvednuti:    " 9:00 hod",
    datum_vraceni:     "15. 6.",
    cas_vraceni:       " 18:00 hod",
  },
}

// Výchozí texty (fallback pokud šablona v DB chybí)
export const SMS_FALLBACK: Record<SmsTyp, string> = {
  "nova-rezervace":
    "Ahoj {jmeno}, rezervace {polozka} byla přijata! " +
    "Zaplaťte do 72 hod — VS: {vs}, " +
    "částka: {castka} Kč, " +
    "účet: {cislo_uctu}. Stanuj na autě",
  "upominka-platby":
    "Upomínka: Rezervace {polozka} není dosud zaplacena. " +
    "Zbývá méně než 24 h! VS: {vs}. " +
    "Dotazy: info@stanujnaaute.cz",
  "platba-prijata":
    "Ahoj {jmeno}, platba přijata – rezervace potvrzena! " +
    "Faktura {invoice_no} zaslána na váš email. Těšíme se na vás!",
  "zmena-logistiky":
    "Změna termínů {polozka}: " +
    "Vyzvednutí {datum_vyzvednuti}{cas_vyzvednuti}, " +
    "Vrácení {datum_vraceni}{cas_vraceni}. " +
    "Dotazy: info@stanujnaaute.cz",
}

// ── Render ─────────────────────────────────────────────────────────────────────

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}

// ── DB přístup ─────────────────────────────────────────────────────────────────

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

async function getSablona(typ: SmsTyp): Promise<string> {
  try {
    const { data } = await makeSb()
      .from("sms_sablony")
      .select("text")
      .eq("typ", typ)
      .maybeSingle()
    return data?.text ?? SMS_FALLBACK[typ]
  } catch {
    return SMS_FALLBACK[typ]
  }
}

// ── Render funkce pro každý typ ────────────────────────────────────────────────

export async function textNovaRezervace(d: {
  jmeno:      string
  polozka:    string
  vs:         string
  castka:     number
  cislo_uctu: string
}): Promise<string> {
  const tpl = await getSablona("nova-rezervace")
  return renderTemplate(tpl, {
    jmeno:      d.jmeno,
    polozka:    d.polozka,
    vs:         d.vs,
    castka:     d.castka ? String(Math.round(d.castka)) : "",
    cislo_uctu: d.cislo_uctu,
  })
}

export async function textUpominkaPlatby(d: {
  vs:      string
  polozka: string
}): Promise<string> {
  const tpl = await getSablona("upominka-platby")
  return renderTemplate(tpl, { vs: d.vs, polozka: d.polozka })
}

export async function textPlatbaPrijata(d: {
  jmeno:      string
  invoice_no: string
}): Promise<string> {
  const tpl = await getSablona("platba-prijata")
  return renderTemplate(tpl, { jmeno: d.jmeno, invoice_no: d.invoice_no })
}

export async function textZmenaLogistiky(d: {
  polozka:         string
  datumVyzvednuti: string   // ISO date
  casVyzvednuti:   string
  datumVraceni:    string   // ISO date
  casVraceni:      string
}): Promise<string> {
  const tpl = await getSablona("zmena-logistiky")
  const fmtD = (iso: string) =>
    new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })
  return renderTemplate(tpl, {
    polozka:          d.polozka,
    datum_vyzvednuti: fmtD(d.datumVyzvednuti),
    cas_vyzvednuti:   d.casVyzvednuti ? ` ${d.casVyzvednuti} hod` : "",
    datum_vraceni:    fmtD(d.datumVraceni),
    cas_vraceni:      d.casVraceni ? ` ${d.casVraceni} hod` : "",
  })
}
