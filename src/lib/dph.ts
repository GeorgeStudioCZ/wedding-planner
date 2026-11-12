/**
 * Formátování částek. Firma není plátce DPH — ceny v systému jsou konečné.
 */

/** Formátuje číslo jako českou měnu: "15 000 Kč" */
export function formatKc(c: number): string {
  return Math.round(c).toLocaleString("cs-CZ") + " Kč"
}
