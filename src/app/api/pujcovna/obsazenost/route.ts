import { NextResponse } from "next/server"
import { adminDb } from "@/lib/supabase-admin"

// Veřejný endpoint pro rezervační formulář: obsazené termíny položek.
// Vrací jen to nezbytné pro výpočet dostupnosti — žádná jména ani kontakty.
export async function GET() {
  const dnes = new Date().toISOString().slice(0, 10)
  const { data, error } = await adminDb()
    .from("pujcovna_rezervace")
    .select("id,item_id,unit_index,start_date,end_date")
    .neq("stav", "storno")
    .gte("end_date", dnes)

  if (error) return NextResponse.json({ ok: false, error: "Chyba načtení" }, { status: 500 })
  const rezervace = (data ?? []).map(r => ({ ...r, group_id: null }))
  return NextResponse.json({ ok: true, rezervace }, { headers: { "Cache-Control": "no-store" } })
}
