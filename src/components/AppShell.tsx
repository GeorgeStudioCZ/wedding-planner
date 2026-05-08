"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { createClient } from "@/lib/supabase-browser"

export type AppModule = "wed" | "van" | "studio"

// ── Inline SVG icon helper ──────────────────────────────────────────────────
function Ico({ d, size = 16 }: { d: string | string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

const I = {
  home:     ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z","M9 22V12h6v10"],
  list:     ["M8 6h13","M8 12h13","M8 18h13","M3 6h.01","M3 12h.01","M3 18h.01"],
  kanban:   ["M3 3h7v9H3z","M14 3h7v5h-7z","M14 12h7v9h-7z","M3 16h7v5H3z"],
  calendar: ["M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"],
  users:    ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2","M9 7a4 4 0 100 8 4 4 0 000-8z","M23 21v-2a4 4 0 00-3-3.87","M16 3.13a4 4 0 010 7.75"],
  wallet:   ["M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2z","M1 10h22","M16 14h.01"],
  logout:   ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4","M16 17l5-5-5-5","M21 12H9"],
  plus:     ["M12 5v14","M5 12h14"],
  search:   ["M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"],
  bell:     ["M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9","M13.73 21a2 2 0 01-3.46 0"],
  menu:     ["M3 12h18","M3 6h18","M3 18h18"],
  x:        ["M18 6L6 18","M6 6l12 12"],
}

// ── Nav items ───────────────────────────────────────────────────────────────
const NAV_WED = [
  { key: "home",     label: "Přehled",       href: "/svatby",                  ico: I.home },
  { key: "seznam",   label: "Seznam svateb", href: "/svatby/seznam",           ico: I.list },
  { key: "kalendar", label: "Kalendář",      href: "/svatby/kalendar",         ico: I.calendar },
  { key: "klienti",  label: "Klienti",       href: "/zakaznici?from=wed",      ico: I.users },
]

const NAV_VAN = [
  { key: "home",     label: "Přehled",    href: "/pujcovna",                   ico: I.home },
  { key: "seznam",   label: "Seznam",     href: "/pujcovna/seznam",            ico: I.list },
  { key: "kalendar", label: "Kalendář",   href: "/pujcovna/kalendar",          ico: I.calendar },
  { key: "klienti",  label: "Zákazníci",  href: "/zakaznici?from=van",         ico: I.users },
  { key: "cenik",    label: "Ceník",      href: "/pujcovna/cenik",             ico: I.wallet },
]

const NAV_STUDIO = [
  { key: "home",    label: "Přehled",      href: "/george",                    ico: I.home },
  { key: "cenik",   label: "Ceník služeb", href: "/george/cenik",              ico: I.wallet },
  { key: "klienti", label: "Zákazníci",    href: "/zakaznici?from=studio",     ico: I.users },
]

// ── Component ───────────────────────────────────────────────────────────────
export default function AppShell({ module, children }: { module: AppModule; children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const nav = module === "wed" ? NAV_WED : module === "van" ? NAV_VAN : NAV_STUDIO
  const isActive = (href: string) => pathname === href

  async function signOut() {
    const client = createClient()
    await client.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const ctaLabel = module === "wed" ? "Nová zakázka" : module === "van" ? "Nová rezervace" : "Nová aktivita"
  const ctaHref  = module === "wed" ? "/svatby/zakazky/nova" : module === "van" ? "/pujcovna/kalendar" : "/george"
  const accent   = module === "wed"
    ? "linear-gradient(135deg, var(--wed-grad-a), var(--wed-grad-b))"
    : module === "van"
    ? "linear-gradient(135deg, var(--van-grad-a), var(--van-grad-b))"
    : "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))"
  const accentGlow = module === "wed" ? "rgba(255,106,139,.32)" : module === "van" ? "rgba(45,212,166,.3)" : "rgba(99,102,241,.3)"

  // ── Sidebar obsah (sdílený mezi desktop+mobil) ───────────────────────────
  const sidebarContent = (
    <>
      {/* Brand */}
      <div style={{ padding: "18px 14px 14px", borderBottom: "1px dashed rgba(255,255,255,.08)", marginBottom: 6, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: "conic-gradient(from 220deg, #ff6a8b, #ff9a6a, #2dd4a6, #7cd38a, #ff6a8b)",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,.15)",
          display: "grid", placeItems: "center",
          color: "white", fontWeight: 700, fontSize: 14,
          fontFamily: "var(--font-serif), serif", fontStyle: "normal",
        }}>G</div>
        <div>
          <div style={{ fontWeight: 600, letterSpacing: "-.01em", color: "white", fontSize: 15 }}>George Studio</div>
          <div style={{ fontSize: 11, color: "#7a7b85", letterSpacing: ".08em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>CRM · 2026</div>
        </div>
      </div>

      {/* Section label */}
      <div style={{ padding: "12px 14px 6px", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#5a5b66", fontFamily: "var(--font-mono)" }}>
        {module === "wed" ? "Svatby" : module === "van" ? "Autostany" : "George Studio"}
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
        {nav.map(item => {
          const active = isActive(item.href)
          return (
            <Link key={item.key} href={item.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 10, textDecoration: "none",
                color: active ? "#fff" : "#a9aab5",
                background: active ? "rgba(255,255,255,.06)" : "transparent",
                fontSize: 13.5, transition: "background .15s, color .15s",
              }}>
              <span style={{ width: 16, height: 16, flexShrink: 0, opacity: .85, display: "flex", alignItems: "center" }}>
                <Ico d={item.ico} />
              </span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Settings */}
      <div style={{ padding: "16px 14px 6px", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#5a5b66", fontFamily: "var(--font-mono)" }}>
        Nastavení
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
        <button onClick={signOut}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 10,
            color: "#a9aab5", fontSize: 13.5,
            background: "none", border: "none", cursor: "pointer", width: "100%",
            transition: "background .15s, color .15s",
          }}>
          <span style={{ width: 16, height: 16, flexShrink: 0, opacity: .85, display: "flex", alignItems: "center" }}>
            <Ico d={I.logout} />
          </span>
          <span>Odhlásit</span>
        </button>
      </div>

      {/* Module switcher */}
      <div style={{
        margin: "20px 12px 12px",
        background: "#15161c",
        border: "1px solid rgba(255,255,255,.06)",
        borderRadius: 14, padding: 10,
      }}>
        <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#5a5b66", padding: "2px 4px 8px", fontFamily: "var(--font-mono)" }}>
          Modul
        </div>
        {([
          { mod: "wed"    as AppModule, label: "Wedding Planner",   sub: "Sezóna 2026", href: "/svatby",   grad: "linear-gradient(135deg, var(--wed-grad-a), var(--wed-grad-b))" },
          { mod: "van"    as AppModule, label: "Autostany Planner", sub: "Sezóna 2026", href: "/pujcovna", grad: "linear-gradient(135deg, var(--van-grad-a), var(--van-grad-b))" },
          { mod: "studio" as AppModule, label: "George Studio",     sub: "Časomíra",    href: "/george",   grad: "linear-gradient(135deg, var(--studio-grad-a), var(--studio-grad-b))" },
        ] as const).map(m => (
          <Link key={m.mod} href={m.href}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: 8, borderRadius: 10, textDecoration: "none",
              background: module === m.mod ? "rgba(255,255,255,.06)" : "transparent",
              transition: "background .15s",
            }}>
            <span style={{
              width: 10, height: 10, borderRadius: 99, flexShrink: 0,
              background: m.grad,
            }} />
            <div>
              <div style={{ fontSize: 13, color: "#eaeaf0", fontWeight: 500 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: "#7a7b85" }}>{m.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  )

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>

      {/* Mobile scrim */}
      {mobileOpen && (
        <div
          className="fixed inset-0 lg:hidden"
          style={{ background: "rgba(10,10,14,.45)", zIndex: 1050 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Desktop sidebar — wrapper animuje šířku ── */}
      <div
        className="hidden lg:flex flex-col shrink-0 overflow-hidden"
        style={{
          width: sidebarOpen ? 248 : 0,
          transition: "width .25s cubic-bezier(.4,0,.2,1)",
          background: "#0e0f14",
          borderRight: sidebarOpen ? "1px solid rgba(255,255,255,.05)" : "none",
        }}
      >
        <div style={{ width: 248, height: "100vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {sidebarContent}
        </div>
      </div>

      {/* ── Mobile sidebar — fixed + translate ── */}
      <aside
        className={[
          "flex flex-col shrink-0 h-screen overflow-y-auto lg:hidden",
          "fixed inset-y-0 left-0 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        style={{ width: 248, background: "#0e0f14", borderRight: "1px solid rgba(255,255,255,.05)", zIndex: 1100 }}
      >
        {sidebarContent}
      </aside>

      {/* ── Content area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="flex items-center gap-3 shrink-0"
          style={{
            padding: "10px 24px",
            background: "rgba(246,245,242,.88)",
            backdropFilter: "saturate(130%) blur(10px)",
            borderBottom: "1px solid var(--line)",
            position: "sticky", top: 0, zIndex: 5,
          }}>

          {/* Mobile hamburger */}
          <button className="lg:hidden flex items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 10, background: "white", border: "1px solid var(--line)", cursor: "pointer" }}
            onClick={() => setMobileOpen(true)}>
            <Ico d={I.menu} size={18} />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            className="hidden lg:flex items-center justify-center"
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Skrýt panel" : "Zobrazit panel"}
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "white", border: "1px solid var(--line)",
              cursor: "pointer", color: "var(--ink-2)",
              transition: "background .15s",
            }}
            onMouseOver={e => (e.currentTarget.style.background = "var(--bg)")}
            onMouseOut={e => (e.currentTarget.style.background = "white")}
          >
            <Ico d={I.menu} size={18} />
          </button>

          {/* Search — desktop: full input, mobile: icon only */}
          <div className="hidden lg:flex" style={{
            flex: 1, maxWidth: 520,
            alignItems: "center", gap: 8,
            background: "white", border: "1px solid var(--line)",
            padding: "8px 12px", borderRadius: 12, color: "var(--muted)",
          }}>
            <Ico d={I.search} size={15} />
            <span style={{ fontSize: 13.5, flex: 1, color: "var(--muted)" }}>
              {module === "wed" ? "Hledat zakázku, klienta, lokaci…" : module === "van" ? "Hledat rezervaci, zákazníka…" : "Hledat aktivitu, zákazníka…"}
            </span>
            <kbd style={{
              fontFamily: "var(--font-mono)", fontSize: 10.5,
              padding: "2px 6px", border: "1px solid var(--line)",
              borderRadius: 6, background: "#fafaf7", color: "var(--muted)",
            }}>⌘K</kbd>
          </div>
          {/* Search icon — mobile only */}
          <button className="lg:hidden flex items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 10, background: "white", border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink-2)", flexShrink: 0 }}>
            <Ico d={I.search} size={17} />
          </button>

          {/* Right actions */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button style={{
              width: 36, height: 36, borderRadius: 10,
              display: "grid", placeItems: "center", position: "relative",
              border: "1px solid var(--line)", background: "white",
              color: "var(--ink-2)", cursor: "pointer",
            }}>
              <Ico d={I.bell} />
              <span style={{
                position: "absolute", top: 7, right: 7,
                width: 7, height: 7,
                background: "var(--wed)", borderRadius: 99,
                boxShadow: "0 0 0 2px white",
              }} />
            </button>

            <Link href={ctaHref}
              className="inline-flex items-center gap-2"
              style={{
                padding: "8px 12px", borderRadius: 11,
                color: "white", textDecoration: "none",
                fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
                background: accent,
                boxShadow: `0 6px 20px ${accentGlow}`,
              }}>
              <Ico d={I.plus} size={15} />
              <span className="hidden sm:inline">{ctaLabel}</span>
            </Link>

            {/* Avatar */}
            <div style={{
              width: 36, height: 36, borderRadius: 99,
              background: "linear-gradient(135deg, #ffc67a, #ff8ca6)",
              display: "grid", placeItems: "center",
              color: "white", fontWeight: 600, fontSize: 12,
              boxShadow: "inset 0 0 0 2px white", flexShrink: 0,
            }}>JL</div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
