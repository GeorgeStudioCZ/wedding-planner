import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { vytvorDobropis } from "@/lib/superfaktura"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// POST /api/pujcovna/storno-dobropis
// Body: { rezervaceId, groupId, sfFakturaId, percentVraceni, castka }
export async function POST(req: NextRequest) {
  try {
    const { rezervaceId, groupId, sfFakturaId, percentVraceni, castka } = await req.json() as {
      rezervaceId:    number
      groupId:        string | null
      sfFakturaId:    number
      percentVraceni: number
      castka:         number
    }

    if (typeof percentVraceni !== "number" || percentVraceni < 0 || percentVraceni > 100) {
      return NextResponse.json({ ok: false, error: "percentVraceni musí být 0–100" }, { status: 400 })
    }

    // Vytvoř dobropis v SF — pouze pokud existuje sf_faktura_id
    let dobropis: { invoice_no: string; id: number; pdf_url: string } | null = null
    if (sfFakturaId) {
      dobropis = await vytvorDobropis(sfFakturaId, percentVraceni, castka)
    }

    // Aktualizuj stav rezervací v DB na "storno"
    if (groupId) {
      await sb.from("pujcovna_rezervace").update({ stav: "storno" }).eq("group_id", groupId)
    } else {
      await sb.from("pujcovna_rezervace").update({ stav: "storno" }).eq("id", rezervaceId)
    }

    // Zapiš do historie
    const poznamka = dobropis
      ? `Dobropis ${dobropis.invoice_no} (${percentVraceni} % vráceno)`
      : `Storno bez dobropisu (${percentVraceni} % vráceno)`
    await sb.from("pujcovna_rezervace_historie").insert([{
      rezervace_id: rezervaceId,
      stav:         "storno",
      poznamka,
    }])

    return NextResponse.json({
      ok:           true,
      dobropis_no:  dobropis?.invoice_no ?? null,
      dobropis_id:  dobropis?.id ?? null,
      dobropis_pdf: dobropis?.pdf_url ?? null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[pujcovna/storno-dobropis]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
