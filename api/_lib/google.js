// ─── Gmail : OAuth, envoi et lecture des fils ────────────────────────────────
// Variables d'environnement : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Le refresh token est conservé dans Redis sous "secret:gmail" (hors /api/store).

import { redisOne } from './redis.js'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  // gmail.modify ⊃ gmail.readonly : lit, modifie les labels, applique SCOUT
  'https://www.googleapis.com/auth/gmail.modify',
]
const ACCOUNT_KEY = 'secret:gmail'

export function googleConfig() {
  const id = process.env.GOOGLE_CLIENT_ID
  const secret = process.env.GOOGLE_CLIENT_SECRET
  return id && secret ? { id, secret } : null
}

export const redirectUri = (origin) => `${origin}/api/gmail/callback`

export function authUrl(origin, state) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: googleConfig().id,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString()
  return url.toString()
}

async function tokenRequest(params) {
  const { id, secret } = googleConfig()
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Google OAuth : ${data.error_description ?? data.error ?? r.status}`)
  return data
}

let cachedToken = null // { token, exp }

async function accessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token
  const account = await gmailAccount()
  if (!account) throw Object.assign(new Error('Gmail non connecté'), { code: 'GMAIL_DISCONNECTED' })
  const t = await tokenRequest({ refresh_token: account.refreshToken, grant_type: 'refresh_token' })
  cachedToken = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 }
  return cachedToken.token
}

async function gmailApi(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token ?? await accessToken()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Gmail ${r.status} : ${data.error?.message ?? 'erreur'}`)
  return data
}

// ─── Compte connecté ──────────────────────────────────────────────────────────
export async function gmailAccount() {
  const raw = await redisOne('GET', ACCOUNT_KEY)
  return raw ? JSON.parse(raw) : null
}

export async function exchangeCode(code, origin) {
  const tokens = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(origin) })
  if (!tokens.refresh_token) {
    throw new Error("Google n'a pas fourni d'autorisation durable : retirez l'accès SCOUT dans votre compte Google puis reconnectez")
  }
  const profile = await gmailApi('/profile', { token: tokens.access_token })
  await redisOne('SET', ACCOUNT_KEY, JSON.stringify({
    refreshToken: tokens.refresh_token, email: profile.emailAddress, connectedAt: Date.now(),
  }))
  cachedToken = null
  return profile.emailAddress
}

export async function disconnectGmail() {
  cachedToken = null
  await redisOne('DEL', ACCOUNT_KEY)
}

// ─── Label Gmail « SCOUT » ────────────────────────────────────────────────────
// Créé automatiquement si absent. ID mis en cache Redis 24 h.
const LABEL_CACHE_KEY = 'secret:gmail_label_scout'

export async function ensureScoutLabel() {
  const cached = await redisOne('GET', LABEL_CACHE_KEY).catch(() => null)
  if (cached) return cached

  const list = await gmailApi('/labels').catch(() => ({ labels: [] }))
  const existing = (list.labels ?? []).find((l) => l.name === 'SCOUT')
  if (existing) {
    await redisOne('SET', LABEL_CACHE_KEY, existing.id, 'EX', 86400).catch(() => {})
    return existing.id
  }
  const created = await gmailApi('/labels', {
    method: 'POST',
    body: { name: 'SCOUT', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
  }).catch(() => null)
  if (!created?.id) return null
  await redisOne('SET', LABEL_CACHE_KEY, created.id, 'EX', 86400).catch(() => {})
  return created.id
}

// Applique le label SCOUT à un message — best-effort, ne bloque jamais l'envoi.
// Requiert le scope gmail.modify (ajouté ci-dessus) ; si le token actuel n'a pas
// encore ce scope (avant re-auth), l'erreur est silencieuse.
export async function applyScoutLabel(gmailMessageId) {
  try {
    const labelId = await ensureScoutLabel()
    if (!labelId) return
    await gmailApi(`/messages/${gmailMessageId}/modify`, {
      method: 'POST',
      body: { addLabelIds: [labelId] },
    })
  } catch (err) {
    console.warn(`[SCOUT] label SCOUT non appliqué sur ${gmailMessageId} : ${err.message}`)
  }
}

// ─── Envoi ────────────────────────────────────────────────────────────────────
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim()

function encodeWord(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/.{76}(?=.)/g, '$&\r\n')
}

