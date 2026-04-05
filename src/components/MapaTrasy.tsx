"use client"

import dynamic from "next/dynamic"

const MapaTrasyInner = dynamic(() => import("./MapaTrasyInner"), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-400 text-center" style={{ height: 300 }}>
      Načítám mapu...
    </div>
  ),
})

type Props = {
  adresaPripravy: string
  adresaObradu: string
  adresaVeseli: string
}

export default function MapaTrasy(props: Props) {
  return <MapaTrasyInner {...props} />
}
