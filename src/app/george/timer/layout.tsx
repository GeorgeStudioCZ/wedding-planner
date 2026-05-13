import type { Metadata, Viewport } from "next"

export const metadata: Metadata = {
  title: "George Studio Timer",
  manifest: "/timer-manifest.json",
}

export const viewport: Viewport = {
  themeColor: "#0e0f14",
}

export default function TimerLayout({ children }: { children: React.ReactNode }) {
  return children
}
