import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { gcalCreate, gcalUpdate, gcalDelete, GCalRezervace } from "@/lib/google-calendar"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// POST /api/pujcovna/gcal-sync
// Body: { rezervaceId: number }
export async function POST(req: NextRequest) {
  try {
    const { rezervaceId } = await req.json()

    // Načti rezervaci
    const { data: rez } = await sb
      .from("pujcovna_rezervace")
      .select("*, pujcovna_polozky(name, category)")
      .eq("id", rezervaceId)
      .single()

    if (!rez) return NextResponse.json({ ok: false, error: "Rezervace nenalezena" }, { status: 404 })

    // Načti zákazníka
    let zakaznik = null
    if (rez.zakaznik_id) {
      const { data: zak } = await sb
        .from("zakaznici")
        .select("jmeno, prijmeni, email, telefon")
        .eq("id", rez.zakaznik_id)
        .single()
      zakaznik = zak
    }

    const polozka  = rez.pujcovna_polozky as { name: string; category: string } | null
    const gcalData: GCalRezervace = {
      id:             rez.id,
      start_date:     rez.start_date,
      end_date:       rez.end_date,
      cas_vyzvednuti: rez.cas_vyzvednuti ?? "",
      cas_vraceni:    rez.cas_vraceni    ?? "",
      notes:          rez.notes          ?? "",
      stav:           rez.stav,
      vozidlo:        rez.vozidlo        ?? "",
      polozka:        polozka?.name      ?? "Výpůjčka",
      kategorie:      polozka?.category  ?? "",
      zakaznik,
    }

    // Storno → smaž událost
    if (rez.stav === "storno") {
      if (rez.gcal_event_id) {
        await gcalDelete(rez.gcal_event_id)
        await sb.from("pujcovna_rezervace").update({ gcal_event_id: null }).eq("id", rezervaceId)
      }
      return NextResponse.json({ ok: true, action: "deleted" })
    }

    // Aktualizuj nebo vytvoř
    if (rez.gcal_event_id) {
      await gcalUpdate(rez.gcal_event_id, gcalData)
      return NextResponse.json({ ok: true, action: "updated", eventId: rez.gcal_event_id })
    } else {
      const eventId = await gcalCreate(gcalData)
      if (eventId) {
        await sb.from("pujcovna_rezervace").update({ gcal_event_id: eventId }).eq("id", rezervaceId)
      }
      return NextResponse.json({ ok: true, action: "created", eventId })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[gcal-sync]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
