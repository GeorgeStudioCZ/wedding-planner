import { NextResponse } from "next/server"
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

const POTVRZENE_STAVY = ["zaplaceno", "vypujceno", "dokonceno"]

// GET — voláno Vercel cronem každý den v 7:00 UTC (hodinu po fio-sync)
export async function GET() { return run() }

// POST — voláno ručně z UI
export async function POST() { return run() }

async function run() {
  try {
    // Načti všechny potvrzené rezervace
    const { data: rezervace, error } = await sb
      .from("pujcovna_rezervace")
      .select("*, pujcovna_polozky(name, category)")
      .in("stav", POTVRZENE_STAVY)

    if (error) throw error
    if (!rezervace || rezervace.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: "Žádné rezervace k synchronizaci" })
    }

    // Načti zákazníky najednou
    const zakaznikIds = [...new Set(rezervace.map(r => r.zakaznik_id).filter(Boolean))]
    const { data: zakaznici } = await sb
      .from("zakaznici")
      .select("id, jmeno, prijmeni, email, telefon")
      .in("id", zakaznikIds)

    const zakaznikMap = Object.fromEntries((zakaznici ?? []).map(z => [z.id, z]))

    const results: { id: number; action: string; error?: string }[] = []

    // Odstraň příslušenství co se omylem dostalo do kalendáře
    for (const rez of rezervace) {
      const polozka = rez.pujcovna_polozky as { name: string; category: string } | null
      if (polozka && !GCAL_KATEGORIE.includes(polozka.category)) {
        const updates: Record<string, null> = {}
        if (rez.gcal_event_id)      { try { await gcalDelete(rez.gcal_event_id) } catch { /* already deleted */ }; updates.gcal_event_id = null }
        if (rez.gcal_vyzvednuti_id) { try { await gcalDelete(rez.gcal_vyzvednuti_id) } catch { /* already deleted */ }; updates.gcal_vyzvednuti_id = null }
        if (rez.gcal_vraceni_id)    { try { await gcalDelete(rez.gcal_vraceni_id) } catch { /* already deleted */ }; updates.gcal_vraceni_id = null }
        if (Object.keys(updates).length > 0) {
          await sb.from("pujcovna_rezervace").update(updates).eq("id", rez.id)
        }
        results.push({ id: rez.id, action: "removed_accessory" })
        continue
      }
    }

    for (const rez of rezervace) {
      try {
        const polozka = rez.pujcovna_polozky as { name: string; category: string } | null

        // Přeskočit příslušenství (Příčníky, atd.) — do kalendáře patří jen hlavní položky
        if (polozka && !GCAL_KATEGORIE.includes(polozka.category)) continue

        const zakaznik = rez.zakaznik_id ? zakaznikMap[rez.zakaznik_id] ?? null : null

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

        if (Object.keys(dbUpdates).length > 0) {
          await sb.from("pujcovna_rezervace").update(dbUpdates).eq("id", rez.id)
        }

        results.push({ id: rez.id, action: "synced" })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[gcal-sync-all] rezervace ${rez.id} failed:`, msg)
        results.push({ id: rez.id, action: "error", error: msg })
      }
    }

    const synced = results.filter(r => r.action === "synced").length
    const errors = results.filter(r => r.action === "error").length

    return NextResponse.json({ ok: true, total: rezervace.length, synced, errors, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[gcal-sync-all]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
