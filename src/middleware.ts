import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // API — vyžaduje přihlášeného uživatele, nebo CRON_SECRET (Vercel cron).
  // Výjimka: endpointy, které volá veřejný embed formulář (rezervace, videohovor).
  if (path.startsWith("/api/")) {
    if (PUBLIC_API.has(path)) return supabaseResponse

    const cronSecret = process.env.CRON_SECRET
    const jeCron = !!cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`
    if (jeCron || user) return supabaseResponse

    return NextResponse.json({ ok: false, error: "Nepřihlášen" }, { status: 401 })
  }

  // Veřejné embed stránky — nevyžadují přihlášení
  if (request.nextUrl.pathname.startsWith("/embed")) {
    return supabaseResponse
  }

  // Nepřihlášený uživatel → přesměruj na /login
  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Přihlášený uživatel na /login → přesměruj na rozcestník
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Veřejné API volané z embed formulářů (zákazník není přihlášen)
// Tyto endpointy si vstupy ověřují samy a nevěří datům z prohlížeče (ceny, dostupnost).
const PUBLIC_API = new Set([
  "/api/pujcovna/cenik",
  "/api/pujcovna/obsazenost",
  "/api/pujcovna/web-rezervace",
  "/api/svatby/web-obsazeno",
  "/api/svatby/web-terminy",
  "/api/svatby/web-schuzka",
])

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
