// Kontrola výsledku zápisu do databáze.
// Záznamy z předchozí firmy jsou zamčené triggerem v DB; zobrazí se srozumitelná hláška.
export function zapisOk(error: { message: string } | null | undefined): boolean {
  if (!error) return true
  alert(
    error.message.includes("předchozí firmy")
      ? "Tento záznam je z předchozí firmy a nelze ho měnit ani mazat."
      : "Chyba při ukládání: " + error.message,
  )
  return false
}
