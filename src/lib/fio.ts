// Fio banka REST API
// Docs: https://www.fio.cz/bankovni-sluzby/api-bankovnictvi
// Min. doporučený interval dotazu: 30 s

const FIO_BASE = "https://fioapi.fio.cz/v1/rest"

// ── Typy ─────────────────────────────────────────────────────────────────────

export interface FioTransaction {
  idPohybu:      number        // column22 — unikátní ID, slouží jako idempotency key
  datumMs:       number        // column0  — Unix timestamp v ms
  objem:         number        // column1  — kladný = příchozí, záporný = odchozí
  mena:          string        // column14
  protiucet:     string | null // column2
  protiucetNazev:string | null // column10
  ks:            string | null // column4  — konstantní symbol
  vs:            string | null // column5  — variabilní symbol ← klíčový pro párování
  ss:            string | null // column6  — specifický symbol
  typ:           string | null // column8  — typ pohybu
  komentar:      string | null // column25
}

type RawColumn = { value: unknown; name: string; id: number } | null

function col(t: Record<string, RawColumn>, key: string): unknown | null {
  return t[key]?.value ?? null
}

function parseTransaction(t: Record<string, RawColumn>): FioTransaction {
  return {
    idPohybu:       Number(col(t, "column22") ?? 0),
    datumMs:        Number(col(t, "column0")  ?? 0),
    objem:          Number(col(t, "column1")  ?? 0),
    mena:           String(col(t, "column14") ?? "CZK"),
    protiucet:      col(t, "column2")  != null ? String(col(t, "column2"))  : null,
    protiucetNazev: col(t, "column10") != null ? String(col(t, "column10")) : null,
    ks:             col(t, "column4")  != null ? String(col(t, "column4"))  : null,
    vs:             col(t, "column5")  != null ? String(col(t, "column5"))  : null,
    ss:             col(t, "column6")  != null ? String(col(t, "column6"))  : null,
    typ:            col(t, "column8")  != null ? String(col(t, "column8"))  : null,
    komentar:       col(t, "column25") != null ? String(col(t, "column25")) : null,
  }
}

// ── Nastav zarážku na dané datum (posune ukazatel posledního stažení) ─────────

async function nastavZarazku(token: string, isoDate: string): Promise<void> {
  const url = `${FIO_BASE}/set-last-date/${token}/${isoDate}/`
  await fetch(url, { cache: "no-store" })
}

// ── Stáhni pohyby od posledního dotazu (zarážka je serverová — automatická) ──

export async function fetchNewTransactions(): Promise<FioTransaction[]> {
  const token = process.env.FIO_TOKEN
  if (!token) throw new Error("FIO_TOKEN není nastaven")

  const url = `${FIO_BASE}/last/${token}/transactions.json`

  const res = await fetch(url, { cache: "no-store" })

  // HTTP 422 = zarážka ukazuje na datum starší než 90 dní → automaticky ji posuneme
  // na včerejšek a vrátíme prázdný seznam (příští volání już bude fungovat)
  if (res.status === 422) {
    const vcera = new Date()
    vcera.setDate(vcera.getDate() - 1)
    const isoVcera = vcera.toISOString().slice(0, 10)
    await nastavZarazku(token, isoVcera)
    console.log(`[fio] Zarážka posunuta na ${isoVcera}, příští sync stáhne nové pohyby`)
    return []   // toto volání vrátí prázdný seznam, příště bude OK
  }

  if (!res.ok) throw new Error(`Fio HTTP ${res.status}: ${await res.text()}`)

  type FioJson = {
    accountStatement: {
      transactionList: {
        transaction: Array<Record<string, RawColumn>> | null
      }
    }
  }

  const json = (await res.json()) as FioJson
  const list = json.accountStatement?.transactionList?.transaction
  if (!list) return []

  return list.map(parseTransaction)
}
