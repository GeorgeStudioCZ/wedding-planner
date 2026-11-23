import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { deleteSFInvoice } from "@/lib/superfaktura"

// Označení faktury jako zaplacené / nezaplacené
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const { stav } = (await req.json()) as { stav: "vystavena" | "zaplacena" }
    if (stav !== "vystavena" && stav !== "zaplacena") {
      return NextResponse.json({ ok: false, error: "Neplatný stav" }, { status: 400 })
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data, error } = await db
      .from("svatby_faktury")
      .update({
        stav,
        zaplaceno_at: stav === "zaplacena" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select()
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, faktura: data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

// Zrušení (smazání) nezaplacené zálohové faktury — ze SuperFaktury i z CRM
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: f, error } = await db.from("svatby_faktury").select("*").eq("id", id).single()
    if (error || !f) return NextResponse.json({ ok: false, error: "Faktura nenalezena" }, { status: 404 })
    if (f.typ !== "zaloha" || f.stav !== "vystavena") {
      return NextResponse.json({ ok: false, error: "Zrušit lze jen nezaplacenou zálohovou fakturu." }, { status: 409 })
    }
    const { data: dalsi } = await db.from("svatby_faktury").select("id").eq("zakazka_id", f.zakazka_id).neq("id", id)
    if (dalsi && dalsi.length > 0) {
      return NextResponse.json({ ok: false, error: "K zakázce existují další faktury — nejdřív je zruš." }, { status: 409 })
    }

    if (f.sf_id) await deleteSFInvoice(Number(f.sf_id))
    const { error: dErr } = await db.from("svatby_faktury").delete().eq("id", id)
    if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 })
    if (f.sf_id) await db.from("faktury").delete().eq("sf_id", f.sf_id)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
