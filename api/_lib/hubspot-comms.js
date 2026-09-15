// ─── Client HubSpot « COMMS » — préférences de communication ─────────────────
// Identité : application privée héritée « SCOUT COMMS » (HUBSPOT_COMMS_TOKEN).
// Portées : crm.objects.contacts.read, sales-email-read,
//           communication_preferences.read_write.
// Usage autorisé : lire le statut d'abonnement d'un destinataire, enregistrer
// une désinscription. Aucune écriture de contact, de société ni d'email ici
// (voir hubspot-scout.js).
//
// Type d'abonnement visé : « Prospection Seerius — intermédiaires » (français).
// « Marketing Information » et « One to One » sont hors périmètre SCOUT.
// L'ID du type est lu dans HubSpot et mis en cache en mémoire ; s'il est
// introuvable, inactif ou ambigu, on échoue explicitement : jamais de repli sur
// un autre type, jamais d'ID en dur.
//
// HubSpot est la référence du consentement : toute erreur ou tout délai dépassé
// lors d'une lecture lève une exception, et l'appelant n'envoie pas (fail-closed).
// Portail sans RGPD activé : legalBasis n'est pas requis à l'écriture.
// Doc v4 : https://developers.hubspot.com/docs/api-reference/communication-preferences-subscriptions-v4/guide

import { hubspotRequest } from './hubspot-http.js'

export const SUBSCRIPTION_NAME = 'Prospection Seerius — intermédiaires'

const STATUS_TIMEOUT_MS = 5000
const CACHE_TTL_MS = 60_000

export const commsEnabled = () => !!process.env.HUBSPOT_COMMS_TOKEN

function commsToken() {
  const token = process.env.HUBSPOT_COMMS_TOKEN
  if (!token) {
    throw Object.assign(new Error('Module communications désactivé : HUBSPOT_COMMS_TOKEN absent'), { code: 'COMMS_DISABLED' })
  }
  return token
}

const request = (path, options) => hubspotRequest(commsToken(), path, options)

// Message d'erreur renvoyé par HubSpot (déjà expurgé de tout token), pour le diagnostic
const hubspotMessage = (r) => (r.data?.message ? ` : ${String(r.data.message).slice(0, 200)}` : '')
const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase()

// Compare les noms sans tenir compte de la casse, des accents, des variantes de
// tiret ni des espaces multiples (saisie dans l'interface HubSpot)
function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‐-―−-]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

let subscriptionId = null
const statusCache = new Map() // email → { value, exp }

export function clearCommsCache() {
  subscriptionId = null
  statusCache.clear()
}

// ID du type « Prospection Seerius — intermédiaires », lu dans HubSpot.
// Doc : https://developers.hubspot.com/docs/api-reference/communication-preferences-subscriptions-v4/subscription-definitions/get-communication-preferences-v4-definitions
export async function prospectionSubscriptionId() {
  if (subscriptionId) return subscriptionId
  const r = await request('/communication-preferences/v4/definitions', { timeoutMs: STATUS_TIMEOUT_MS })
  if (!r.ok) throw new Error(`Types d'abonnement HubSpot illisibles (HTTP ${r.status})`)

  const wanted = normalizeName(SUBSCRIPTION_NAME)
  const matches = (r.data.results ?? []).filter((d) => normalizeName(d.name) === wanted)
  if (matches.length === 0) throw new Error(`Type d'abonnement « ${SUBSCRIPTION_NAME} » introuvable dans HubSpot`)
  if (matches.length > 1) throw new Error(`Plusieurs types d'abonnement « ${SUBSCRIPTION_NAME} » dans HubSpot : ambigu`)
  if (matches[0].isActive === false) throw new Error(`Type d'abonnement « ${SUBSCRIPTION_NAME} » inactif dans HubSpot`)

  subscriptionId = matches[0].id
  return subscriptionId
}

