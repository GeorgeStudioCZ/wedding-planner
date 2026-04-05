const START = { lat: 50.2099846, lng: 15.8198059 } // Střelecká 809/41, Hradec Králové

export async function geocodeAdresu(adresa: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresa)}&limit=1&countrycodes=cz`
    const res = await fetch(url, { headers: { "Accept-Language": "cs" } })
    const data = await res.json()
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
    return null
  } catch {
    return null
  }
}

export async function vypocitejVzdalenost(
  adresaObradu: string
): Promise<{ vzdalenost_km: number | null; lat: number | null; lng: number | null }> {
  try {
    const cil = await geocodeAdresu(adresaObradu)
    if (!cil) return { vzdalenost_km: null, lat: null, lng: null }

    const url = `https://router.project-osrm.org/route/v1/driving/${START.lng},${START.lat};${cil.lng},${cil.lat}?overview=false`
    const res = await fetch(url)
    const data = await res.json()

    if (data.routes?.length > 0) {
      const km = Math.round((data.routes[0].distance / 1000) * 10) / 10
      return { vzdalenost_km: km, lat: cil.lat, lng: cil.lng }
    }
    return { vzdalenost_km: null, lat: cil.lat, lng: cil.lng }
  } catch {
    return { vzdalenost_km: null, lat: null, lng: null }
  }
}
