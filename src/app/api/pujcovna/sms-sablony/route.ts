// GET  /api/pujcovna/sms-sablony  → vrátí všechny šablony (DB nebo fallback)
// POST /api/pujcovna/sms-sablony  → uloží/přepíše šablonu { typ, text }

import { NextRequest, NextResponse } from "next/server"
import { createClient }              from "@supabase/supabase-js"
import { SMS_TYPY, SMS_NAZVY, SMS_FALLBACK, SmsTyp } from "@/lib/sms-templates"

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function GET() {
  try {
    const { data, error } = await sb()
      .from("sms_sablony")
      .select("typ, text, updated_at")

    if (error) throw error

    const map: Record<string, { text: string; updated_at: string }> = {}
    for (const row of data ?? []) map[row.typ] = row

    const sablony = SMS_TYPY.map(typ => ({
      typ,
      nazev:      SMS_NAZVY[typ],
      text:       map[typ]?.text ?? SMS_FALLBACK[typ],
      fallback:   SMS_FALLBACK[typ],
      is_custom:  !!map[typ],
      updated_at: map[typ]?.updated_at ?? null,
    }))

    return NextResponse.json({ ok: true, sablony })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { typ, text } = (await req.json()) as { typ: SmsTyp; text: string }

    if (!SMS_TYPY.includes(typ)) {
      return NextResponse.json({ ok: false, error: "Neplatný typ šablony" }, { status: 400 })
    }
    if (!text?.trim()) {
      return NextResponse.json({ ok: false, error: "Text šablony nesmí být prázdný" }, { status: 400 })
    }

    const { error } = await sb()
      .from("sms_sablony")
      .upsert(
        { typ, text: text.trim(), updated_at: new Date().toISOString() },
        { onConflict: "typ" },
      )

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
