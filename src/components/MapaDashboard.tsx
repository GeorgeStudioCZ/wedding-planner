"use client"

import dynamic from "next/dynamic"

const MapaDashboardInner = dynamic(() => import("./MapaDashboardInner"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm" style={{ flex: 1, minHeight: 300 }}>
      Načítám mapu...
    </div>
  ),
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

export default function MapaDashboard({ body }: { body: Bod[] }) {
  return <MapaDashboardInner body={body} />
}
