// ─── Code d'accès SCOUT pour les actions sensibles (envoi Gmail) ─────────────
// Le code est demandé une fois et conservé dans ce navigateur ; le serveur le
// vérifie sur chaque route Gmail / envoi (en-tête X-Scout-Access).

const KEY = 'scout_access_code'

export function getAccessCode() {
  try { return localStorage.getItem(KEY) ?? '' } catch { return '' }
}

export function setAccessCode(code) {
  try { code ? localStorage.setItem(KEY, code) : localStorage.removeItem(KEY) } catch {}
}

export async function secureFetch(url, { method = 'GET', body } = {}) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Scout-Access': getAccessCode() },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
}
