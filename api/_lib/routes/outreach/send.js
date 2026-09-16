// ─── Envoi d'un email de campagne depuis Gmail + journalisation HubSpot ──────
// POST /api/outreach/send  (en-tête X-Scout-Access)
// Body : {
//   target:   { id, name, domain, canton, uid, segment },
//   contact:  { email, firstName, lastName, role },
//   email:    { subject, body },
//   followUp: { subject, body } | null,   // relance envoyée à J+7 sans réponse
//   senderName,
//   audience: 'intermediaires' (défaut, SCOUT) | 'dirigeants' (SWIFT),
//   dealId:   affaire « Deal sourcing » à passer à « Contactée » (SWIFT, facultatif)
// }
// → { record, quota }  |  { dryRun: true, preview }
//
// Ordre des garde-fous (mode réel) :
//   code d'accès → créneau → module communications actif → pas de doublon →
//   pas de désinscription en attente → contact HubSpot → statut d'abonnement
//   HubSpot (fail-closed) → quota → envoi Gmail → journalisation HubSpot

import { setCors, requireAccess, publicOrigin, sendingWindow } from '../../access.js'
import { configStatus, reportConfig, isDryRun, logDryRun } from '../../config.js'
import { googleConfig, gmailAccount, sendGmail } from '../../google.js'
import { upsertCompany, upsertContact, associateContactToCompany, moveDealToStage } from '../../hubspot-scout.js'
import { checkSubscription, isAudience, AUDIENCES, DEFAULT_AUDIENCE } from '../../hubspot-comms.js'
import { writeCampaignProps, appendCampaignHistory } from '../../hubspot-campaign.js'
import { emailProblems } from '../../../../src/services/emailGuard.js'
import { redis, hgetJSON } from '../../redis.js'
import {
  SENDS_KEY, PIPELINE_KEY, DAILY_CAP, FOLLOW_UP_DAYS, DAY_MS, EMAIL_RE,
  normEmail, takeQuota, releaseQuota, quotaUsed, withUnsubscribe, buildHtmlBody, pendingOptOut, logToHubSpot,
} from '../../outreach.js'