// Génère un boundary qui ne figure pas dans le contenu.
function makeBoundary(...parts) {
  let b
  do { b = `----=_Part_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}` }
  while (parts.some((p) => p.includes(b)))
  return b
}

// Construit le MIME complet (text/plain + text/html) ou plain seul si html absent.
// Retourne le raw base64url prêt pour l'API Gmail.
function buildRaw({ name, accountEmail, to, subject, text, html, inReplyTo }) {
  const commonHeaders = [
    `From: ${name ? `${encodeWord(name)} <${accountEmail}>` : accountEmail}`,
    `To: ${oneLine(to)}`,
    `Subject: ${encodeWord(oneLine(subject))}`,
    'MIME-Version: 1.0',
  ]
  if (inReplyTo) {
    commonHeaders.push(`In-Reply-To: ${oneLine(inReplyTo)}`, `References: ${oneLine(inReplyTo)}`)
  }

  let mime
  if (html) {
    const boundary = makeBoundary(text, html)
    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(text),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(html),
      '',
      `--${boundary}--`,
    ].join('\r\n')

    mime = [
      ...commonHeaders,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      parts,
    ].join('\r\n')
  } else {
    mime = [
      ...commonHeaders,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(text),
    ].join('\r\n')
  }

  return Buffer.from(mime, 'utf8').toString('base64url')
}

export async function sendGmail({ fromName, to, subject, text, html, threadId, inReplyTo }) {
  const account = await gmailAccount()
  if (!account) throw Object.assign(new Error('Gmail non connecté'), { code: 'GMAIL_DISCONNECTED' })

  const name = oneLine(fromName).replace(/["<>]/g, '')
  const raw = buildRaw({ name, accountEmail: account.email, to, subject, text, html, inReplyTo })

  const sent = await gmailApi('/messages/send', { method: 'POST', body: { raw, ...(threadId ? { threadId } : {}) } })
  const meta = await gmailApi(`/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`)
  const messageId = meta.payload?.headers?.find((h) => h.name.toLowerCase() === 'message-id')?.value ?? null
  return { id: sent.id, threadId: sent.threadId, messageId, from: account.email }
}

// Messages du fil qui ne viennent pas de nous (réponses, rejets)
// Retourne aussi messageId (pour le dédoublonnage) et les en-têtes de détection
// des réponses automatiques (Auto-Submitted, X-Autoreply, X-Auto-Response-Suppress).
export async function threadReplies(threadId) {
  const thread = await gmailApi(
    `/threads/${threadId}?format=metadata&metadataHeaders=From,Message-ID,Auto-Submitted,X-Autoreply,X-Auto-Response-Suppress`,
  )
  return (thread.messages ?? [])
    .filter((m) => !(m.labelIds ?? []).includes('SENT'))
    .map((m) => {
      const hdrs = m.payload?.headers ?? []
      const h = (name) => hdrs.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? ''
      const autoSubmitted = h('Auto-Submitted')
      const xAutoreply   = h('X-Autoreply')
      const xAutoSuppress = h('X-Auto-Response-Suppress')
      const isAutoReply  = /auto-(replied|generated|responded)/i.test(autoSubmitted) ||
        xAutoreply === 'yes' || /OOF|AutoReply/i.test(xAutoSuppress)
      return {
        id:          m.id ?? '',
        messageId:   h('Message-ID'),
        from:        h('From'),
        snippet:     m.snippet ?? '',
        date:        Number(m.internalDate),
        isAutoReply,
      }
    })
}
