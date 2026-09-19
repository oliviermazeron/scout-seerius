// ─── Suivi des ouvertures et des clics ───────────────────────────────────────
// GET /api/t/o/{token}.gif  → GIF 1×1 transparent (ouverture)
// GET /api/t/c/{token}      → redirection 302 vers l'URL cible (clic)
//
// token = base64url(JSON({e,t,u?,ts})).<hmac_32>  (voir access.js)
// Filtre du bruit : hits < 60 s après ts → ignorés
// Apple MPP : UA contient AppleMailPrivacyProxy → marque probable_open

import { setCors, verifyTrackingToken } from '../../access.js'
import { hgetJSON, hsetJSON } from '../../redis.js'
import { updateContactTracking } from '../../hubspot-scout.js'
import { SENDS_KEY } from '../../outreach.js'

// GIF transparent 1×1
const GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)
const NOISE_WINDOW_MS = 60_000
const APPLE_MPP_RE   = /AppleMailPrivacyProxy|apple\.com\/go\/applebot/i

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { type, token: rawToken } = req.query
  // Le token peut avoir ".gif" en suffixe pour les ouvertures
  const token = String(rawToken ?? '').replace(/\.gif$/i, '')
  const isOpen  = type === 'o'
  const isClick = type === 'c'

  if (!isOpen && !isClick) return res.status(404).end()

  // Vérification signature
  const payload = verifyTrackingToken(token)
  if (!payload) {
    if (isOpen) return sendGif(res)
    return res.status(404).end()
  }

  const { e: email, t: pType, u: targetUrl, ts: sentAt } = payload

  // Filtre du bruit (affichage dans la vue Envoyés d'Olivier)
  const age = Date.now() - (sentAt ?? 0)
  if (age < NOISE_WINDOW_MS) {
    if (isOpen) return sendGif(res)
    if (isClick && targetUrl) return res.redirect(302, targetUrl)
    return res.status(302).setHeader('Location', '/').end()
  }

  // Pour les clics : rediriger immédiatement, tracker en arrière-plan
  if (isClick && targetUrl) {
    res.redirect(302, targetUrl)
    recordEvent({ email, type: 'click', url: targetUrl, ua: req.headers['user-agent'] ?? '' }).catch(() => {})
    return
  }

  // Pour les ouvertures : envoyer le pixel immédiatement
  sendGif(res)
  recordEvent({ email, type: 'open', ua: req.headers['user-agent'] ?? '' }).catch(() => {})
}

function sendGif(res) {
  res.setHeader('Content-Type', 'image/gif')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  return res.status(200).end(GIF)
}

async function recordEvent({ email, type, url, ua }) {
  if (!email) return
  const now = Date.now()
  const isProbable = APPLE_MPP_RE.test(ua ?? '')

  // Lire le record Redis
  const record = await hgetJSON(SENDS_KEY, email).catch(() => null)
  if (!record) return

  const patch = {}

  if (type === 'open') {
    patch.openCount   = (record.openCount ?? 0) + 1
    patch.lastOpenAt  = now
    patch.firstOpenAt = record.firstOpenAt ?? now
    if (isProbable) patch.lastOpenProbable = true
    if (record.status === 'sent' || record.status === 'followed_up') {
      patch.status = 'opened'
    }
    await hsetJSON(SENDS_KEY, email, { ...record, ...patch })

    // HubSpot (best-effort, silencieux si propriétés absentes)
    if (record.contactId) {
      const hsProps = {
        scout_open_count: String(patch.openCount),
        scout_last_open:  String(now),
        ...(record.firstOpenAt ? {} : { scout_first_open: String(now) }),
        scout_status: 'opened',
      }
      updateContactTracking(record.contactId, hsProps).catch(() => {})
    }
  }

  if (type === 'click') {
    patch.lastClickAt  = now
    patch.lastClickUrl = url ?? ''
    if (!record.firstClickAt) patch.firstClickAt = now
    if (['sent', 'followed_up', 'opened'].includes(record.status)) {
      patch.status = 'clicked'
    }
    await hsetJSON(SENDS_KEY, email, { ...record, ...patch })

    // HubSpot (best-effort)
    if (record.contactId) {
      const hsProps = {
        scout_last_click:     String(now),
        scout_last_click_url: url ?? '',
        scout_status:         'clicked',
      }
      updateContactTracking(record.contactId, hsProps).catch(() => {})
    }

    // Tâche HubSpot au premier clic — "Relancer — a cliqué sur [lien]"
    if (!record.firstClickAt && record.contactId) {
      const { createTask } = await import('../../hubspot-scout.js')
      createTask({
        subject: `Relancer — a cliqué sur ${url ?? 'un lien'}`,
        template: '',
        companyId:  record.companyId  ?? null,
        contactId:  record.contactId  ?? null,
        dueInDays: 1,
      }).catch((err) => console.warn(`[SCOUT] tâche clic non créée : ${err.message}`))
    }
  }
}