reportConfig()

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })
  if (!requireAccess(req, res)) return

  const { target, contact, email, followUp, senderName, dealId, campaignId } = req.body ?? {}
  const audience = req.body?.audience ?? DEFAULT_AUDIENCE
  if (!isAudience(audience)) return res.status(400).json({ error: `Audience inconnue : ${audience}` })
  const to = normEmail(contact?.email)
  if (!EMAIL_RE.test(to) || !target?.id || !target?.name || !email?.subject?.trim() || !email?.body?.trim()) {
    return res.status(400).json({ error: 'Destinataire, société, objet et texte requis' })
  }
  // Un gabarit incomplet est une erreur, pas un email à envoyer
  const incomplete = [
    ...emailProblems(email),
    ...(followUp ? emailProblems(followUp).map((p) => `relance — ${p}`) : []),
  ]
  if (incomplete.length) {
    return res.status(400).json({ error: `Email incomplet : ${incomplete.join(' ; ')}`, code: 'INCOMPLETE_EMAIL', problems: incomplete })
  }

  const window = sendingWindow()
  if (!window.open) return res.status(423).json({ error: `Envoi possible ${window.label}` })

  const origin = publicOrigin(req)
  const followUpMail = followUp?.subject && followUp?.body ? { subject: followUp.subject, body: followUp.body } : null

  // ── Mode test : aucun appel réseau sortant, le contenu est journalisé ──────
  if (isDryRun()) {
    let text
    try { text = withUnsubscribe(email.body, origin, to, audience) } catch { text = `${email.body}\n\n—\n[lien de désinscription : OUTREACH_SECRET absent]` }
    const preview = {
      to,
      audience,
      subscriptionType: AUDIENCES[audience],
      dealStage: dealId ? `transaction ${dealId} → Contactée (simulé)` : null,
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
      subscription = await checkSubscription(to, audience)
    } catch (err) {
      console.warn(`[SCOUT] Envoi annulé pour ${to} : ${err.message}`)
      return res.status(503).json({ error: `Envoi annulé : statut d'abonnement HubSpot indisponible (${err.message})`, code: 'SUBSCRIPTION_CHECK_FAILED' })
    }
    if (subscription.unsubscribed) {
      console.info(`[SCOUT] Envoi annulé : ${to} est désinscrit dans HubSpot (${subscription.unsubscribedFromAll ? 'toutes communications' : AUDIENCES[audience]})`)
      return res.status(409).json({ error: `${to} est désinscrit dans HubSpot`, code: 'UNSUBSCRIBED' })
    }

    // 3. Quota puis envoi Gmail
    if (!(await takeQuota(window.date))) {
      return res.status(429).json({ error: `Plafond de ${DAILY_CAP} emails atteint aujourd'hui` })
    }
    let sent
    try {
      sent = await sendGmail({
        fromName: senderName,
        to,
        subject: email.subject,
        text: withUnsubscribe(email.body, origin, to, audience),
        html: buildHtmlBody(email.body, origin, to, audience),
      })
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
      audience,
      dealId: dealId ? String(dealId) : null,
      contactId: hsContact.id,
      companyId: company.id ?? null,
      campaignId: campaignId?.trim() ?? null,
      segment: target.segment ?? null,
      hubspotLogs: {
        [sent.id]: { kind: 'initial', subject: email.subject, body: email.body, timestamp: now, origin, state: 'queued' },
      },
      followUp: followUpMail ? { ...followUpMail, dueAt: now + FOLLOW_UP_DAYS * DAY_MS } : null,
    }
    await redis([
      ['HSET', SENDS_KEY, to, JSON.stringify(record)],
      // Le suivi « Campagne » de SCOUT ne concerne que les intermédiaires
      ...(audience === DEFAULT_AUDIENCE ? [['HSETNX', PIPELINE_KEY, target.id, JSON.stringify('Contacté')]] : []),
    ])

    try {
      const log = await logToHubSpot(to, sent.id)
      if (log?.state !== 'logged') console.warn(`[SCOUT] Email envoyé à ${to} mais non journalisé dans HubSpot : ${log?.error}`)
    } catch (err) {
      console.warn(`[SCOUT] Email envoyé à ${to} ; journalisation HubSpot à reprendre : ${err.message}`)
    }

    // Propriétés de campagne SCOUT sur le contact HubSpot (best-effort)
    if (campaignId?.trim()) {
      const cid = campaignId.trim()
      writeCampaignProps(hsContact.id, { campaignId: cid, segment: target.segment, statut: 'envoye', etapeSequence: 1 })
        .catch((err) => console.warn(`[SCOUT] writeCampaignProps ${to} : ${err.message}`))
      appendCampaignHistory(hsContact.id, cid)
        .catch((err) => console.warn(`[SCOUT] appendCampaignHistory ${to} : ${err.message}`))
    }

    // Affaire « Deal sourcing » → « Contactée » (un échec n'annule pas l'envoi)
    if (dealId) {
      try {
        const moved = await moveDealToStage(dealId, 'contacted')
        if (!moved.ok) console.warn(`[SCOUT] Affaire ${dealId} non passée à « Contactée » : ${moved.error}`)
      } catch (err) {
        console.warn(`[SCOUT] Affaire ${dealId} non passée à « Contactée » : ${err.message}`)
      }
    }

    let quota = null
    try { quota = { used: await quotaUsed(window.date), cap: DAILY_CAP } } catch {}
    return res.status(200).json({ record: (await hgetJSON(SENDS_KEY, to).catch(() => null)) ?? record, quota })
  } catch (err) {
    const status = err.code === 'GMAIL_DISCONNECTED' ? 409 : 502
    return res.status(status).json({ error: err.message, code: err.code })
  }
}
