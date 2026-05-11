// GET /api/mail/test?sluzba=stany&to=vas@email.cz
// Odešle testovací email — SMAZAT nebo chránit před deployem do produkce

import { NextRequest, NextResponse } from "next/server"
import { sendMail, MailSluzba } from "@/lib/mailer"

export async function GET(req: NextRequest) {
  const sluzba = (req.nextUrl.searchParams.get("sluzba") ?? "stany") as MailSluzba
  const to     = req.nextUrl.searchParams.get("to") ?? ""

  if (!to) return NextResponse.json({ error: "Chybí parametr ?to=" }, { status: 400 })

  // Debug: ukáže co skutečně čteme z env (hesla maskována)
  const envDebug = {
    SMTP_HOST: process.env.SMTP_HOST ?? "(undefined)",
    SMTP_PORT: process.env.SMTP_PORT ?? "(undefined)",
    SMTP_USER_STANY:  process.env.SMTP_USER_STANY  ?? "(undefined)",
    SMTP_USER_SVATBY: process.env.SMTP_USER_SVATBY ?? "(undefined)",
    SMTP_USER_GEORGE: process.env.SMTP_USER_GEORGE ?? "(undefined)",
    SMTP_PASS_STANY:  process.env.SMTP_PASS_STANY  ? "✓ set" : "(undefined)",
    SMTP_PASS_SVATBY: process.env.SMTP_PASS_SVATBY ? "✓ set" : "(undefined)",
    SMTP_PASS_GEORGE: process.env.SMTP_PASS_GEORGE ? "✓ set" : "(undefined)",
  }

  try {
    await sendMail({
      sluzba,
      to,
      subject: `Testovací email — ${sluzba}`,
      html: `<p>Tento email byl odeslán z CRM přes SMTP (<strong>${sluzba}</strong>).</p>
             <p>Pokud ho vidíš, napojení funguje ✅</p>`,
    })
    return NextResponse.json({ ok: true, sluzba, to, envDebug })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg, envDebug }, { status: 500 })
  }
}
