import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function logEmail(entry: {
  sluzba:   string
  typ:      string
  to_email: string
  to_name?: string | null
  subject:  string
  html:     string
  status?:  string
}) {
  const { error } = await supabase
    .from("komunikace_emaily")
    .insert({ ...entry, kanal: "email", status: entry.status ?? "sent" })
  if (error) console.error("[logEmail]", error.message)
}

export async function logSms(entry: {
  sluzba:   string
  typ:      string
  to_tel:   string
  to_name?: string | null
  text:     string
  status?:  string          // "sent" | "error"
  error?:   string          // chybová zpráva pokud status="error"
}) {
  const { error } = await supabase
    .from("komunikace_emaily")
    .insert({
      kanal:    "sms",
      sluzba:   entry.sluzba,
      typ:      entry.typ,
      to_email: entry.to_tel,   // pole reuse — pro SMS ukládáme telefonní číslo
      to_name:  entry.to_name ?? null,
      subject:  entry.text,
      html:     entry.error ? `Chyba: ${entry.error}` : "",
      status:   entry.status ?? "sent",
    })
  if (error) console.error("[logSms]", error.message)
}
