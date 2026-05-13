// Párování příchozích plateb z Fio banky s rezervacemi
// Voláno Vercel cronem každých 5 minut (nebo ručně z CRM)
//
// Logika:
//   1. Stáhni nové pohyby z Fio od posledního dotazu (/last endpoint)
//   2. Filtruj příchozí platby (objem > 0) s variabilním symbolem
//   3. Pro každý VS najdi rezervaci ve stavu "cekam-platbu"
//   4. Vytvoř ostrou fakturu ze zálohy v SuperFaktuře
//   5. Ulož stav "zaplaceno", ID faktury, ID pohybu (idempotency)
//   6. Pošli zákazníkovi email s fakturou

import { NextRequest, NextResponse } from "next/server"
import { createClient }               from "@supabase/supabase-js"
import { fetchNewTransactions }       from "@/lib/fio"
import { vytvorFakturuZeZalohy, SFKlient, SFPolozka } from "@/lib/superfaktura"
import { sendMail }                   from "@/lib/mailer"
import { htmlFaktura }                from "@/app/api/pujcovna/faktura-zaplaceno/route"

// ── Ochrana endpointu ─────────────────────────────────────────────────────────
// Vercel cron posílá: Authorization: Bearer CRON_SECRET
// Ruční volání z CRM:  GET /api/pujcovna/fio-sync?secret=CRON_SECRET

const CRON_SECRET = process.env.CRON_SECRET ?? ""

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return true  // Secret není nastaven = volný přístup
  const authHeader = req.headers.get("authorization") ?? ""
  // Vercel cron posílá Bearer token — ostatní volání (z CRM) jsou vždy povolena
  if (authHeader === `Bearer ${CRON_SECRET}`) return true
  // Volání z prohlížeče (CRM) — povoleno vždy (interní nástroj)
  return true
}

// ── Typy uložených platebních dat ─────────────────────────────────────────────

interface PlatbaData {
  klient:  SFKlient & { jmeno_display: string }
  polozky: SFPolozka[]
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 1. Stáhni nové pohyby z Fio (od poslední zarážky)
  let transactions
  try {
    transactions = await fetchNewTransactions()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[fio-sync] Fio fetch error:", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }

  // 2. Filtruj: pouze příchozí platby (objem > 0) s variabilním symbolem
  const incoming = transactions.filter(t => t.objem > 0 && t.vs)

  const stats = { celkem: transactions.length, prichozi: incoming.length, sparovano: 0, preskoceno: 0, chyby: 0 }
  const log: string[] = []

  for (const t of incoming) {
    try {
      // 3. Najdi rezervaci čekající na platbu s tímto VS
      //    fio_id_pohybu IS NULL = ještě nebylo zpracováno (idempotency)
      const { data: rez } = await sb
        .from("pujcovna_rezervace")
        .select("id, group_id, customer, sf_proforma_id, sf_platba_data, start_date, end_date")
        .eq("sf_vs", t.vs!)
        .eq("stav", "cekam-platbu")
        .is("fio_id_pohybu", null)
        .maybeSingle()

      if (!rez) {
        stats.preskoceno++
        log.push(`VS ${t.vs}: rezervace nenalezena nebo již zpracována (${t.objem} Kč)`)
        continue
      }

      // 4. Zkontroluj uložená platební data
      if (!rez.sf_platba_data || !rez.sf_proforma_id) {
        stats.preskoceno++
        log.push(`VS ${t.vs}: chybí sf_platba_data nebo sf_proforma_id`)
        continue
      }

      const platba = rez.sf_platba_data as PlatbaData

      // 5. Vytvoř ostrou fakturu ze zálohy v SuperFaktuře
      const faktura = await vytvorFakturuZeZalohy(
        rez.sf_proforma_id,
        platba.klient,
        platba.polozky,
      )

      // 6. Ulož stav "zaplaceno" pro celou skupinu (stan + příslušenství)
      await sb
        .from("pujcovna_rezervace")
        .update({ stav: "zaplaceno" })
        .eq("group_id", rez.group_id)

      // Ulož faktura ID + fio_id_pohybu pouze na hlavní rezervaci
      await sb
        .from("pujcovna_rezervace")
        .update({
          sf_faktura_id:  faktura.id,
          fio_id_pohybu:  t.idPohybu,
        })
        .eq("id", rez.id)

      // Ulož do historie
      await sb.from("pujcovna_rezervace_historie").insert({
        rezervace_id: rez.id,
        stav: "zaplaceno",
      })

      // 7. Pošli fakturu zákazníkovi emailem
      if (platba.klient.email) {
        await sendMail({
          sluzba: "stany",
          to:      platba.klient.email,
          subject: `Platba přijata – rezervace potvrzena ✅`,
          html:    htmlFaktura({
            jmeno:      platba.klient.jmeno_display,
            invoice_no: faktura.invoice_no,
            pdf_url:    faktura.pdf_url,
            polozka:    platba.polozky[0]?.nazev,
            startDate:  rez.start_date,
            endDate:    rez.end_date,
          }),
        })
      }

      stats.sparovano++
      log.push(`VS ${t.vs}: ✅ spárováno – ${rez.customer} – ${t.objem} Kč – faktura ${faktura.invoice_no}`)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[fio-sync] Chyba při zpracování VS ${t.vs}:`, msg)
      stats.chyby++
      log.push(`VS ${t.vs}: ❌ chyba – ${msg}`)
    }
  }

  console.log("[fio-sync]", stats, log)
  return NextResponse.json({ ok: true, ...stats, log })
}
