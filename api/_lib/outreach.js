// ─── Envois de campagne : registre, quota, désinscriptions, journalisation ───
// Registre des envois : hash Redis "scout:scout_outreach_sends" (champ = email),
// lisible par l'app via /api/store, modifiable uniquement par le serveur.

import { redis, redisOne, hgetJSON, hsetJSON, hgetallJSON } from './redis.js'
import { emailToken } from './access.js'
import { isDryRun, logDryRun } from './config.js'
import { commsEnabled, unsubscribe } from './hubspot-comms.js'
import { logEmail } from './hubspot-scout.js'

export const SENDS_KEY    = 'scout:scout_outreach_sends'
export const OPTOUT_KEY   = 'scout:scout_outreach_optout'
export const PIPELINE_KEY = 'scout:scout_campaign'

export const DAILY_CAP      = Number(process.env.OUTREACH_DAILY_CAP ?? 20)
export const FOLLOW_UP_DAYS = 7
export const DAY_MS         = 24 * 60 * 60 * 1000

export const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const normEmail = (e) => String(e ?? '').trim().toLowerCase()

// ─── Quota journalier ─────────────────────────────────────────────────────────
const quotaKey = (date) => `secret:quota:${date}`

export async function takeQuota(date) {
  const [count] = await redis([['INCR', quotaKey(date)], ['EXPIRE', quotaKey(date), '172800']])
  if (count > DAILY_CAP) {
    await redisOne('DECR', quotaKey(date))
    return false
  }
  return true
}

export const releaseQuota = (date) => redisOne('DECR', quotaKey(date))

export async function quotaUsed(date) {
  return Math.max(0, Number(await redisOne('GET', quotaKey(date)) ?? 0))
}

// ─── Registre des envois ──────────────────────────────────────────────────────
export const saveSend = (record) => hsetJSON(SENDS_KEY, record.email, record)

export function withUnsubscribe(text, origin, email) {
  const url = `${origin}/api/outreach/unsubscribe?e=${encodeURIComponent(email)}&t=${emailToken(email)}`
  return `${text}\n\n—\nSi vous ne souhaitez plus recevoir de message de ma part, répondez simplement « stop » ou cliquez ici : ${url}`
}

// ─── Désinscriptions ──────────────────────────────────────────────────────────
// Le registre local NE FAIT PAS autorité : HubSpot est la référence du
// consentement. Il sert uniquement à bloquer l'envoi tant qu'une désinscription
// reçue (lien ou réponse « stop ») n'a pas encore pu être enregistrée dans
// HubSpot (hubspotSynced: false), et à la réessayer. Une fois synchronisée,
// seule la lecture HubSpot décide.
export async function pendingOptOut(email) {
  const entry = await hgetJSON(OPTOUT_KEY, normEmail(email))
  return entry && !entry.hubspotSynced ? entry : null
}

// source : 'link' (lien de désinscription) | 'reply-stop' (réponse « stop »)
export async function optOut(email, source) {
  const e = normEmail(email)
  if (isDryRun()) {
    logDryRun('désinscription', { email: e, source })
    return { dryRun: true, synced: false }
  }

  let synced = false
  let error = null
  if (commsEnabled()) {
    try {
      const r = await unsubscribe(e)
      synced = r.ok
      error = r.ok ? null : r.error
    } catch (err) {
      error = err.message
    }
  } else {
    error = 'Module communications désactivé (HUBSPOT_COMMS_TOKEN absent)'
  }

  const now = Date.now()
  const previous = await hgetJSON(OPTOUT_KEY, e)
  await hsetJSON(OPTOUT_KEY, e, {
    at: previous?.at ?? now, source: previous?.source ?? source,
    hubspotSynced: synced, lastError: error, attempts: (previous?.attempts ?? 0) + 1, lastAttemptAt: now,
  })

  const record = await hgetJSON(SENDS_KEY, e)
  if (record && record.status !== 'optout') await saveSend({ ...record, status: 'optout', optOutAt: now })

  if (!synced) console.warn(`[SCOUT] Désinscription de ${e} non enregistrée dans HubSpot : ${error} (nouvel essai automatique)`)
  return { synced, error }
}

export async function retryPendingOptOuts() {
  if (isDryRun() || !commsEnabled()) return 0
  let synced = 0
  for (const [email, entry] of Object.entries(await hgetallJSON(OPTOUT_KEY))) {
    if (entry.hubspotSynced) continue
    if ((await optOut(email, entry.source)).synced) synced++
  }
  return synced
}

// ─── Journalisation HubSpot, idempotente par ID de message Gmail ─────────────
// record.hubspotLogs[gmailId] = { kind, subject, body, timestamp, origin, state }
// États : queued → pending → logged | failed | uncertain
//   failed    : HubSpot a répondu une erreur → rejoué par la tâche quotidienne
//   uncertain : pas de réponse (délai, réseau) → jamais rejoué automatiquement,
//               l'email a peut-être été créé : pas de risque de doublon
const PENDING_STALE_MS = 2 * 60 * 1000

export async function logToHubSpot(email, gmailId) {
  const key = normEmail(email)
  let record = await hgetJSON(SENDS_KEY, key)
  const entry = record?.hubspotLogs?.[gmailId]
  if (!entry || ['logged', 'uncertain'].includes(entry.state)) return entry ?? null

  const update = async (patch) => {
    record = await hgetJSON(SENDS_KEY, key)
    record.hubspotLogs[gmailId] = { ...record.hubspotLogs[gmailId], ...patch }
    await saveSend(record)
    return record.hubspotLogs[gmailId]
  }

  if (entry.state === 'pending') {
    // Tentative précédente interrompue : issue inconnue, on ne rejoue pas
    return Date.now() - (entry.attemptAt ?? 0) > PENDING_STALE_MS
      ? update({ state: 'uncertain', error: 'Tentative interrompue : vérifier la fiche HubSpot' })
      : entry
  }

  await update({ state: 'pending', attemptAt: Date.now() })
  try {
    const r = await logEmail({
      contactId: record.contactId,
      subject: entry.subject,
      text: withUnsubscribe(entry.body, entry.origin, key),
      from: record.from,
      to: key,
      timestamp: entry.timestamp,
    })
    return update(r.ok ? { state: 'logged', hubspotId: r.id, error: null } : { state: 'failed', error: r.error })
  } catch (err) {
    return update({ state: err.uncertain ? 'uncertain' : 'failed', error: err.message })
  }
}

export async function retryEmailLogs() {
  let retried = 0
  for (const record of Object.values(await hgetallJSON(SENDS_KEY))) {
    for (const [gmailId, entry] of Object.entries(record.hubspotLogs ?? {})) {
      if (!['queued', 'failed', 'pending'].includes(entry.state)) continue
      try {
        await logToHubSpot(record.email, gmailId)
        retried++
      } catch (err) {
        console.warn(`[SCOUT] Journalisation HubSpot de ${record.email} : ${err.message}`)
      }
    }
  }
  return retried
}
