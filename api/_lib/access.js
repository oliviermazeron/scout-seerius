// ─── Contrôle d'accès, signatures et créneau d'envoi ─────────────────────────
// Variables d'environnement :
//   SCOUT_ACCESS_CODE  code demandé dans l'interface pour les actions Gmail
//   CRON_SECRET        envoyé par Vercel Cron (Authorization: Bearer …)
//   OUTREACH_SECRET    signe les liens de désinscription
//   PUBLIC_URL         URL publique du site (liens, retour OAuth)

import { createHmac, timingSafeEqual } from 'node:crypto'

function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export function setCors(res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Scout-Access')
}

// Répond 401/503 et retourne false si le code d'accès est absent ou faux
export function requireAccess(req, res) {
  const expected = process.env.SCOUT_ACCESS_CODE
  if (!expected) {
    res.status(503).json({ error: "SCOUT_ACCESS_CODE non configuré sur le serveur" })
    return false
  }
  if (!safeEqual(req.headers?.['x-scout-access'] ?? '', expected)) {
    res.status(401).json({ error: "Code d'accès requis ou incorrect", code: 'ACCESS_REQUIRED' })
    return false
  }
  return true
}

export function isCronRequest(req) {
  const secret = process.env.CRON_SECRET
  return !!secret && safeEqual(req.headers?.authorization ?? '', `Bearer ${secret}`)
}

export function emailToken(email) {
  const secret = process.env.OUTREACH_SECRET
  if (!secret) throw new Error('OUTREACH_SECRET non configuré')
  return createHmac('sha256', secret).update(String(email).trim().toLowerCase()).digest('base64url').slice(0, 32)
}

export function checkEmailToken(email, token) {
  try { return safeEqual(emailToken(email), token ?? '') } catch { return false }
}

export function publicOrigin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '')
  const proto = req.headers?.['x-forwarded-proto'] ?? 'http'
  const host  = req.headers?.['x-forwarded-host'] ?? req.headers?.host
  return `${proto}://${host}`
}

// ─── Créneau d'envoi : lundi–vendredi, 8 h–18 h, heure suisse ───────────────
const START_HOUR = 8
const END_HOUR   = 18

export function sendingWindow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich', weekday: 'short', hour: 'numeric', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  )
  const hour = Number(parts.hour) % 24
  return {
    open: !['Sat', 'Sun'].includes(parts.weekday) && hour >= START_HOUR && hour < END_HOUR,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    label: `du lundi au vendredi, de ${START_HOUR} h à ${END_HOUR} h (heure suisse)`,
  }
}
