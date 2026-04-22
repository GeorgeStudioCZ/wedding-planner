import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
})

const serif = Space_Grotesk({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
