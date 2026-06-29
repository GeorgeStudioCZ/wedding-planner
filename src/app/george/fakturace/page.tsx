"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function GeoFakturaceRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace("/fakturace?from=studio") }, [router])
  return null
}
