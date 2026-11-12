import { NextResponse } from "next/server"
import { adminDb } from "@/lib/supabase-admin"

// Veřejný endpoint pro kalendář obsazenosti na webu: jen datum a typ služby, žádná jména.
export async function GET() {
  const { data, error } = await adminDb()
    .from("zakazky")
    .select("datum_svatby, typ_sluzby")
    .in("stav", ["objednavka", "zaplaceno", "po-svatbe", "ve-strizne", "ukonceno"])
  if (error) return NextResponse.json({ ok: false, error: "Chyba načtení" }, { status: 500 })
  return NextResponse.json({ ok: true, svatby: data ?? [] }, { headers: { "Cache-Control": "no-store" } })
}
