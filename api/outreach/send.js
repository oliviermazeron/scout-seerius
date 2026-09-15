// ─── Envoi d'un email de campagne depuis Gmail + journalisation HubSpot ──────
// POST /api/outreach/send  (en-tête X-Scout-Access)
// Body : {
//   target:   { id, name, domain, canton, uid, segment },
//   contact:  { email, firstName, lastName, role },
//   email:    { subject, body },
//   followUp: { subject, body } | null,   // relance envoyée à J+7 sans réponse
//   senderName
// }
// → { record, quota }  |  { dryRun: true, preview }
//
// Ordre des garde-fous (mode réel) :
//   code d'accès → créneau → module communications actif → pas de doublon →
//   pas de désinscription en attente → contact HubSpot → statut d'abonnement
//   HubSpot (fail-closed) → quota → envoi Gmail → journalisation HubSpot

import { setCors, requireAccess, publicOrigin, sendingWindow } from '../_lib/access.js'
import { configStatus, reportConfig, isDryRun, logDryRun } from '../_lib/config.js'
import { googleConfig, gmailAccount, sendGmail } from '../_lib/google.js'
import { upsertCompany, upsertContact, associateContactToCompany } from '../_lib/hubspot-scout.js'
import { checkSubscription } from '../_lib/hubspot-comms.js'
import { redis, hgetJSON } from '../_lib/redis.js'
import {
  SENDS_KEY, PIPELINE_KEY, DAILY_CAP, FOLLOW_UP_DAYS, DAY_MS, EMAIL_RE,
  normEmail, takeQuota, releaseQuota, quotaUsed, withUnsubscribe, pendingOptOut, logToHubSpot,
} from '../_lib/outreach.js'

