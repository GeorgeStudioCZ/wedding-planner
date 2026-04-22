import type { Metadata, Viewport } from "next"
import { Instrument_Sans, Instrument_Serif, Geist_Mono } from "next/font/google"
import "./globals.css"

const sans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
})

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "GeorgeCRM",
  description: "Svatební a půjčovní CRM",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body style={{ fontFamily: "var(--font-sans), ui-sans-serif, system-ui", WebkitFontSmoothing: "antialiased" }}>
        {children}
      </body>
    </html>
  )
}
