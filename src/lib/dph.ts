/**
 * DPH utility — sazba vždy 21 %
 * Ceny v DB jsou VŽDY uloženy S DPH (konečná cena).
 */

export const DPH_SAZBA = 0.21          // 21 %
export const DPH_KOEF  = 1 + DPH_SAZBA // 1.21

/** Základ bez DPH (cena v DB je s DPH) */
export function bezDPH(cenaSdph: number): number {
  return cenaSdph / DPH_KOEF
}

/** Částka samotné DPH */
export function castDPH(cenaSdph: number): number {
  return cenaSdph - cenaSdph / DPH_KOEF
}

/** Formátuje číslo jako českou měnu: "15 000 Kč" */
export function formatKc(c: number): string {
  return Math.round(c).toLocaleString("cs-CZ") + " Kč"
}

/**
 * Vrátí objekt se třemi hodnotami pro zobrazení DPH rozpadu.
 * Vstup: cena S DPH (jak je uložena v DB).
 */
export function dphRozpad(cenaSdph: number): {
  sdph:   number   // konečná cena zákazníka
  bezdph: number   // základ pro fakturu
  dph:    number   // samotná daň
} {
  const bezdph = bezDPH(cenaSdph)
  return {
    sdph:   cenaSdph,
    bezdph,
    dph:    cenaSdph - bezdph,
  }
}
