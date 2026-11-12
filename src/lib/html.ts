// Ošetření vstupů vkládaných do HTML e-mailů

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Rekurzivně ošetří všechny řetězce v objektu (čísla, null apod. ponechá)
export function escDeep<T>(v: T): T {
  if (typeof v === "string") return esc(v) as unknown as T
  if (Array.isArray(v)) return v.map(escDeep) as unknown as T
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = escDeep(val)
    return out as T
  }
  return v
}

export function jeEmail(s: unknown): s is string {
  return typeof s === "string" && s.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(s)
}

// Jednořádkový text do předmětu e-mailu (bez zalomení řádků)
export function jedenRadek(s: unknown, max = 200): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, max)
}

export function jeIsoDatum(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}
