import { NextResponse } from "next/server"

export async function GET() {
  try {
    const res = await fetch("https://www.mbenzin.cz", {
      next: { revalidate: 3600 }, // cache na 1 hodinu
    })
    const html = await res.text()

    // Najdi průměrnou cenu benzínu — číslo ve formátu "41,30" za nadpisem "Benzín"
    const match = html.match(/Benz[íi]n[\s\S]{0,200}?(\d{2},\d{2})/)
    if (!match) {
      return NextResponse.json({ error: "Cena nenalezena" }, { status: 500 })
    }

    const cena = parseFloat(match[1].replace(",", "."))
    return NextResponse.json({ cena })
  } catch {
    return NextResponse.json({ error: "Chyba načítání" }, { status: 500 })
  }
}