reportConfig()

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })
  if (!requireAccess(req, res)) return

  const { target, contact, email, followUp, senderName } = req.body ?? {}
  const to = normEmail(contact?.email)
  if (!EMAIL_RE.test(to) || !target?.id || !target?.name || !email?.subject?.trim() || !email?.body?.trim()) {
    return res.status(400).json({ error: 'Destinataire, cabinet, objet et texte requis' })
  }
  if (email.body.includes('[Prénom Nom]')) {
    return res.status(400).json({ error: 'Signature incomplète : renseignez votre nom' })
  }

  const window = sendingWindow()
  if (!window.open) return res.status(423).json({ error: `Envoi possible ${window.label}` })

  const origin = publicOrigin(req)
  const followUpMail = followUp?.subject && followUp?.body ? { subject: followUp.subject, body: followUp.body } : null

  // ── Mode test : aucun appel réseau sortant, le contenu est journalisé ──────
  if (isDryRun()) {
    let text
    try { text = withUnsubscribe(email.body, origin, to) } catch { text = `${email.body}\n\n—\n[lien de désinscription : OUTREACH_SECRET absent]` }
    const preview = {
      to,
      fromName: senderName ?? '',
      subject: email.subject,
      text,
      followUp: followUpMail && { subject: followUpMail.subject, body: followUpMail.body, dueInDays: FOLLOW_UP_DAYS },
      hubspot: {
        company: { name: target.name, domain: target.domain ?? null, canton: target.canton ?? null, uid: target.uid ?? null, segment: target.segment ?? null },
        contact: { email: to, firstname: contact.firstName ?? '', lastname: contact.lastName ?? '', jobtitle: contact.role ?? '' },
        subscriptionCheck: 'simulé : non appelé en mode test',
        emailLog: { hs_email_direction: 'EMAIL', hs_email_status: 'SENT', hs_email_subject: email.subject },
      },
    }
    logDryRun('envoi', preview)
    return res.status(200).json({ dryRun: true, preview })
  }

  // ── Mode réel ───────────────────────────────────────────────────────────────
  const cfg = configStatus()
  if (!cfg.commsEnabled) {
    return res.status(503).json({ error: 'Module communications désactivé (HUBSPOT_COMMS_TOKEN absent) : envoi impossible', code: 'COMMS_DISABLED' })
  }
  if (!cfg.scoutKey) return res.status(503).json({ error: 'Clé HubSpot SCOUT absente' })
  if (!googleConfig()) return res.status(503).json({ error: 'Identifiants Google non configurés' })

  try {
    const previous = await hgetJSON(SENDS_KEY, to)
    if (previous) {
      return res.status(409).json({ error: `Déjà contacté le ${new Date(previous.sentAt).toLocaleDateString('fr-CH')}`, record: previous })
    }
    if (await pendingOptOut(to)) {
      return res.status(409).json({ error: `${to} a demandé à ne plus être contacté` })
    }
    const account = await gmailAccount()
    if (!account) return res.status(409).json({ error: 'Gmail non connecté', code: 'GMAIL_DISCONNECTED' })

    // 1. HubSpot (clé SCOUT) : société + contact
    const company = await upsertCompany({
      name: target.name, domain: target.domain, canton: target.canton, uid: target.uid, segment: target.segment,
    })
    const hsContact = await upsertContact({
      email: to, firstname: contact.firstName ?? '', lastname: contact.lastName ?? '', jobtitle: contact.role ?? '', company: target.name,
    })
    if (!hsContact.id) return res.status(502).json({ error: `Contact HubSpot non créé : ${hsContact.data?.message ?? 'erreur'}` })
    if (company.id) await associateContactToCompany(hsContact.id, company.id)

    // 2. Statut d'abonnement (token COMMS) — fail-closed
    let subscription
    try {
      subscription = await checkSubscription(to)
    } catch (err) {
      console.warn(`[SCOUT] Envoi annulé pour ${to} : ${err.message}`)
      return res.status(503).json({ error: `Envoi annulé : statut d'abonnement HubSpot indisponible (${err.message})`, code: 'SUBSCRIPTION_CHECK_FAILED' })
    }
    if (subscription.unsubscribed) {
      console.info(`[SCOUT] Envoi annulé : ${to} est désinscrit dans HubSpot (${subscription.unsubscribedFromAll ? 'toutes communications' : 'One to One'})`)
      return res.status(409).json({ error: `${to} est désinscrit dans HubSpot`, code: 'UNSUBSCRIBED' })
    }

    // 3. Quota puis envoi Gmail
    if (!(await takeQuota(window.date))) {
      return res.status(429).json({ error: `Plafond de ${DAILY_CAP} emails atteint aujourd'hui` })
    }
    let sent
    try {
      sent = await sendGmail({ fromName: senderName, to, subject: email.subject, text: withUnsubscribe(email.body, origin, to) })
    } catch (err) {
      await releaseQuota(window.date)
      throw err
    }

    // 4. Registre SCOUT, puis journalisation HubSpot (un échec n'annule pas l'envoi)
    const now = Date.now()
    const record = {
      email: to,
      targetId: target.id,
      name: target.name,
      contactName: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
      subject: email.subject,
      senderName: senderName ?? '',
      from: sent.from,
      threadId: sent.threadId,
      messageId: sent.messageId,
      gmailId: sent.id,
      sentAt: now,
      status: 'sent',
      contactId: hsContact.id,
      companyId: company.id ?? null,
      hubspotLogs: {
        [sent.id]: { kind: 'initial', subject: email.subject, body: email.body, timestamp: now, origin, state: 'queued' },
      },
      followUp: followUpMail ? { ...followUpMail, dueAt: now + FOLLOW_UP_DAYS * DAY_MS } : null,
    }
    await redis([
      ['HSET', SENDS_KEY, to, JSON.stringify(record)],
      ['HSETNX', PIPELINE_KEY, target.id, JSON.stringify('Contacté')],
    ])

    try {
      const log = await logToHubSpot(to, sent.id)
      if (log?.state !== 'logged') console.warn(`[SCOUT] Email envoyé à ${to} mais non journalisé dans HubSpot : ${log?.error}`)
    } catch (err) {
      console.warn(`[SCOUT] Email envoyé à ${to} ; journalisation HubSpot à reprendre : ${err.message}`)
    }

    let quota = null
    try { quota = { used: await quotaUsed(window.date), cap: DAILY_CAP } } catch {}
    return res.status(200).json({ record: (await hgetJSON(SENDS_KEY, to).catch(() => null)) ?? record, quota })
  } catch (err) {
    const status = err.code === 'GMAIL_DISCONNECTED' ? 409 : 502
    return res.status(status).json({ error: err.message, code: err.code })
  }
}
