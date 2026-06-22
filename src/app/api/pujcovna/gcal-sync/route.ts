import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  gcalCreate, gcalUpdate, gcalDelete, GCalRezervace,
  gcalCreateVyzvednuti, gcalUpdateVyzvednuti,
  gcalCreateVraceni,   gcalUpdateVraceni,
  GCAL_KATEGORIE,
} from "@/lib/google-calendar"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// Stavy kdy rezervace existuje v kalendáři (závazně potvrzená)
const POTVRZENE_STAVY = ["zaplaceno", "vypujceno", "dokonceno"]

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

    const polozkaKat = (rez.pujcovna_polozky as { name: string; category: string } | null)?.category ?? ""

    // Příslušenství (Příčníky atd.) — smaž případné gcal záznamy a přeskoč
    if (polozkaKat && !GCAL_KATEGORIE.includes(polozkaKat)) {
      const updates: Record<string, null> = {}
      if (rez.gcal_event_id)      { try { await gcalDelete(rez.gcal_event_id) } catch { /* ok */ }; updates.gcal_event_id = null }
      if (rez.gcal_vyzvednuti_id) { try { await gcalDelete(rez.gcal_vyzvednuti_id) } catch { /* ok */ }; updates.gcal_vyzvednuti_id = null }
      if (rez.gcal_vraceni_id)    { try { await gcalDelete(rez.gcal_vraceni_id) } catch { /* ok */ }; updates.gcal_vraceni_id = null }
      if (Object.keys(updates).length > 0) await sb.from("pujcovna_rezervace").update(updates).eq("id", rezervaceId)
      return NextResponse.json({ ok: true, action: "skipped_accessory" })
    }

    // Nezaplacená nebo storno → smaž všechny události (pokud existují)
    if (!POTVRZENE_STAVY.includes(rez.stav)) {
      const updates: Record<string, null> = {}
      if (rez.gcal_event_id)      { await gcalDelete(rez.gcal_event_id);      updates.gcal_event_id = null }
      if (rez.gcal_vyzvednuti_id) { await gcalDelete(rez.gcal_vyzvednuti_id); updates.gcal_vyzvednuti_id = null }
      if (rez.gcal_vraceni_id)    { await gcalDelete(rez.gcal_vraceni_id);    updates.gcal_vraceni_id = null }
      if (Object.keys(updates).length > 0) {
        await sb.from("pujcovna_rezervace").update(updates).eq("id", rezervaceId)
      }
      return NextResponse.json({ ok: true, action: "deleted_or_skipped" })
    }

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

    const polozka = rez.pujcovna_polozky as { name: string; category: string } | null
    const gcalData: GCalRezervace = {
      id:                rez.id,
      start_date:        rez.start_date,
      end_date:          rez.end_date,
      datum_vyzvednuti:  rez.datum_vyzvednuti ?? null,
      datum_vraceni:     rez.datum_vraceni    ?? null,
      cas_vyzvednuti:    rez.cas_vyzvednuti   ?? "",
      cas_vraceni:       rez.cas_vraceni      ?? "",
      notes:             rez.notes            ?? "",
      stav:              rez.stav,
      vozidlo:           rez.vozidlo          ?? "",
      polozka:           polozka?.name        ?? "Výpůjčka",
      kategorie:         polozka?.category    ?? "",
      zakaznik,
    }

    const dbUpdates: Record<string, string | null> = {}

    // Celodenní přehledová událost
    if (rez.gcal_event_id) {
      await gcalUpdate(rez.gcal_event_id, gcalData)
    } else {
      const eventId = await gcalCreate(gcalData)
      if (eventId) dbUpdates.gcal_event_id = eventId
    }

    // Hlavní řádek skupiny (nejnižší id) = jediný, kdo dostane Vyzvednutí/Vrácení
    // — jinak by stan + paddleboardy ve stejné skupině vytvořily duplicitní pickup/return události
    let jeHlavni = true
    if (rez.group_id) {
      const { data: skupina } = await sb
        .from("pujcovna_rezervace")
        .select("id")
        .eq("group_id", rez.group_id)
      const minId = Math.min(...(skupina ?? [{ id: rez.id }]).map(r => r.id))
      jeHlavni = rez.id === minId
    }

    if (jeHlavni) {
      // Vyzvednutí
      if (rez.gcal_vyzvednuti_id) {
        await gcalUpdateVyzvednuti(rez.gcal_vyzvednuti_id, gcalData)
      } else {
        const vId = await gcalCreateVyzvednuti(gcalData)
        if (vId) dbUpdates.gcal_vyzvednuti_id = vId
      }

      // Vrácení
      if (rez.gcal_vraceni_id) {
        await gcalUpdateVraceni(rez.gcal_vraceni_id, gcalData)
      } else {
        const rId = await gcalCreateVraceni(gcalData)
        if (rId) dbUpdates.gcal_vraceni_id = rId
      }
    } else {
      // Vedlejší položka skupiny — smaž případné starší duplicitní pickup/return
      if (rez.gcal_vyzvednuti_id) { try { await gcalDelete(rez.gcal_vyzvednuti_id) } catch { /* already deleted */ }; dbUpdates.gcal_vyzvednuti_id = null }
      if (rez.gcal_vraceni_id)    { try { await gcalDelete(rez.gcal_vraceni_id) } catch { /* already deleted */ }; dbUpdates.gcal_vraceni_id = null }
    }

    if (Object.keys(dbUpdates).length > 0) {
      await sb.from("pujcovna_rezervace").update(dbUpdates).eq("id", rezervaceId)
    }

    return NextResponse.json({ ok: true, action: "synced" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[gcal-sync]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
