import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET() {
  // Service role key obchází RLS — potřebný pro veřejný embed
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const sb  = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        // Explicitně nastav roli na service_role (pomáhá u nových formátů klíčů)
        "x-client-info": "server-route",
      },
    },
  })

  const [res1, res2] = await Promise.all([
    sb.from("pujcovna_polozky").select("*").order("sort_order"),
    sb.from("pujcovna_ceny_stupne").select("*"),
  ])

  // Dočasný debug výstup — pomůže zjistit přesný error
  const debug =
    process.env.NODE_ENV !== "production"
      ? { polozkyErr: res1.error?.message, stupneErr: res2.error?.message }
      : {
          stupneCount: (res2.data ?? []).length,
          stupneErr: res2.error?.message ?? null,
        }

  return NextResponse.json(
    { polozky: res1.data ?? [], stupne: res2.data ?? [], _debug: debug },
    { headers: { "Cache-Control": "no-store" } },
  )
}
