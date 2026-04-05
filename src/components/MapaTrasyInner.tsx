"use client"

import { useEffect, useState } from "react"
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

const HOME = { lat: 50.1942, lng: 15.8329, label: "Hradec Králové" }

function makeIkona(barva: string) {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${barva}.png`,
    iconRetinaUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${barva}.png`,
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  })
}

async function geocode(adresa: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresa)}&limit=1&countrycodes=cz`
    const res = await fetch(url, { headers: { "Accept-Language": "cs" } })
    const data = await res.json()
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    return null
  } catch { return null }
}

function formatCas(sekund: number): string {
  const min = Math.round(sekund / 60)
  const hod = Math.floor(min / 60)
  const zbytek = min % 60
  return hod > 0 ? `${hod}:${String(zbytek).padStart(2, "0")} h` : `${min} min`
}

async function getTrasa(body: { lat: number; lng: number }[]): Promise<{ coords: [number, number][]; km: number; prvniUsekCas: string } | null> {
  try {
    const waypoints = body.map(b => `${b.lng},${b.lat}`).join(";")
    const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`
    const res = await fetch(url)
    const data = await res.json()
    if (data.routes?.length > 0) {
      const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng]
      )
      const km = Math.round((data.routes[0].distance / 1000) * 10) / 10
      const prvniUsekCas = formatCas(data.routes[0].legs?.[0]?.duration ?? 0)
      return { coords, km, prvniUsekCas }
    }
    return null
  } catch { return null }
}

function googleMapsUrl(od: string, do_: string) {
  return `https://www.google.com/maps/dir/${encodeURIComponent(od)}/${encodeURIComponent(do_)}`
}

type Props = {
  adresaPripravy: string
  adresaObradu: string
  adresaVeseli: string
}

type Coords = { lat: number; lng: number }

export default function MapaTrasyInner({ adresaPripravy, adresaObradu, adresaVeseli }: Props) {
  const [priprava, setPriprava] = useState<Coords | null>(null)
  const [obrad, setObrad] = useState<Coords | null>(null)
  const [veseli, setVeseli] = useState<Coords | null>(null)
  const [trasa, setTrasa] = useState<{ coords: [number, number][]; km: number; kmTam: number; prvniUsekCas: string } | null>(null)
  const [nacitam, setNacitam] = useState(true)

  useEffect(() => {
    async function init() {
      setNacitam(true)

      const [cPriprava, cObrad, cVeseli] = await Promise.all([
        adresaPripravy ? geocode(adresaPripravy) : null,
        adresaObradu ? geocode(adresaObradu) : null,
        adresaVeseli ? geocode(adresaVeseli) : null,
      ])

      setPriprava(cPriprava)
      setObrad(cObrad)
      setVeseli(cVeseli)

      // Sestav trasu ze všech dostupných bodů
      const bodyTam: Coords[] = [HOME]
      if (cPriprava) bodyTam.push(cPriprava)
      if (cObrad) bodyTam.push(cObrad)
      if (cVeseli) bodyTam.push(cVeseli)
      const bodyRoundtrip = [...bodyTam, HOME]

      if (bodyTam.length >= 2) {
        const [tTam, tRoundtrip] = await Promise.all([
          getTrasa(bodyTam),
          getTrasa(bodyRoundtrip),
        ])
        if (tRoundtrip) {
          setTrasa({
            coords: tRoundtrip.coords,
            km: tRoundtrip.km,
            prvniUsekCas: tTam?.prvniUsekCas ?? "",
            kmTam: tTam?.km ?? 0,
          })
        }
      }

      setNacitam(false)
    }
    init()
  }, [adresaPripravy, adresaObradu, adresaVeseli])

  if (nacitam) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-400 text-center">
        Načítám trasu...
      </div>
    )
  }

  // Střed mapy — průměr všech dostupných bodů
  const vsechnyBody = [HOME, priprava, obrad, veseli].filter(Boolean) as Coords[]
  const stred: [number, number] = [
    vsechnyBody.reduce((s, b) => s + b.lat, 0) / vsechnyBody.length,
    vsechnyBody.reduce((s, b) => s + b.lng, 0) / vsechnyBody.length,
  ]

  return (
    <div className="space-y-3">

      {/* Celková vzdálenost + doba do přípravy */}
      {trasa && (
        <div className="flex items-center justify-center gap-6 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-700">{trasa.kmTam} km</p>
            <p className="text-xs text-blue-500">celkem pouze tam</p>
          </div>
          <div className="w-px h-8 bg-blue-200" />
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-700">{trasa.km} km</p>
            <p className="text-xs text-blue-500">celkem tam i zpět</p>
          </div>
          <div className="w-px h-8 bg-blue-200" />
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-700">{trasa.prvniUsekCas}</p>
            <p className="text-xs text-blue-500">HK → příprava nevěsty</p>
          </div>
        </div>
      )}

      {/* Mapa */}
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 320 }}>
        <MapContainer center={stred} zoom={8} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Start — HK */}
          <Marker position={[HOME.lat, HOME.lng]} icon={makeIkona("blue")}>
            <Popup><strong>Start</strong><br />Hradec Králové</Popup>
          </Marker>

          {priprava && (
            <Marker position={[priprava.lat, priprava.lng]} icon={makeIkona("green")}>
              <Popup><strong>Příprava nevěsty</strong><br />{adresaPripravy}</Popup>
            </Marker>
          )}

          {obrad && (
            <Marker position={[obrad.lat, obrad.lng]} icon={makeIkona("red")}>
              <Popup><strong>Obřad</strong><br />{adresaObradu}</Popup>
            </Marker>
          )}

          {veseli && (
            <Marker position={[veseli.lat, veseli.lng]} icon={makeIkona("orange")}>
              <Popup><strong>Svatební veselí</strong><br />{adresaVeseli}</Popup>
            </Marker>
          )}

          {trasa && (
            <Polyline positions={trasa.coords} color="#3b82f6" weight={4} opacity={0.8} />
          )}
        </MapContainer>
      </div>

      {/* Tři tlačítka */}
      <div className="grid grid-cols-3 gap-2">
        <a
          href={googleMapsUrl("Střelecká 809/41, Hradec Králové", adresaPripravy || adresaObradu)}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-medium px-3 py-2.5 rounded-lg text-center transition-colors leading-tight"
        >
          🏠 → 💒<br />
          <span className="text-blue-500">HK → Příprava</span>
        </a>
        <a
          href={googleMapsUrl(adresaPripravy || "Střelecká 809/41, Hradec Králové", adresaObradu)}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-xs font-medium px-3 py-2.5 rounded-lg text-center transition-colors leading-tight"
        >
          💒 → ⛪<br />
          <span className="text-green-600">Příprava → Obřad</span>
        </a>
        <a
          href={googleMapsUrl(adresaObradu, adresaVeseli || adresaObradu)}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-xs font-medium px-3 py-2.5 rounded-lg text-center transition-colors leading-tight"
        >
          ⛪ → 🎉<br />
          <span className="text-orange-600">Obřad → Veselí</span>
        </a>
      </div>

    </div>
  )
}
