import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function logEmail(entry: {
  sluzba: string
  typ: string
  to_email: string
  to_name?: string | null
  subject: string
  html: string
  status?: string
}) {
  const { error } = await supabase
    .from("komunikace_emaily")
    .insert({ ...entry, status: entry.status ?? "sent" })
  if (error) console.error("[logEmail]", error.message)
}
