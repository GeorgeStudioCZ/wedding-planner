import nodemailer, { Transporter } from "nodemailer"

// ── Dostupné odesílací identity ────────────────────────────────────────────
export type MailSluzba = "svatby" | "stany" | "george"

const SLUZBY: Record<MailSluzba, { user: string; pass: string; from: string }> = {
  svatby: {
    user: process.env.SMTP_USER_SVATBY!,
    pass: process.env.SMTP_PASS_SVATBY!,
    from: `"Svatební video HK" <${process.env.SMTP_USER_SVATBY}>`,
  },
  stany: {
    user: process.env.SMTP_USER_STANY!,
    pass: process.env.SMTP_PASS_STANY!,
    from: `"Jiří ze Stanujnaautě.cz" <${process.env.SMTP_USER_STANY}>`,
  },
  george: {
    user: process.env.SMTP_USER_GEORGE!,
    pass: process.env.SMTP_PASS_GEORGE!,
    from: `"George Studio" <${process.env.SMTP_USER_GEORGE}>`,
  },
}

// Transportéry cachujeme per-identity (nevytváříme nový při každém volání)
const cache: Partial<Record<MailSluzba, Transporter>> = {}

function getTransporter(sluzba: MailSluzba): Transporter {
  if (cache[sluzba]) return cache[sluzba]!
  const cfg = SLUZBY[sluzba]
  cache[sluzba] = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true, // port 465 = SSL
    auth: { user: cfg.user, pass: cfg.pass },
  })
  return cache[sluzba]!
}

// ── Hlavní funkce pro odesílání ────────────────────────────────────────────
export interface MailOptions {
  sluzba: MailSluzba
  to: string
  subject: string
  html: string
  replyTo?: string
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const cfg = SLUZBY[opts.sluzba]
  const transporter = getTransporter(opts.sluzba)
  await transporter.sendMail({
    from: cfg.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo ?? cfg.user,
  })
}
