// Synchronizace schůzky do Google Kalendáře
//
// POST /api/svatby/schuzka-gcal
// Body: { schuzkaId: number, action: "create" | "update" | "delete" }
//
// create → potvrzena schůzka; update → změna termínu; delete → zrušena

import { NextRequest, NextResponse }                      from "next/server"
import { createClient }                                    from "@supabase/supabase-js"
import { gcalCreateSchuzka, gcalUpdateSchuzka, gcalDeleteSchuzka } from "@/lib/google-calendar"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { schuzkaId, action } = (await req.json()) as {
      schuzkaId: number
      action: "create" | "update" | "delete"
    }

    if (!schuzkaId || !action) {
      return NextResponse.json({ ok: false, error: "schuzkaId a action jsou povinné" }, { status: 400 })
    }

    // Načti schůzku
    const { data: s, error } = await sb
      .from("schuzky")
      .select("id, jmeno, datum, cas, typ_kontaktu, kontakt, datum_svadby, otazky, gcal_event_id")
      .eq("id", schuzkaId)
      .single()

    if (error || !s) {
      return NextResponse.json({ ok: false, error: `Schůzka nenalezena: ${error?.message ?? ""}` }, { status: 404 })
    }

    const gcalData = {
      jmeno:        s.jmeno,
      datum:        s.datum,
      cas:          s.cas,
      typ_kontaktu: s.typ_kontaktu,
      kontakt:      s.kontakt,
      datum_svadby: s.datum_svadby ?? null,
      otazky:       s.otazky ?? null,
    }

    if (action === "delete") {
      if (s.gcal_event_id) {
        await gcalDeleteSchuzka(s.gcal_event_id)
        await sb.from("schuzky").update({ gcal_event_id: null }).eq("id", schuzkaId)
      }
      return NextResponse.json({ ok: true, action: "deleted" })
    }

    if (action === "update" && s.gcal_event_id) {
      await gcalUpdateSchuzka(s.gcal_event_id, gcalData)
      return NextResponse.json({ ok: true, action: "updated", gcal_event_id: s.gcal_event_id })
    }

    // create (nebo update bez existujícího event_id → vytvoř nový)
    const eventId = await gcalCreateSchuzka(gcalData)
    if (eventId) {
      await sb.from("schuzky").update({ gcal_event_id: eventId }).eq("id", schuzkaId)
    }
    return NextResponse.json({ ok: true, action: "created", gcal_event_id: eventId })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[schuzka-gcal]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
