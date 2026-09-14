// ─── Stockage partagé (Upstash Redis via /api/store) ─────────────────────────
// Les composants continuent de lire localStorage, qui sert de cache local.
// Au démarrage, hydrate() remplace ce cache par les données du serveur ; chaque
// écriture via saveShared() met à jour le cache et n'envoie au serveur que les
// entrées modifiées (une entrée = un champ de hash Redis), pour ne pas écraser
// ce que d'autres utilisateurs modifient en parallèle.
// Sans base configurée (/api/store → 503), l'app reste en mode local.

import { useSyncExternalStore } from 'react'

const SHARED_KEY_RE = /^scout_(campaign|deals|outreach_juridique|(domains|zefix|linkedin)_[a-z_]+)$/
const MIGRATED_KEY  = 'scout_store_migrated'
const CHUNK         = 400

// Clés manipulées en tableau dans l'app, indexées par id côté serveur
const ARRAY_KEYS = {
  scout_deals: (a, b) => Number(b.id) - Number(a.id),
}

// ─── Statut (indicateur dans l'en-tête) ───────────────────────────────────────
let status = 'loading' // loading | cloud | local | error
const listeners = new Set()

function setStatus(next) {
  if (next === status) return
  status = next
  listeners.forEach((l) => l())
}

export function useStoreStatus() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => status,
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}
function toMap(key, value) {
  if (!value) return {}
  if (ARRAY_KEYS[key]) {
    return Object.fromEntries((Array.isArray(value) ? value : []).map((item) => [item.id, item]))
  }
  return value
}
function fromMap(key, map) {
  return ARRAY_KEYS[key] ? Object.values(map).sort(ARRAY_KEYS[key]) : map
}

async function postOps(ops) {
  for (let i = 0; i < ops.length; i += CHUNK) {
    const r = await fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: ops.slice(i, i + CHUNK) }),
    })
    if (!r.ok) throw new Error(`store HTTP ${r.status}`)
  }
}

// ─── Chargement initial ───────────────────────────────────────────────────────
export async function hydrate() {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 5000)
  try {
    const r = await fetch('/api/store', { signal: ctrl.signal })
    if (!r.ok) { setStatus('local'); return }
    const { data = {} } = await r.json()

    // Première connexion de ce navigateur : on envoie les données locales
    // absentes du serveur. Ensuite, le serveur fait foi.
    const migrate = localStorage.getItem(MIGRATED_KEY) !== '1'
    const uploads = []
    const localKeys = Object.keys(localStorage).filter((k) => SHARED_KEY_RE.test(k))

    for (const key of new Set([...localKeys, ...Object.keys(data)])) {
      const server = data[key] ?? {}
      let merged = server
      if (migrate) {
        const local = toMap(key, readLocal(key))
        for (const [field, value] of Object.entries(local)) {
          if (!(field in server)) uploads.push({ key, field, value })
        }
        merged = { ...local, ...server }
      }
      writeLocal(key, fromMap(key, merged))
    }

    if (uploads.length) await postOps(uploads)
    localStorage.setItem(MIGRATED_KEY, '1')
    setStatus('cloud')
  } catch {
    setStatus('local')
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Écriture ─────────────────────────────────────────────────────────────────
let queue = []
let timer = null

async function flush() {
  timer = null
  const ops = queue
  queue = []
  if (!ops.length) return
  try {
    await postOps(ops)
    setStatus('cloud')
  } catch {
    setStatus('error')
    queue = [...ops, ...queue]
    if (!timer) timer = setTimeout(flush, 10_000)
  }
}

// Remplace localStorage.setItem(key, JSON.stringify(next)) pour les données partagées
export function saveShared(key, next) {
  const prev = toMap(key, readLocal(key))
  writeLocal(key, next)
  if (status !== 'cloud' && status !== 'error') return

  const nextMap = toMap(key, next)
  for (const field of new Set([...Object.keys(prev), ...Object.keys(nextMap)])) {
    if (!(field in nextMap)) {
      queue.push({ key, field, value: null })
    } else if (JSON.stringify(prev[field]) !== JSON.stringify(nextMap[field])) {
      queue.push({ key, field, value: nextMap[field] })
    }
  }
  if (queue.length && !timer) timer = setTimeout(flush, 400)
}

// Dernier envoi si l'onglet se ferme avant le flush
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (!queue.length) return
    navigator.sendBeacon('/api/store', new Blob([JSON.stringify({ ops: queue.slice(0, CHUNK) })], { type: 'application/json' }))
    queue = []
  })
}
