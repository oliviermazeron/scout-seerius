// ─── Appels HTTP HubSpot : délai d'expiration, reprise sur 429 et 5xx ────────
// Utilisé uniquement par les deux clients isolés hubspot-scout.js et
// hubspot-comms.js : les routes n'appellent jamais ce module directement.
//
// Hôte : api.hubapi.com pour tous les centres de données, EU1 compris.
// Limites (applications privées héritées / clés de service, Starter) :
// 100 requêtes / 10 s par application, 250 000 / jour partagées par le portail.
// HubSpot n'envoie pas de Retry-After sur 429 : on attend la fenêtre indiquée
// par X-HubSpot-RateLimit-Interval-Milliseconds, sinon un backoff exponentiel.
// Doc : https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines

export const HUBSPOT_HOST = 'https://api.hubapi.com'

const MAX_RETRIES = 3
const DEFAULT_TIMEOUT_MS = 8000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Masque tout token HubSpot qui apparaîtrait dans un message ou un log
export function maskSecrets(text) {
  return String(text ?? '').replace(/pat-[a-z0-9]+-[A-Za-z0-9-]+/g, 'pat-***')
}

// → { ok, status, data } ; lève une erreur (err.uncertain = true pour une
// écriture) si HubSpot est injoignable ou ne répond pas dans le délai.
export async function hubspotRequest(token, path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  for (let attempt = 0; ; attempt++) {
    let response
    try {
      response = await fetch(`${HUBSPOT_HOST}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'délai dépassé' : maskSecrets(err?.message)
      throw Object.assign(new Error(`HubSpot injoignable (${reason})`), { network: true, uncertain: method !== 'GET' })
    }

    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt >= MAX_RETRIES) {
      const data = await response.json().catch(() => ({}))
      if (data?.message) data.message = maskSecrets(data.message)
      return { ok: response.ok, status: response.status, data }
    }

    const windowMs = Number(response.headers.get('x-hubspot-ratelimit-interval-milliseconds'))
    const remaining = response.headers.get('x-hubspot-ratelimit-remaining')
    const wait = response.status === 429 && windowMs && remaining === '0' ? windowMs : 500 * 2 ** attempt
    await sleep(wait + Math.random() * 250)
  }
}
