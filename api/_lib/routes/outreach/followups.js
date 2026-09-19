// ─── Suivi des envois : réponses, « stop », rejets et relances J+7 ───────────
// GET|POST /api/outreach/followups
// Appelé chaque matin de semaine par Vercel Cron (Authorization: Bearer CRON_SECRET)
// ou depuis l'interface (en-tête X-Scout-Access).
// → { checked, replied, optedOut, bounced, followedUp, errors, sends, … }
//
// Mode test : lecture du registre uniquement, aucune lecture Gmail, aucun envoi,
// aucune écriture HubSpot ; les relances dues sont journalisées.

import { setCors, requireAccess, isCronRequest, publicOrigin, sendingWindow } from '../../access.js'
import { reportConfig, isDryRun, logDryRun } from '../../config.js'
import { googleConfig, gmailAccount, sendGmail, threadReplies } from '../../google.js'
import { createTask } from '../../hubspot-scout.js'
import { commsEnabled, checkSubscription, DEFAULT_AUDIENCE } from '../../hubspot-comms.js'
import { moveDealToStage } from '../../hubspot-scout.js'
import { writeCampaignProps } from '../../hubspot-campaign.js'
import { hgetJSON, hgetallJSON } from '../../redis.js'
import {
  SENDS_KEY, DAY_MS, takeQuota, releaseQuota, withUnsubscribe, buildHtmlBody, saveSend, optOut, pendingOptOut,
  retryPendingOptOuts, retryEmailLogs, logToHubSpot,
} from '../../outreach.js'

reportConfig()

const BOUNCE_RE = /mailer-daemon|postmaster|mail delivery/i
const STOP_RE = /^\s*stop\b/i
const TRACKING_DAYS = 30

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!isCronRequest(req) && !requireAccess(req, res)) return

  const report = { checked: 0, replied: 0, optedOut: 0, bounced: 0, followedUp: 0, errors: [] }

  if (isDryRun()) {
    const sends = await hgetallJSON(SENDS_KEY)
    const due = Object.values(sends)
      .filter((r) => r.status === 'sent' && r.followUp && !r.followUpSentAt && Date.now() >= r.followUp.dueAt)
      .map((r) => ({ to: r.email, subject: r.followUp.subject, dueAt: new Date(r.followUp.dueAt).toISOString() }))
    logDryRun('relances', { due })
    return res.status(200).json({ ...report, dryRun: true, wouldFollowUp: due.length, sends })
  }

  if (!googleConfig() || !(await gmailAccount())) {
    return res.status(200).json({ ...report, skipped: 'Gmail non connecté' })
  }

  const window = sendingWindow()
  const origin = publicOrigin(req)
  const comms = commsEnabled()
  const deadline = Date.now() + 50_000
  Object.assign(report, { windowOpen: window.open, commsDisabled: !comms })

  // Reprises : désinscriptions non synchronisées, journalisations en échec
  try { report.optOutsSynced = await retryPendingOptOuts() } catch (err) { report.errors.push(`reprise désinscriptions : ${err.message}`) }
  try { report.logsRetried = await retryEmailLogs() } catch (err) { report.errors.push(`reprise journalisation : ${err.message}`) }

  for (const email of Object.keys(await hgetallJSON(SENDS_KEY))) {
    if (Date.now() > deadline) { report.partial = true; break }
    const record = await hgetJSON(SENDS_KEY, email)
    if (!record || !['sent', 'followed_up'].includes(record.status)) continue
    if (Date.now() - record.sentAt > TRACKING_DAYS * DAY_MS) continue
    report.checked++
    const audience = record.audience ?? DEFAULT_AUDIENCE

    try {
      const replies = await threadReplies(record.threadId)
      const human = replies.filter((m) => !BOUNCE_RE.test(m.from))

      if (human.some((m) => STOP_RE.test(m.snippet))) {
        await optOut(record.email, 'reply-stop', audience)
        report.optedOut++
        continue
      }
      if (human.length) {
        await saveSend({ ...record, status: 'replied', repliedAt: Math.min(...human.map((m) => m.date)) })
        report.replied++
        // Affaire « Deal sourcing » → « Échange en cours » (jamais de recul)
        if (record.dealId) {
          const moved = await moveDealToStage(record.dealId, 'conversation').catch((err) => ({ ok: false, error: err.message }))
          if (!moved.ok) report.errors.push(`${record.email} : transaction ${record.dealId} non avancée (${moved.error})`)
        }
        continue
      }
      if (replies.length) {
        await saveSend({ ...record, status: 'bounced', bouncedAt: Date.now() })
        report.bounced++
        continue
      }

      // Relance J+7 : pas de réponse, pas encore relancé, dans le créneau
      const due = record.status === 'sent' && record.followUp && !record.followUpSentAt && Date.now() >= record.followUp.dueAt
      if (!due || !window.open) continue
      if (!comms) { report.followUpsBlocked = (report.followUpsBlocked ?? 0) + 1; continue }
      if (await pendingOptOut(record.email)) continue

      // Statut d'abonnement HubSpot — fail-closed
      let subscription
      try {
        subscription = await checkSubscription(record.email, audience)
      } catch (err) {
        report.errors.push(`${record.email} : relance annulée, statut HubSpot indisponible (${err.message})`)
        continue
      }
      if (subscription.unsubscribed) {
        await saveSend({ ...record, status: 'optout', optOutAt: Date.now() })
        report.optedOut++
        continue
      }

      if (!(await takeQuota(window.date))) { report.quotaReached = true; continue }
      let sent
      try {
        sent = await sendGmail({
          fromName: record.senderName,
          to: record.email,
          subject: record.followUp.subject,
          text: withUnsubscribe(record.followUp.body, origin, record.email, audience),
          html: buildHtmlBody(record.followUp.body, origin, record.email, audience),
          threadId: record.threadId,
          inReplyTo: record.messageId,
        })
      } catch (err) {
        await releaseQuota(window.date)
        throw err
      }

      const now = Date.now()
      await saveSend({
        ...record,
        status: 'followed_up',
        followUpSentAt: now,
        followUpGmailId: sent.id,
        hubspotLogs: {
          ...(record.hubspotLogs ?? {}),
          [sent.id]: { kind: 'followup', subject: record.followUp.subject, body: record.followUp.body, timestamp: now, origin, state: 'queued' },
        },
      })
      report.followedUp++
      await logToHubSpot(record.email, sent.id).catch((err) => report.errors.push(`${record.email} : journalisation relance (${err.message})`))
      // Mettre à jour les props de campagne : statut relance, étape incrémentée
      if (record.contactId && record.campaignId) {
        const etape = Number(record.followUpStep ?? 1) + 1
        writeCampaignProps(record.contactId, { campaignId: record.campaignId, segment: record.segment, statut: 'relance', etapeSequence: etape })
          .catch((err) => console.warn(`[SCOUT] writeCampaignProps relance ${record.email} : ${err.message}`))
      }
    } catch (err) {
      report.errors.push(`${record.email} : ${err.message}`)
    }
  }

  report.sends = await hgetallJSON(SENDS_KEY)
  return res.status(200).json(report)
}
