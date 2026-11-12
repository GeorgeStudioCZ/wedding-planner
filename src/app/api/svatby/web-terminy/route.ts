import { NextRequest, NextResponse } from "next/server"
import { adminDb } from "@/lib/supabase-admin"
import { jeIsoDatum } from "@/lib/html"

// Veřejný endpoint pro formulář videohovoru: nastavení dostupnosti a obsazené termíny
// (jen datum a čas, žádné osobní údaje).
export async function GET(req: NextRequest) {
  const od  = req.nextUrl.searchParams.get("od")
  const do_ = req.nextUrl.searchParams.get("do")
  const db  = adminDb()

  const { data: nast } = await db.from("schuzky_nastaveni").select("dostupnost").eq("id", 1).maybeSingle()

  let terminy: { datum: string; cas: string }[] = []
  if (jeIsoDatum(od) && jeIsoDatum(do_)) {
    const rozsahDni = (Date.parse(do_) - Date.parse(od)) / 86400000
    if (rozsahDni < 0 || rozsahDni > 100) {
      return NextResponse.json({ ok: false, error: "Neplatný rozsah" }, { status: 400 })
    }
    const { data, error } = await db.from("schuzky")
      .select("datum, cas").gte("datum", od).lte("datum", do_).neq("stav", "zrusena")
    if (error) return NextResponse.json({ ok: false, error: "Chyba načtení" }, { status: 500 })
    terminy = data ?? []
  }

  return NextResponse.json(
    { ok: true, dostupnost: nast?.dostupnost ?? null, terminy },
    { headers: { "Cache-Control": "no-store" } },
  )
}
