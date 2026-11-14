import { NextRequest, NextResponse } from "next/server"

// GET /api/ares?ico=05524971
// Načte základní údaje firmy z veřejného rejstříku ARES (bez klíče). Vyžaduje přihlášení (middleware).
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("ico") ?? "").replace(/\s+/g, "")
  if (!/^\d{1,8}$/.test(raw)) {
    return NextResponse.json({ ok: false, error: "IČO musí mít nejvýše 8 číslic" }, { status: 400 })
  }
  const ico = raw.padStart(8, "0")

  try {
    const res = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    if (res.status === 404) return NextResponse.json({ ok: false, error: `IČO ${ico} nebylo v ARES nalezeno` }, { status: 404 })
    if (!res.ok) return NextResponse.json({ ok: false, error: `ARES vrátil chybu (${res.status})` }, { status: 502 })

    const d = await res.json() as {
      obchodniJmeno?: string
      dic?: string
      sidlo?: {
        nazevUlice?: string; cisloDomovni?: number; cisloOrientacni?: number; cisloOrientacniPismeno?: string
        nazevObce?: string; nazevCastiObce?: string; psc?: number
      }
    }
    const s = d.sidlo ?? {}

    // Ulice a číslo popisné/orientační: "Ve stínu 1285/19". Bez ulice (malé obce) se použije část obce.
    const cislo = s.cisloDomovni != null
      ? `${s.cisloDomovni}${s.cisloOrientacni != null ? `/${s.cisloOrientacni}${s.cisloOrientacniPismeno ?? ""}` : ""}`
      : ""
    const ulice = [s.nazevUlice ?? s.nazevCastiObce ?? s.nazevObce, cislo].filter(Boolean).join(" ")

    return NextResponse.json({
      ok: true,
      ico,
      firma: d.obchodniJmeno ?? "",
      dic: d.dic ?? "",
      ulice,
      mesto: s.nazevObce ?? "",
      psc: s.psc != null ? String(s.psc).padStart(5, "0") : "",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: "ARES se nepodařilo načíst: " + msg }, { status: 502 })
  }
}
