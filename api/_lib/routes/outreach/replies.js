// ─── Scanner des réponses Gmail — /api/outreach/replies ──────────────────────
// Appelé toutes les heures par Vercel Cron (schedule: "0 * * * *").
// Détecte les réponses, bounces et opt-out sur les fils labellisés SCOUT.
// Dédoublonne par Gmail messageId via un set Redis scout:replies_seen.
//
// Pour chaque réponse humaine :
//   • Consigne l'email entrant dans HubSpot (INCOMING_EMAIL)
//   • Crée une tâche HubSpot « Répondre à [nom] » échéance aujourd'hui
//   • Met à jour scout_replied, scout_status, scout_reply_date
//
// Réponses automatiques (absence, mailer-daemon) → note HubSpot uniquement.

import { setCors, requireAccess, isCronRequest } from '../../access.js'
import { googleConfig, gmailAccount, threadReplies } from '../../google.js'
import { logIncomingEmail, updateContactTracking, createTask, markDoNotEmail } from '../../hubspot-scout.js'
import { hgetJSON, hgetallJSON, redisOne } from '../../redis.js'
import { SENDS_KEY, saveSend, optOut } from '../../outreach.js'
import { DEFAULT_AUDIENCE } from '../../hubspot-comms.js'

const BOUNCE_RE = /mailer-daemon|postmaster|mail delivery/i
const STOP_RE   = /^\s*stop\b/i
const SEEN_KEY  = 'scout:replies_seen'
const TRACKING_DAYS = 30
const DAY_MS        = 24 * 60 * 60 * 1000

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!isCronRequest(req) && !requireAccess(req, res)) return

  const report = { checked: 0, replied: 0, autoReplied: 0, optedOut: 0, bounced: 0, errors: [] }

  if (!googleConfig() || !(await gmailAccount())) {
    return res.status(200).json({ ...report, skipped: 'Gmail non connecté' })
  }

  const sends = await hgetallJSON(SENDS_KEY)
  const deadline = Date.now() + 50_000

  for (const email of Object.keys(sends)) {
    if (Date.now() > deadline) { report.partial = true; break }
    const record = await hgetJSON(SENDS_KEY, email)
    if (!record || !['sent', 'followed_up', 'opened', 'clicked'].includes(record.status)) continue
    if (Date.now() - record.sentAt > TRACKING_DAYS * DAY_MS) continue
    report.checked++

    try {
      const replies = await threadReplies(record.threadId)
      if (!replies.length) continue

      const audience = record.audience ?? DEFAULT_AUDIENCE

      for (const msg of replies) {
        // Dédoublonnage par Gmail message ID
        const seenKey = msg.id || msg.messageId
        if (seenKey) {
          const seen = await redisOne('SISMEMBER', SEEN_KEY, seenKey).catch(() => 0)
          if (Number(seen)) continue
        }

        // Bounce (mailer-daemon)
        if (BOUNCE_RE.test(msg.from)) {
          await saveSend({ ...record, status: 'bounced', bouncedAt: msg.date })
          await markDoNotEmail(email).catch(() => {})
          if (record.contactId) {
            updateContactTracking(record.contactId, { scout_status: 'bounced' }).catch(() => {})
          }
          report.bounced++
          if (seenKey) await redisOne('SADD', SEEN_KEY, seenKey).catch(() => {})
          break
        }

        // Réponse automatique (absence du bureau)
        if (msg.isAutoReply) {
          console.info(`[SCOUT] Réponse automatique de ${email} ignorée`)
          report.autoReplied++
          if (seenKey) await redisOne('SADD', SEEN_KEY, seenKey).catch(() => {})
          continue
        }

        // STOP → opt-out
        if (STOP_RE.test(msg.snippet)) {
          await optOut(email, 'reply-stop', audience)
          if (record.contactId) {
            updateContactTracking(record.contactId, { scout_status: 'optout' }).catch(() => {})
          }
          report.optedOut++
          if (seenKey) await redisOne('SADD', SEEN_KEY, seenKey).catch(() => {})
          break
        }

        // Réponse humaine réelle
        const now = Date.now()
        await saveSend({ ...record, status: 'replied', repliedAt: msg.date })
        if (record.contactId) {
          updateContactTracking(record.contactId, {
            scout_replied:     'true',
            scout_reply_date:  String(msg.date || now),
            scout_status:      'replied',
          }).catch(() => {})
        }

        // Email entrant dans HubSpot
        logIncomingEmail({
          contactId:  record.contactId,
          companyId:  record.companyId ?? null,
          subject:    `Re : ${record.subject ?? '(sans objet)'}`,
          from:       msg.from,
          to:         email,
          snippet:    msg.snippet,
          timestamp:  msg.date || now,
        }).catch((err) => console.warn(`[SCOUT] logIncomingEmail ${email} : ${err.message}`))

        // Tâche « Répondre à [nom] » échéance aujourd'hui
        createTask({
          subject:   `Répondre à ${record.contactName || email}`,
          template:  '',
          companyId: record.companyId  ?? null,
          contactId: record.contactId  ?? null,
          dueInDays: 0,
        }).catch((err) => console.warn(`[SCOUT] tâche réponse non créée : ${err.message}`))

        report.replied++
        if (seenKey) await redisOne('SADD', SEEN_KEY, seenKey).catch(() => {})
        break // une réponse humaine par fil suffit
      }
    } catch (err) {
      report.errors.push(`${email} : ${err.message}`)
    }
  }

  return res.status(200).json(report)
}
