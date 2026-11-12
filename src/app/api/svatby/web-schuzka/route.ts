import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/supabase-admin"
import { jeEmail, jeIsoDatum } from "@/lib/html"

// Veřejný endpoint: žádost o schůzku / videohovor z webového formuláře.
// Server ověří vstupy a volný termín, uloží žádost a odešle e-maily.

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}
function chyba(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!b || typeof b !== "object") return chyba("Neplatný požadavek.")

    const jmeno        = text(b.jmeno, 120)
    const email        = text(b.email, 254)
    const kontakt      = text(b.kontakt, 250)
    const typ_kontaktu = text(b.typ_kontaktu, 20)
    const otazky       = text(b.otazky, 2000) || null
    const datum        = b.datum
    const cas          = text(b.cas, 5)
    const datum_svadby = jeIsoDatum(b.datum_svadby) ? b.datum_svadby : null

    if (!jmeno) return chyba("Vyplň jméno.")
    if (!jeEmail(email)) return chyba("Zadej platný e-mail.")
    if (!["whatsapp", "facetime", "osobne"].includes(typ_kontaktu)) return chyba("Neplatný typ kontaktu.")
    if (!kontakt) return chyba("Vyplň kontakt.")
    if (!jeIsoDatum(datum)) return chyba("Neplatné datum.")
    if (!/^\d{2}:00$/.test(cas)) return chyba("Neplatný čas.")
    const dnes = new Date().toISOString().slice(0, 10)
    if (datum < dnes) return chyba("Termín je v minulosti.")

    const db = adminDb()

    // Termín musí být v nastavené dostupnosti a volný
    const { data: nast } = await db.from("schuzky_nastaveni").select("dostupnost").eq("id", 1).maybeSingle()
    const dostupnost = (nast?.dostupnost ?? null) as Record<string, number[]> | null
    if (dostupnost) {
      const d = new Date(datum + "T12:00:00Z").getUTCDay()   // 0 = neděle
      const isoDen = d === 0 ? 7 : d
      const hodina = parseInt(cas.slice(0, 2), 10)
      if (!(dostupnost[String(isoDen)] ?? []).includes(hodina)) return chyba("Tento termín není v nabídce.", 409)
    }
    const { data: kolize } = await db.from("schuzky")
      .select("id").eq("datum", datum).like("cas", `${cas}%`).neq("stav", "zrusena").limit(1)
    if (kolize && kolize.length > 0) return chyba("Tento termín je už obsazený, vyber prosím jiný.", 409)

    // Jednoduchá ochrana proti zahlcení
    const pred10min = new Date(Date.now() - 10 * 60000).toISOString()
    const { count } = await db.from("schuzky").select("id", { count: "exact", head: true }).gte("created_at", pred10min)
    if ((count ?? 0) >= 10) return chyba("Systém je přetížen, zkus to prosím za několik minut.", 429)

    const { error } = await db.from("schuzky").insert({
      jmeno, email, datum_svadby, kontakt, typ_kontaktu, otazky, datum, cas, stav: "nova",
    })
    if (error) throw new Error(error.message)

    // E-maily přes interní (chráněný) endpoint
    await fetch(`${req.nextUrl.origin}/api/mail/schuzka`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
      body: JSON.stringify({ typ: "zadost", jmeno, email, datum, cas, typ_kontaktu, kontakt, datum_svadby, otazky }),
    }).catch(e => console.error("[web-schuzka] mail:", e))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[web-schuzka]", err instanceof Error ? err.message : err)
    return chyba("Nepodařilo se uložit. Zkus to znovu.", 500)
  }
}
