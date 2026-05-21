import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendMail } from "@/lib/mailer"
import { logEmail } from "@/lib/email-log"
import { qrPlatbaUrl } from "@/lib/superfaktura"

const SF_CISLO_UCTU = process.env.SF_CISLO_UCTU ?? "2302601281/2010"
const SF_IBAN       = process.env.SF_IBAN ?? ""

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function pocetDni(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
}

type Polozka = { id: number; name: string; category: string; cena_typ: string; cena_fixni: number | null }
type Stupen  = { polozka_id: number; dni_od: number; dni_do: number | null; cena_za_den: number }

function vypocitejCenu(pol: Polozka, stupne: Stupen[], dni: number): number | null {
  if (pol.cena_typ === "kusova") return pol.cena_fixni
  if (pol.cena_typ === "fixni")  return pol.cena_fixni ? pol.cena_fixni * dni : null
  const tier = stupne.find(s => s.polozka_id === pol.id && s.dni_od <= dni && (s.dni_do === null || s.dni_do >= dni))
  return tier ? tier.cena_za_den * dni : null
}

export async function POST(req: NextRequest) {
  try {
    const { rezervaceId } = await req.json()

    // Načti rezervaci, položku, zákazníka
    const { data: rez } = await sb.from("pujcovna_rezervace").select("*").eq("id", rezervaceId).single()
    if (!rez) return NextResponse.json({ ok: false, error: "Rezervace nenalezena" }, { status: 404 })

    if (!rez.zakaznik_id) return NextResponse.json({ ok: false, error: "Rezervace nemá zákazníka" }, { status: 400 })

    const [
      { data: zak },
      { data: polozky },
      { data: stupne },
    ] = await Promise.all([
      sb.from("zakaznici").select("jmeno, prijmeni, email, telefon").eq("id", rez.zakaznik_id).single(),
      sb.from("pujcovna_polozky").select("*"),
      sb.from("pujcovna_ceny_stupne").select("*"),
    ])

    if (!zak?.email) return NextResponse.json({ ok: false, error: "Zákazník nemá e-mail" }, { status: 400 })

    const allPolozky: Polozka[] = polozky ?? []
    const allStupne:  Stupen[]  = stupne  ?? []
    const polozka = allPolozky.find(p => p.id === rez.item_id)
    if (!polozka) return NextResponse.json({ ok: false, error: "Položka nenalezena" }, { status: 404 })

    // Příslušenství skupiny
    let prislData: { pol: Polozka; rez: typeof rez }[] = []
    if (rez.group_id) {
      const { data: skupRez } = await sb
        .from("pujcovna_rezervace").select("*")
        .eq("group_id", rez.group_id).neq("id", rez.id)
      if (skupRez?.length) {
        prislData = skupRez
          .map((r: typeof rez) => ({ pol: allPolozky.find(p => p.id === r.item_id)!, rez: r }))
          .filter(x => x.pol)
      }
    }

    // Ceny
    const dni       = pocetDni(rez.start_date, rez.end_date)
    const cenaStan  = vypocitejCenu(polozka, allStupne, dni)
    const montazPopl = polozka.category === "Stany" && dni <= 4 ? 500 : 0

    const prislAgg: Record<number, { nazev: string; cnt: number; cena: number | null }> = {}
    for (const { pol: p, rez: r } of prislData) {
      const c = vypocitejCenu(p, allStupne, pocetDni(r.start_date, r.end_date))
      prislAgg[p.id] = prislAgg[p.id]
        ? { ...prislAgg[p.id], cnt: prislAgg[p.id].cnt + 1 }
        : { nazev: p.name, cnt: 1, cena: c }
    }
    const prisl = Object.values(prislAgg)

    const celkem =
      (cenaStan ?? 0) +
      prisl.reduce((s, r) => s + (r.cena ?? 0) * r.cnt, 0) +
      montazPopl

    // Platební údaje (jen pokud má proformu)
    const platba = rez.sf_vs ? {
      vs:          rez.sf_vs,
      invoice_no:  "",
      cislo_uctu:  SF_CISLO_UCTU,
      qr_url:      SF_IBAN ? qrPlatbaUrl(SF_IBAN, rez.sf_vs, celkem) : "",
    } : undefined

    // Import HTML šablony voláme přes interní fetch, abychom nemuseli duplikovat šablonu
    const payload = {
      zakaznik:     { jmeno: zak.jmeno, prijmeni: zak.prijmeni, email: zak.email, telefon: zak.telefon },
      polozka:      polozka.name,
      dateFrom:     rez.start_date,
      dateTo:       rez.end_date,
      dni,
      vozidlo:      rez.vozidlo ?? "",
      casVyzvednuti: rez.cas_vyzvednuti ?? "",
      casVraceni:   rez.cas_vraceni ?? "",
      pricniky:     rez.pricniky ?? "",
      poznamka:     rez.notes ?? "",
      drzakVariant: "",
      prisl,
      cenaStan,
      montazPopl,
      celkem,
      groupId:      rez.group_id ?? "",
      ...(platba ? { platba } : {}),
    }

    // Pošli přes existující mail route handler (reuse HTML šablon)
    const origin = req.headers.get("origin") ?? req.nextUrl.origin
    const mailRes = await fetch(`${origin}/api/mail/rezervace-pujcovna`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!mailRes.ok) {
      const err = await mailRes.text()
      return NextResponse.json({ ok: false, error: err }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[pujcovna/resend-rezervace]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
