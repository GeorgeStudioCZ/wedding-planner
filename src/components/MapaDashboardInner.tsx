"use client"

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

const ikona = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  iconRetinaUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const ikonaStart = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

type Bod = {
  id: string
  lat: number
  lng: number
  jmeno_nevesty: string
  jmeno_zenicha: string
  datum_svatby: string
  adresa_obradu: string
}

function formatDatum(datum: string) {
  if (!datum) return ""
  return new Date(datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
}

export default function MapaDashboardInner({ body }: { body: Bod[] }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 420 }}>
      <MapContainer
        center={[49.8, 15.5]}
        zoom={7}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        {/* Start — Hradec Králové */}
        <Marker position={[50.2099846, 15.8198059]} icon={ikonaStart}>
          <Popup>
            <strong>Hradec Králové</strong><br />Tvoje základna
          </Popup>
        </Marker>

        {/* Všechny místa obřadů */}
        {body.map((b) => (
          <Marker key={b.id} position={[b.lat, b.lng]} icon={ikona}>
            <Popup>
              <strong>{b.jmeno_nevesty} & {b.jmeno_zenicha}</strong><br />
              {formatDatum(b.datum_svatby)}<br />
              <span className="text-gray-500 text-xs">{b.adresa_obradu}</span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
