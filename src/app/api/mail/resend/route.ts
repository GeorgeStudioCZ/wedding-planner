import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendMail, MailSluzba } from "@/lib/mailer"
import { logEmail } from "@/lib/email-log"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json()

    const { data: email, error } = await supabase
      .from("komunikace_emaily")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !email) {
      return NextResponse.json({ ok: false, error: "Email nenalezen" }, { status: 404 })
    }

    await sendMail({
      sluzba: email.sluzba as MailSluzba,
      to: email.to_email,
      subject: email.subject,
      html: email.html,
    })

    await logEmail({
      sluzba: email.sluzba,
      typ: email.typ,
      to_email: email.to_email,
      to_name: email.to_name,
      subject: `[znovu] ${email.subject}`,
      html: email.html,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[mail/resend]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