// → { unsubscribed, status, unsubscribedFromAll } ; lève en cas de doute.
// Cache mémoire de 60 s : HubSpot reste la référence, le cache évite seulement
// de relire le statut plusieurs fois pendant un même envoi groupé.
export async function checkSubscription(email) {
  const key = normalizeEmail(email)
  const cached = statusCache.get(key)
  if (cached && cached.exp > Date.now()) return cached.value

  const id = await prospectionSubscriptionId()

  // Statuts par type d'abonnement.
  // Doc : https://developers.hubspot.com/docs/api-reference/communication-preferences-subscriptions-v4/subscription-status/get-communication-preferences-v4-statuses-subscriberIdString
  const statuses = await request(`/communication-preferences/v4/statuses/${encodeURIComponent(key)}?channel=EMAIL`, { timeoutMs: STATUS_TIMEOUT_MS })
  if (!statuses.ok) throw new Error(`Statut d'abonnement HubSpot indisponible (HTTP ${statuses.status}${hubspotMessage(statuses)})`)
  const prospection = (statuses.data.results ?? []).find((s) => String(s.subscriptionId) === String(id))

  // Désinscription de toutes les communications (protection supplémentaire).
  // Doc : https://developers.hubspot.com/docs/api-reference/communication-preferences-subscriptions-v4/subscription-status/get-communication-preferences-v4-statuses-subscriberIdString-unsubscribe-all
  // channel=EMAIL requis : sans lui, HubSpot répond 400 (constaté en production le 15.09.2026).
  const wide = await request(`/communication-preferences/v4/statuses/${encodeURIComponent(key)}/unsubscribe-all?channel=EMAIL`, { timeoutMs: STATUS_TIMEOUT_MS })
  if (!wide.ok) throw new Error(`Statut « désinscrit de tout » HubSpot indisponible (HTTP ${wide.status}${hubspotMessage(wide)})`)
  // Réponse documentée : objet unique { channel, subscriberIdString, status, wideStatusType, … }.
  // Un tableau results[] est aussi accepté. Aucun statut lisible → on lève (fail-closed).
  const wideEntries = Array.isArray(wide.data?.results) ? wide.data.results : [wide.data]
  const wideStatuses = wideEntries.map((w) => w?.statusState ?? w?.status).filter((s) => ['SUBSCRIBED', 'UNSUBSCRIBED', 'NOT_SPECIFIED'].includes(s))
  if (!wideStatuses.length) {
    // Extrait de la réponse (statuts d'abonnement uniquement, aucun secret) pour le diagnostic
    throw new Error(`Réponse « désinscrit de tout » HubSpot illisible : ${JSON.stringify(wide.data ?? null).slice(0, 400)}`)
  }
  const unsubscribedFromAll = wideStatuses.includes('UNSUBSCRIBED')

  const value = {
    unsubscribed: prospection?.status === 'UNSUBSCRIBED' || unsubscribedFromAll,
    status: prospection?.status ?? 'NOT_SPECIFIED',
    unsubscribedFromAll,
  }
  statusCache.set(key, { value, exp: Date.now() + CACHE_TTL_MS })
  return value
}

// Désinscrit le destinataire du type « Prospection Seerius — intermédiaires ».
// Doc : https://developers.hubspot.com/docs/api-reference/communication-preferences-subscriptions-v4/subscription-status/post-communication-preferences-v4-statuses-subscriberIdString
export async function unsubscribe(email) {
  const key = normalizeEmail(email)
  const id = await prospectionSubscriptionId()
  const r = await request(`/communication-preferences/v4/statuses/${encodeURIComponent(key)}`, {
    method: 'POST',
    body: { subscriptionId: Number(id), statusState: 'UNSUBSCRIBED', channel: 'EMAIL' },
  })
  statusCache.delete(key)
  return r.ok ? { ok: true } : { ok: false, error: r.data.message ?? `HTTP ${r.status}` }
}
