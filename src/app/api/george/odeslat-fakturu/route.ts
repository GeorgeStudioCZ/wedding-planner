import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendSFInvoiceEmail } from "@/lib/superfaktura"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// POST /api/george/odeslat-fakturu
// Body: { sfId: number }
export async function POST(req: NextRequest) {
  try {
    const { sfId } = await req.json() as { sfId: number }
    if (!sfId) return NextResponse.json({ ok: false, error: "Chybí sfId" }, { status: 400 })

    // Načti fakturu + zákazníka
    const { data: faktura } = await sb
      .from("george_faktury")
      .select("sf_id, zakaznik_id")
      .eq("sf_id", sfId)
      .single()

    if (!faktura) return NextResponse.json({ ok: false, error: "Faktura nenalezena" }, { status: 404 })

    const { data: zak } = await sb
      .from("zakaznici")
      .select("email")
      .eq("id", faktura.zakaznik_id)
      .single()

    if (!zak?.email) return NextResponse.json({ ok: false, error: "Zákazník nemá e-mail" }, { status: 422 })

    // Odešli přes SF API
    await sendSFInvoiceEmail(sfId, zak.email)

    // Označ jako odesláno
    await sb.from("george_faktury")
      .update({ odeslano: true, odeslano_at: new Date().toISOString() })
      .eq("sf_id", sfId)

    return NextResponse.json({ ok: true, email: zak.email })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[george/odeslat-fakturu]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
