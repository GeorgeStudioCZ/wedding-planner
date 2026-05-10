import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET() {
  // Service role key obchází RLS — potřebný pro veřejný embed
  // Přidejte SUPABASE_SERVICE_ROLE_KEY do Vercel Environment Variables
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const sb  = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key)

  const [{ data: polozky }, { data: stupne }] = await Promise.all([
    sb.from("pujcovna_polozky").select("*").order("sort_order"),
    sb.from("pujcovna_ceny_stupne").select("*"),
  ])

  return NextResponse.json(
    { polozky: polozky ?? [], stupne: stupne ?? [] },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  )
}
