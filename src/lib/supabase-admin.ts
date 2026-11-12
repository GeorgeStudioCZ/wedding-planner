import { createClient } from "@supabase/supabase-js"

// Serverový klient se service role klíčem — obchází RLS.
// Používat POUZE v API routách a serverových knihovnách, nikdy v klientském kódu.
export function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
