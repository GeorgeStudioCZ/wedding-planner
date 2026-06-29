import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { deleteSFInvoice } from "@/lib/superfaktura"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// POST /api/george/zrus-fakturu
// Body: { sfId: number }
export async function POST(req: NextRequest) {
  try {
    const { sfId } = await req.json() as { sfId: number }
    if (!sfId) return NextResponse.json({ ok: false, error: "Chybí sfId" }, { status: 400 })

    // Nejdřív zjisti které záznamy patří k faktuře
    const { data: zaznamy } = await sb
      .from("george_zaznamy")
      .select("id")
      .eq("sf_faktura_id", sfId)

    if (!zaznamy?.length) {
      return NextResponse.json({ ok: false, error: "Žádné záznamy pro tuto fakturu nalezeny" }, { status: 404 })
    }

    // Smaž fakturu v SuperFaktura
    await deleteSFInvoice(sfId)

    // Resetuj záznamy na nevyfakturované
    await sb.from("george_zaznamy")
      .update({ fakturovano: false, sf_faktura_id: null, sf_faktura_no: null })
      .eq("sf_faktura_id", sfId)

    // Smaž záznam faktury
    await sb.from("george_faktury").delete().eq("sf_id", sfId)

    return NextResponse.json({ ok: true, resetIds: zaznamy.map(z => z.id) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[george/zrus-fakturu]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
