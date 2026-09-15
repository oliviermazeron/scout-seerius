// ─── État de l'envoi Gmail ───────────────────────────────────────────────────
// GET    /api/gmail/status  → { configured, connected, email, quota, windowOpen, window }
// DELETE /api/gmail/status  → déconnecte Gmail
// (en-tête X-Scout-Access requis)

import { setCors, requireAccess, sendingWindow } from '../../access.js'
import { configStatus, reportConfig } from '../../config.js'
import { prospectionSubscriptionId, checkSubscription, isAudience, AUDIENCES, DEFAULT_AUDIENCE } from '../../hubspot-comms.js'
import { dealPipeline, DEAL_PIPELINE_NAME } from '../../hubspot-scout.js'
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

    // Diagnostic à la demande (?check=hubspot), en lecture seule : types
    // d'abonnement par audience (token COMMS) et pipeline « Deal sourcing » (clé SCOUT)
    let subscriptionTypes
    let dealPipelineCheck
    if (req.query?.check === 'hubspot') {
      if (cfg.commsEnabled) {
        subscriptionTypes = {}
        for (const [audience, name] of Object.entries(AUDIENCES)) {
          try {
            await prospectionSubscriptionId(audience)
            subscriptionTypes[audience] = { name, found: true }
          } catch (err) {
            subscriptionTypes[audience] = { name, found: false, error: err.message }
          }
        }
      }
      if (cfg.scoutKey) {
        try {
          const pipeline = await dealPipeline()
          dealPipelineCheck = { name: DEAL_PIPELINE_NAME, found: true, stages: Object.keys(pipeline.stages) }
        } catch (err) {
          dealPipelineCheck = { name: DEAL_PIPELINE_NAME, found: false, error: err.message }
        }
      }
    }

    // ?check=hubspot&email=…[&audience=dirigeants] : contrôle complet d'abonnement, en lecture seule
    let subscriptionCheck
    const checkEmail = String(req.query?.email ?? '').trim().toLowerCase()
    const checkAudience = isAudience(req.query?.audience) ? req.query.audience : DEFAULT_AUDIENCE
    if (req.query?.check === 'hubspot' && cfg.commsEnabled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkEmail)) {
      try {
        subscriptionCheck = { email: checkEmail, audience: checkAudience, ok: true, ...(await checkSubscription(checkEmail, checkAudience)) }
      } catch (err) {
        subscriptionCheck = { email: checkEmail, audience: checkAudience, ok: false, error: err.message }
      }
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      dryRun: cfg.dryRun,
      commsEnabled: cfg.commsEnabled,
      scoutKey: cfg.scoutKey,
      ...(subscriptionTypes ? { subscriptionTypes } : {}),
      ...(dealPipelineCheck ? { dealPipeline: dealPipelineCheck } : {}),
      ...(subscriptionCheck ? { subscriptionCheck } : {}),
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
