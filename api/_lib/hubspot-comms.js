// ─── Client HubSpot « COMMS » — préférences de communication ─────────────────
// Identité : application privée héritée « SCOUT COMMS » (HUBSPOT_COMMS_TOKEN).
// Portées : crm.objects.contacts.read, sales-email-read,
//           communication_preferences.read_write.
// Usage autorisé : lire le statut d'abonnement d'un destinataire, enregistrer
// une désinscription. Aucune écriture de contact, de société ni d'email ici
// (voir hubspot-scout.js).
//
// HubSpot est la référence du consentement : toute erreur ou tout délai dépassé
// lors d'une lecture lève une exception, et l'appelant n'envoie pas (fail-closed).
// Portail sans RGPD activé : legalBasis n'est pas requis à l'écriture.
// Doc v4 : https://developers.hubspot.com/docs/api-reference/communication-preferences-subscriptions-v4/guide

import { hubspotRequest } from './hubspot-http.js'

const SUBSCRIPTION_NAME = /one\s*to\s*one/i
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
const normalize = (email) => String(email ?? '').trim().toLowerCase()

let subscriptionId = null
const statusCache = new Map() // email → { value, exp }

export function clearCommsCache() {
  subscriptionId = null
  statusCache.clear()
}

// ID du type d'abonnement « One to One », lu dans HubSpot (jamais en dur).
// Doc : https://developers.hubspot.com/docs/api-reference/communication-preferences-subscriptions-v4/subscription-definitions/get-communication-preferences-v4-definitions
export async function oneToOneSubscriptionId() {
  if (subscriptionId) return subscriptionId
  const r = await request('/communication-preferences/v4/definitions', { timeoutMs: STATUS_TIMEOUT_MS })
  if (!r.ok) throw new Error(`Types d'abonnement HubSpot illisibles (HTTP ${r.status})`)
  const definition = (r.data.results ?? []).find((d) => d.isActive !== false && SUBSCRIPTION_NAME.test(d.name ?? ''))
  if (!definition) throw new Error('Type d\'abonnement « One to One » introuvable dans HubSpot')
  subscriptionId = definition.id
  return subscriptionId
}

// → { unsubscribed, status, unsubscribedFromAll } ; lève en cas de doute.
// Cache mémoire de 60 s : HubSpot reste la référence, le cache évite seulement
// de relire le statut plusieurs fois pendant un même envoi groupé.
export async function checkSubscription(email) {
  const key = normalize(email)
  const cached = statusCache.get(key)
  if (cached && cached.exp > Date.now()) return cached.value

  const id = await oneToOneSubscriptionId()

  // Statuts par type d'abonnement.
  // Doc : https://developers.hubspot.com/docs/api-reference/communication-preferences-subscriptions-v4/subscription-status/get-communication-preferences-v4-statuses-subscriberIdString
  const statuses = await request(`/communication-preferences/v4/statuses/${encodeURIComponent(key)}?channel=EMAIL`, { timeoutMs: STATUS_TIMEOUT_MS })
  if (!statuses.ok) throw new Error(`Statut d'abonnement HubSpot indisponible (HTTP ${statuses.status})`)
  const oneToOne = (statuses.data.results ?? []).find((s) => String(s.subscriptionId) === String(id))

  // Désinscription de toutes les communications (protection supplémentaire).
  // Doc : https://developers.hubspot.com/docs/api-reference/communication-preferences-subscriptions-v4/subscription-status/get-communication-preferences-v4-statuses-subscriberIdString-unsubscribe-all
  const wide = await request(`/communication-preferences/v4/statuses/${encodeURIComponent(key)}/unsubscribe-all`, { timeoutMs: STATUS_TIMEOUT_MS })
  if (!wide.ok) throw new Error(`Statut « désinscrit de tout » HubSpot indisponible (HTTP ${wide.status})`)
  const wideResults = wide.data.results ?? []
  if (!Array.isArray(wideResults)) throw new Error('Réponse « désinscrit de tout » HubSpot illisible')
  const unsubscribedFromAll = wideResults.some((w) => (w.statusState ?? w.status) === 'UNSUBSCRIBED')

  const value = {
    unsubscribed: oneToOne?.status === 'UNSUBSCRIBED' || unsubscribedFromAll,
    status: oneToOne?.status ?? 'NOT_SPECIFIED',
    unsubscribedFromAll,
  }
  statusCache.set(key, { value, exp: Date.now() + CACHE_TTL_MS })
  return value
}

// Désinscrit le destinataire du type « One to One ».
// Doc : https://developers.hubspot.com/docs/api-reference/communication-preferences-subscriptions-v4/subscription-status/post-communication-preferences-v4-statuses-subscriberIdString
export async function unsubscribe(email) {
  const key = normalize(email)
  const id = await oneToOneSubscriptionId()
  const r = await request(`/communication-preferences/v4/statuses/${encodeURIComponent(key)}`, {
    method: 'POST',
    body: { subscriptionId: Number(id), statusState: 'UNSUBSCRIBED', channel: 'EMAIL' },
  })
  statusCache.delete(key)
  return r.ok ? { ok: true } : { ok: false, error: r.data.message ?? `HTTP ${r.status}` }
}
