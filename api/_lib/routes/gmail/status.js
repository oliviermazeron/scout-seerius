// ─── État de l'envoi Gmail ───────────────────────────────────────────────────
// GET    /api/gmail/status  → { configured, connected, email, quota, windowOpen, window }
// DELETE /api/gmail/status  → déconnecte Gmail
// (en-tête X-Scout-Access requis)

import { setCors, requireAccess, sendingWindow } from '../../access.js'
import { configStatus, reportConfig } from '../../config.js'
import { prospectionSubscriptionId, SUBSCRIPTION_NAME } from '../../hubspot-comms.js'
import { googleConfig, gmailAccount, disconnectGmail } from '../../google.js'
import { quotaUsed, DAILY_CAP } from '../../outreach.js'

reportConfig()

export default async function handler(req, res) {
  setCors(res, 'GET, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!requireAccess(req, res)) return

  try {
    if (req.method === 'DELETE') {
      await disconnectGmail()
      return res.status(200).json({ ok: true })
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' })

    const window = sendingWindow()
    const account = googleConfig() ? await gmailAccount() : null
    const cfg = configStatus()

    // Diagnostic à la demande (?check=hubspot) : lecture seule des types
    // d'abonnement avec le token COMMS, pour confirmer que le type visé existe
    let subscriptionType
    if (req.query?.check === 'hubspot' && cfg.commsEnabled) {
      try {
        await prospectionSubscriptionId()
        subscriptionType = { name: SUBSCRIPTION_NAME, found: true }
      } catch (err) {
        subscriptionType = { name: SUBSCRIPTION_NAME, found: false, error: err.message }
      }
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      dryRun: cfg.dryRun,
      commsEnabled: cfg.commsEnabled,
      scoutKey: cfg.scoutKey,
      ...(subscriptionType ? { subscriptionType } : {}),
      configured: !!googleConfig(),
      connected: !!account,
      email: account?.email ?? null,
      quota: { used: await quotaUsed(window.date), cap: DAILY_CAP },
      windowOpen: window.open,
      window: window.label,
    })
  } catch (err) {
    return res.status(502).json({ error: err.message })
  }
}
