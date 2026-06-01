// Google Calendar — Service Account integration
// Docs: https://developers.google.com/calendar/api/v3/reference/events

import { google } from "googleapis"

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!

// Barva události podle stavu rezervace (Google Calendar colorId 1-11)
const STAV_COLOR: Record<string, string> = {
  "web-rezervace": "8",   // Blueberry
  "rezervace":     "8",   // Blueberry
  "cekam-platbu":  "5",   // Banana/yellow
  "zaplaceno":     "2",   // Sage/green
  "vypujceno":     "7",   // Peacock/blue
  "dokonceno":     "10",  // Basil/dark green
  "storno":        "11",  // Graphite
}

// Kategorie které patří do Google Kalendáře (hlavní půjčované položky)
// Příslušenství (Příčníky, atd.) se do kalendáře NEsynchronizuje
export const GCAL_KATEGORIE = ["Stany", "Paddleboardy", "Držáky kol"]

// Emoji podle kategorie
const KAT_EMOJI: Record<string, string> = {
  "Stany":          "⛺",
  "Paddleboardy":   "🏄",
  "Držáky kol":     "🚲",
}

function getCalendar() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n")
  const auth = new google.auth.JWT({
    email:  process.env.GOOGLE_CLIENT_EMAIL,
    key:    privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  })
  return google.calendar({ version: "v3", auth })
}

export interface GCalRezervace {
  id:                number
  start_date:        string        // "2026-06-10"
  end_date:          string        // "2026-06-14"
  datum_vyzvednuti?: string | null // přesný den vyzvednutí (může se lišit od start_date)
  datum_vraceni?:    string | null // přesný den vrácení (může se lišit od end_date)
  cas_vyzvednuti:    string        // "9:00 - 10:00"
  cas_vraceni:       string        // "17:00 - 18:00"
  notes:             string
  stav:              string
  vozidlo?:          string
  polozka:           string        // name
  kategorie:         string        // category
  zakaznik?:         { jmeno: string; prijmeni: string; email?: string; telefon?: string } | null
}

function buildEvent(rez: GCalRezervace) {
  const emoji  = KAT_EMOJI[rez.kategorie] ?? "📦"
  const zakaznikJmeno = rez.zakaznik
    ? `${rez.zakaznik.jmeno} ${rez.zakaznik.prijmeni}`.trim()
    : "Zákazník neznámý"

  const title  = `${emoji} ${rez.polozka} — ${zakaznikJmeno}`
  const color  = STAV_COLOR[rez.stav] ?? "8"

  // Popis události
  const lines = [
    `👤 ${zakaznikJmeno}`,
    rez.zakaznik?.telefon ? `📞 ${rez.zakaznik.telefon}` : null,
    rez.zakaznik?.email   ? `✉️ ${rez.zakaznik.email}`   : null,
    "",
    `📅 Vyzvednutí: ${rez.start_date}${rez.cas_vyzvednuti ? " · " + rez.cas_vyzvednuti : ""}`,
    `📅 Vrácení:    ${rez.end_date}${rez.cas_vraceni   ? " · " + rez.cas_vraceni   : ""}`,
    rez.vozidlo   ? `🚗 ${rez.vozidlo}`     : null,
    rez.notes     ? `📝 ${rez.notes}`       : null,
    "",
    `Stav: ${rez.stav}`,
  ].filter(l => l !== null).join("\n")

  return {
    summary:     title,
    description: lines,
    colorId:     null,  // výchozí barva kalendáře
    start: { date: rez.start_date },
    end:   { date: addDay(rez.end_date) },  // Google all-day end is exclusive
  }
}

// Přidá 1 den k ISO datu
function addDay(iso: string): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Parsuje čas ve formátu "9:00 - 10:00" nebo "09:00–10:00"
function parseTimeRange(timeStr: string): { start: string; end: string } | null {
  if (!timeStr) return null
  const match = timeStr.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/)
  if (!match) return null
  const pad = (t: string) => t.length === 4 ? "0" + t : t
  return { start: pad(match[1]), end: pad(match[2]) }
}

