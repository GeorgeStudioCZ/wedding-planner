// Sdílená logika veřejného rezervačního formuláře půjčovny.
// Používá ji formulář (prohlížeč) i server (/api/pujcovna/web-rezervace),
// aby cena a dostupnost vycházely vždy stejně a server se nespoléhal na data z prohlížeče.

export type Polozka = {
  id: number; name: string; category: string
  unit_num: number; sort_order: number
  cena_typ: "fixni" | "stupnovana" | "kusova"
  cena_fixni: number | null; neomezene?: boolean
}
export type Stupen = { polozka_id: number; dni_od: number; dni_do: number | null; cena_za_den: number }
export type RezRow = { id: number; item_id: number; unit_index: number; start_date: string; end_date: string; group_id: string | null }

// PRISL_CATS = kategorie příslušenství zobrazené v sekci Příslušenství
export const PRISL_CATS = new Set(["Markýzy","Sedátka","Napájení","Ledničky","Redukce","Camping sety","Stolky","Vařiče","Reproduktory","Držáky kol","Ostatní"])
// PRISL_ORDER = požadované pořadí zobrazení kategorií příslušenství (Ostatní až na konec)
export const PRISL_ORDER = ["Markýzy","Napájení","Ledničky","Redukce","Camping sety","Stolky","Sedátka","Vařiče","Reproduktory","Držáky kol","Ostatní"]
// NOT_MAIN_CATS = všechny kategorie které NEJSOU samostatně půjčitelné (příslušenství + příčníky)
export const NOT_MAIN_CATS = new Set([...PRISL_CATS, "Příčníky"])
export const BARVY_STANU: Record<string, string> = { "mal":"#F23753", "střed":"#3477F5", "velk":"#F3940E" }

// Zobrazovaný název a technické info autostanů — jen pro veřejný formulář, DB se nemění
export const STAN_DETAILS: Record<string, { nazev: string; info: string }> = {
  "mal":   { nazev: "Autostan MALÁ Alaska pro 2 osoby",   info: "rozměr matrace: 135×235 cm | váha: 50 kg" },
  "střed": { nazev: "Autostan STŘEDNÍ Alaska pro 3 osoby", info: "rozměr matrace: 155×235 cm | váha: 55 kg" },
  "velk":  { nazev: "Autostan VELKÁ Alaska pro 4 osoby",   info: "rozměr matrace: 185×235 cm | váha: 65 kg" },
}

export function stanDetail(pol: Polozka): { nazev: string; info: string } | null {
  if (pol.category !== "Stany") return null
  const n = pol.name.toLowerCase()
  for (const [k, v] of Object.entries(STAN_DETAILS)) if (n.includes(k)) return v
  return null
}

// Virtuální kategorie Držáky kol — dvě varianty, obě odkazují na stejný produkt Thule
export const DRZAK_KAT        = "Držáky kol"
export const DRZAK_THULE_NAME = "Držák kol Thule"
export const DRZAK_VARIANTY   = [
  { label: "Držák pro 3 kola", pocetKol: 3 },
  { label: "Držák pro 4 kola", pocetKol: 4 },
]

export const MONTAZ_POPLATEK = 500   // Kč, u stanů při pronájmu do 4 dnů včetně

export function pocetDni(a: string, b: string) { return Math.round((+new Date(b) - +new Date(a)) / 86400000) + 1 }

export function barvaPolozky(pol: Polozka): string {
  if (pol.category !== "Stany") return "#10b981"
  const n = pol.name.toLowerCase()
  for (const [k,v] of Object.entries(BARVY_STANU)) if (n.includes(k)) return v
  return "#10b981"
}

export function cenaPolozky(pol: Polozka, stupne: Stupen[], dni: number): number | null {
  if (pol.cena_typ === "kusova") return pol.cena_fixni ?? null
  if (pol.cena_typ === "fixni")  return pol.cena_fixni != null ? pol.cena_fixni * dni : null
  // Přesný tier (dni_od <= dni <= dni_do, nebo dni_do = null = neomezeno)
  const tier = stupne.find(s => s.polozka_id === pol.id && s.dni_od <= dni && (s.dni_do === null || s.dni_do >= dni))
  if (tier) return tier.cena_za_den * dni
  // Záloha: nejvyšší tier jehož dni_od <= dni (pokryje mezery v ceníku)
  const fallback = stupne
    .filter(s => s.polozka_id === pol.id && s.dni_od <= dni)
    .sort((a, b) => b.dni_od - a.dni_od)[0]
  return fallback ? fallback.cena_za_den * dni : null
}

export function volnych(itemId: number, unitNum: number, neomezene: boolean|undefined, start: string, end: string, rez: RezRow[]) {
  if (neomezene) return 999
  const obs = rez.filter(r => r.item_id === itemId && start <= r.end_date && end >= r.start_date).length
  return Math.max(0, unitNum - obs)
}

export function freeUnit(itemId: number, unitNum: number, start: string, end: string, rez: RezRow[], used: number[]) {
  for (let ui = 0; ui < unitNum; ui++) {
    if (used.includes(ui)) continue
    if (!rez.some(r => r.item_id === itemId && r.unit_index === ui && start <= r.end_date && end >= r.start_date)) return ui
  }
  return 0
}

// Montážní poplatek: jen u stanů, při pronájmu na 1–4 dny
export function montazniPoplatek(jeStany: boolean, dni: number): number {
  return jeStany && dni > 0 && dni <= 4 ? MONTAZ_POPLATEK : 0
}
