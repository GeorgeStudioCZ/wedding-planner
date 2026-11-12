import { supabase } from "@/lib/supabase"

export type Uzivatel = { id: string; jmeno: string }

// Seznam uživatelů CRM (tabulka profily)
export async function nactiUzivatele(): Promise<Uzivatel[]> {
  const { data } = await supabase.from("profily").select("id, jmeno").order("jmeno")
  return (data ?? []) as Uzivatel[]
}

// ID právě přihlášeného uživatele
export async function aktualniUzivatelId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export function jmenoVlastnika(uzivatele: Uzivatel[], id: string | null | undefined): string {
  if (!id) return "bez vlastníka"
  return uzivatele.find(u => u.id === id)?.jmeno ?? "neznámý"
}