function buildPickupEvent(rez: GCalRezervace) {
  const zakaznikJmeno = rez.zakaznik
    ? `${rez.zakaznik.jmeno} ${rez.zakaznik.prijmeni}`.trim()
    : "Zákazník"

  const description = [
    `Stan: ${rez.polozka}`,
    rez.vozidlo          ? `🚗 ${rez.vozidlo}`            : null,
    rez.zakaznik?.telefon ? `📞 ${rez.zakaznik.telefon}`  : null,
    rez.zakaznik?.email   ? `✉️ ${rez.zakaznik.email}`    : null,
    rez.notes            ? `📝 ${rez.notes}`               : null,
  ].filter(Boolean).join("\n")

  const times = parseTimeRange(rez.cas_vyzvednuti)
  const den = rez.datum_vyzvednuti || rez.start_date
  return {
    summary:     `⛺ Vyzvednutí autostanu – ${zakaznikJmeno}`,
    description,
    colorId:     null,  // výchozí barva kalendáře
    start: times
      ? { dateTime: `${den}T${times.start}:00`, timeZone: "Europe/Prague" }
      : { date: den },
    end: times
      ? { dateTime: `${den}T${times.end}:00`, timeZone: "Europe/Prague" }
      : { date: addDay(den) },
  }
}

function buildReturnEvent(rez: GCalRezervace) {
  const zakaznikJmeno = rez.zakaznik
    ? `${rez.zakaznik.jmeno} ${rez.zakaznik.prijmeni}`.trim()
    : "Zákazník"

  const description = [
    `Stan: ${rez.polozka}`,
    rez.vozidlo          ? `🚗 ${rez.vozidlo}`            : null,
    rez.zakaznik?.telefon ? `📞 ${rez.zakaznik.telefon}`  : null,
    rez.zakaznik?.email   ? `✉️ ${rez.zakaznik.email}`    : null,
  ].filter(Boolean).join("\n")

  const times = parseTimeRange(rez.cas_vraceni)
  const den = rez.datum_vraceni || rez.end_date
  return {
    summary:     `⛺ Vrácení autostanu – ${zakaznikJmeno}`,
    description,
    colorId:     null,  // výchozí barva kalendáře
    start: times
      ? { dateTime: `${den}T${times.start}:00`, timeZone: "Europe/Prague" }
      : { date: den },
    end: times
      ? { dateTime: `${den}T${times.end}:00`, timeZone: "Europe/Prague" }
      : { date: addDay(den) },
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function gcalCreate(rez: GCalRezervace): Promise<string | null> {
  try {
    const cal = getCalendar()
    const res = await cal.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: buildEvent(rez),
    })
    return res.data.id ?? null
  } catch (err) {
    console.error("[gcal] create failed:", err)
    return null
  }
}

export async function gcalUpdate(eventId: string, rez: GCalRezervace): Promise<void> {
  try {
    const cal = getCalendar()
    await cal.events.patch({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: buildEvent(rez),
    })
  } catch (err) {
    console.error("[gcal] update failed:", err)
  }
}

export async function gcalDelete(eventId: string): Promise<void> {
  try {
    const cal = getCalendar()
    await cal.events.delete({ calendarId: CALENDAR_ID, eventId })
  } catch (err) {
    console.error("[gcal] delete failed:", err)
  }
}

export async function gcalCreateVyzvednuti(rez: GCalRezervace): Promise<string | null> {
  try {
    const cal = getCalendar()
    const res = await cal.events.insert({ calendarId: CALENDAR_ID, requestBody: buildPickupEvent(rez) })
    return res.data.id ?? null
  } catch (err) {
    console.error("[gcal] create vyzvednuti failed:", err)
    return null
  }
}

export async function gcalUpdateVyzvednuti(eventId: string, rez: GCalRezervace): Promise<void> {
  try {
    const cal = getCalendar()
    await cal.events.patch({ calendarId: CALENDAR_ID, eventId, requestBody: buildPickupEvent(rez) })
  } catch (err) {
    console.error("[gcal] update vyzvednuti failed:", err)
  }
}

export async function gcalCreateVraceni(rez: GCalRezervace): Promise<string | null> {
  try {
    const cal = getCalendar()
    const res = await cal.events.insert({ calendarId: CALENDAR_ID, requestBody: buildReturnEvent(rez) })
    return res.data.id ?? null
  } catch (err) {
    console.error("[gcal] create vraceni failed:", err)
    return null
  }
}

export async function gcalUpdateVraceni(eventId: string, rez: GCalRezervace): Promise<void> {
  try {
    const cal = getCalendar()
    await cal.events.patch({ calendarId: CALENDAR_ID, eventId, requestBody: buildReturnEvent(rez) })
  } catch (err) {
    console.error("[gcal] update vraceni failed:", err)
  }
}
