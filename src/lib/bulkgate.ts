// BulkGate SMS API — Transactional SMS
// Docs: https://help.bulkgate.com/docs/en/http-simple-transactional.html

const BULKGATE_URL = "https://portal.bulkgate.com/api/1.0/simple/transactional"

// ── Normalizace českého telefonního čísla na +420XXXXXXXXX ───────────────────

export function normalizePhone(phone: string): string | null {
  if (!phone) return null
  const c = phone.replace(/[\s\-\(\)\.]/g, "")
  if (c.startsWith("+")) return c
  if (c.startsWith("00")) return "+" + c.slice(2)
  if (c.startsWith("420") && c.length === 12) return "+" + c
  if (/^\d{9}$/.test(c)) return "+420" + c
  return c || null
}

// ── Odeslání SMS ──────────────────────────────────────────────────────────────

export async function sendSms(to: string, text: string): Promise<void> {
  const appId = process.env.BULKGATE_APP_ID
  const token = process.env.BULKGATE_TOKEN
  if (!appId || !token) {
    console.warn("[bulkgate] BULKGATE_APP_ID nebo BULKGATE_TOKEN není nastaven — SMS přeskočena")
    return
  }

  const number = normalizePhone(to)
  if (!number) {
    console.warn("[bulkgate] Prázdné nebo neplatné číslo, SMS přeskočena")
    return
  }

  const res = await fetch(BULKGATE_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      application_id:    appId,
      application_token: token,
      number,
      text,
      unicode:           false,
      country:           "CZ",
      // gSystem = systémové číslo BulkGate, funguje bez registrace
      // Pro vlastní jméno odesílatele zaregistruj "Autostany" v BulkGate portálu
      // a změň na: sender_id: "gText", sender_id_value: "Autostany"
      sender_id:         "gText",
      sender_id_value:   "Stanujnaaute",
    }),
  })

  const json = await res.json() as { data?: unknown; error?: string; code?: number; detail?: unknown }
  if (!res.ok || json.error) {
    throw new Error(`BulkGate ${res.status}: ${json.error ?? JSON.stringify(json)}`)
  }
  console.log("[bulkgate] SMS odesláno na", number, "status:", (json.data as Record<string,unknown>)?.status)
}

// ── Předpřipravené SMS zprávy ─────────────────────────────────────────────────

export function smsNoveRezervace(data: {
  jmeno:      string
  polozka:    string
  vs:         string
  castka:     number
  cisloUctu:  string
}): string {
  return (
    `Ahoj ${data.jmeno}, rezervace ${data.polozka} byla přijata! ` +
    `Zaplaťte do 72 hod — VS: ${data.vs}, ` +
    `${data.castka ? `částka: ${data.castka} Kč, ` : ""}` +
    `účet: ${data.cisloUctu}. Stanuj na autě`
  )
}

export function smsUpominkaPlatby(data: {
  vs:      string
  polozka: string
}): string {
  return (
    `Upomínka: Rezervace ${data.polozka} není dosud zaplacena. ` +
    `Zbývá méně než 24 h! VS: ${data.vs}. ` +
    `Dotazy: info@stanujnaaute.cz`
  )
}

export function smsPlatbaPrijata(data: {
  jmeno:      string
  invoice_no: string
}): string {
  return (
    `Ahoj ${data.jmeno}, platba přijata – rezervace potvrzena! ` +
    `Faktura ${data.invoice_no} zaslána na váš email. Těšíme se na vás!`
  )
}

export function smsZmenaLogistiky(data: {
  polozka:        string
  datumVyzvednuti: string
  casVyzvednuti:  string
  datumVraceni:   string
  casVraceni:     string
}): string {
  const fmtD = (iso: string) =>
    new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })
  const vyzvednuti = `${fmtD(data.datumVyzvednuti)}${data.casVyzvednuti ? " " + data.casVyzvednuti + " hod" : ""}`
  const vraceni    = `${fmtD(data.datumVraceni)}${data.casVraceni ? " " + data.casVraceni + " hod" : ""}`
  return (
    `Změna termínů ${data.polozka}: ` +
    `Vyzvednutí ${vyzvednuti}, Vrácení ${vraceni}. ` +
    `Dotazy: info@stanujnaaute.cz`
  )
}
