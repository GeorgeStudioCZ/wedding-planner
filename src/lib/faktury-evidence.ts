import { adminDb } from "@/lib/supabase-admin"

// Evidence dokladů půjčovny vystavených přes CRM (tabulka `faktury`).
// Stránka Fakturace zobrazuje jen to, co je zde zapsané — tedy jen doklady
// vystavené přes CRM, ne vše, co je v SuperFaktuře.
// Svatby mají vlastní tabulku `svatby_faktury`, George `george_faktury`.

export type Doklad = {
  modul: "pujcovna" | "svatby" | "george"
  typ: "zaloha" | "faktura" | "dobropis"
  sf_id: number
  cislo: string
  vs?: string | null
  castka?: number | null
  zakaznik?: string | null
  pdf_url?: string | null
  souvisejici_sf_id?: number | null   // faktura → záloha, dobropis → faktura
}

// Zápis nesmí nikdy shodit vystavení dokladu — chyby jen logujeme.
export async function zapisDoklad(d: Doklad): Promise<void> {
  try {
    const db = adminDb()
    const { data: uz } = await db.from("faktury").select("id").eq("sf_id", d.sf_id).limit(1)
    if (uz && uz.length > 0) return
    const { error } = await db.from("faktury").insert({
      modul: d.modul, typ: d.typ, sf_id: d.sf_id, cislo: d.cislo,
      vs: d.vs ?? null,
      castka: d.castka != null ? Math.round(d.castka * 100) / 100 : null,
      zakaznik: d.zakaznik ?? null, pdf_url: d.pdf_url ?? null,
      souvisejici_sf_id: d.souvisejici_sf_id ?? null,
    })
    if (error) console.error("[evidence dokladů]", error.message)
  } catch (e) {
    console.error("[evidence dokladů]", e instanceof Error ? e.message : e)
  }
}
