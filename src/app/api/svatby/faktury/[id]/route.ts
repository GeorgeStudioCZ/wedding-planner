import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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
