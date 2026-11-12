import { createBrowserClient } from "@supabase/ssr"

// Klient pro stránky CRM. Nese přihlášení uživatele (session v cookies),
// takže databáze vidí, kdo se ptá, a platí pro něj pravidla RLS.
// Veřejné formuláře (/embed) do databáze přímo nesahají — používají serverové API.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
