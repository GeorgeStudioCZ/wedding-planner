// Zmražené ceny záznamů z předchozí firmy.
// Zdrojem je uložená faktura (sf_platba_data), ne aktuální ceník.

export type ZamrzlaPolozka = { nazev: string; pocet: number; cena_sdph: number }

type RezZdroj = {
  id: number
  group_id: string | null
  sf_legacy?: boolean | null
  sf_platba_data?: { polozky?: ZamrzlaPolozka[] } | null
}

/** Vrátí zmraženou cenu skupiny, nebo null pokud záznam není zamčený / nemá fakturu. */
export function zamrzleZaplaceni<T extends RezZdroj>(
  rez: T,
  vsechny: T[],
): { celkem: number; polozky: ZamrzlaPolozka[]; jeHlavni: boolean } | null {
  if (!rez.sf_legacy) return null
  const skupina = rez.group_id ? vsechny.filter(x => x.group_id === rez.group_id) : [rez]
  const hlavni = skupina.find(x => (x.sf_platba_data?.polozky?.length ?? 0) > 0)
  if (!hlavni) return null
  const polozky = hlavni.sf_platba_data!.polozky!
  const celkem = Math.round(polozky.reduce((s, p) => s + p.cena_sdph * p.pocet, 0) * 100) / 100
  return { celkem, polozky, jeHlavni: hlavni.id === rez.id }
}
