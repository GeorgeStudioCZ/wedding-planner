import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { deleteSFInvoice } from "@/lib/superfaktura"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// POST /api/george/hosting-fakturace/zrus  Body: { sfId: number }
// Smaže fakturu v SuperFaktuře a vrátí služby mezi nevyfakturované.
export async function POST(req: NextRequest) {
  try {
    const { sfId } = await req.json() as { sfId: number }
    if (!sfId) return NextResponse.json({ ok: false, error: "Chybí sfId" }, { status: 400 })

    const { data: radky } = await sb.from("george_hosting_fakturace").select("id").eq("sf_faktura_id", sfId)
    if (!radky?.length) return NextResponse.json({ ok: false, error: "K této faktuře nejsou žádné hostingové služby" }, { status: 404 })

    await deleteSFInvoice(sfId)
    await sb.from("george_hosting_fakturace").delete().eq("sf_faktura_id", sfId)
    await sb.from("george_faktury").delete().eq("sf_id", sfId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[george/hosting-fakturace/zrus]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
