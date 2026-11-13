import { NextResponse } from "next/server"
import { adminDb } from "@/lib/supabase-admin"

// Doklady vystavené přes CRM pro stránku Fakturace: půjčovna (tabulka `faktury`)
// a svatby (tabulka `svatby_faktury`). George Studio si stránka načítá sama.
// Přístup jen pro přihlášené (hlídá middleware).

export type DokladRadek = {
  key: string
  modul: "pujcovna" | "svatby"
  typ: "zaloha" | "faktura" | "dobropis"
  datum: string
  zakaznik: string
  cislo: string | null
  vs: string | null
  castka: number | null
  pdf_url: string | null
  stara_firma: boolean
  zaplaceno: boolean | null     // null = CRM stav neeviduje
  odkaz: string | null          // detail v CRM
}

export async function GET() {
  const db = adminDb()
  const [puj, sv] = await Promise.all([
    db.from("faktury").select("*").order("created_at", { ascending: false }),
    db.from("svatby_faktury")
      .select("id, typ, cislo, vs, castka, pdf_url, stav, created_at, zakazka_id, zakazky(jmeno_nevesty, jmeno_zenicha)")
      .order("created_at", { ascending: false }),
  ])
  if (puj.error || sv.error) {
    return NextResponse.json({ ok: false, error: puj.error?.message ?? sv.error?.message }, { status: 500 })
  }

  const radky: DokladRadek[] = [
    ...(puj.data ?? []).map(f => ({
      key: `puj-${f.id}`,
      modul: "pujcovna" as const,
      typ: f.typ as DokladRadek["typ"],
      datum: f.created_at as string,
      zakaznik: (f.zakaznik as string | null) ?? "—",
      cislo: f.cislo as string | null,
      vs: f.vs as string | null,
      castka: f.castka != null ? Number(f.castka) : null,
      pdf_url: f.pdf_url as string | null,
      stara_firma: !!f.stara_firma,
      zaplaceno: null,
      odkaz: null,
    })),
    ...(sv.data ?? []).map(f => {
      const z = f.zakazky as unknown as { jmeno_nevesty: string | null; jmeno_zenicha: string | null } | null
      return {
        key: `sv-${f.id}`,
        modul: "svatby" as const,
        // v tabulce svateb: zaloha | ostra (faktura ze zálohy) | doplatek (faktura)
        typ: (f.typ === "zaloha" ? "zaloha" : "faktura") as DokladRadek["typ"],
        datum: f.created_at as string,
        zakaznik: z ? `${z.jmeno_nevesty ?? "—"} & ${z.jmeno_zenicha ?? "—"}` : "—",
        cislo: f.cislo as string | null,
        vs: f.vs as string | null,
        castka: f.castka != null ? Number(f.castka) : null,
        pdf_url: f.pdf_url as string | null,
        stara_firma: false,
        zaplaceno: f.stav === "zaplacena",
        odkaz: `/svatby/zakazky/${f.zakazka_id}`,
      }
    }),
  ]

  return NextResponse.json({ ok: true, doklady: radky }, { headers: { "Cache-Control": "no-store" } })
}
