// ─── Gmail : OAuth, envoi et lecture des fils ────────────────────────────────
// Variables d'environnement : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Le refresh token est conservé dans Redis sous "secret:gmail" (hors /api/store).

import { redisOne } from './redis.js'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
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

// ─── Envoi ────────────────────────────────────────────────────────────────────
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim()

function encodeWord(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

export async function sendGmail({ fromName, to, subject, text, threadId, inReplyTo }) {
  const account = await gmailAccount()
  if (!account) throw Object.assign(new Error('Gmail non connecté'), { code: 'GMAIL_DISCONNECTED' })

  const name = oneLine(fromName).replace(/["<>]/g, '')
  const headers = [
    `From: ${name ? `${encodeWord(name)} <${account.email}>` : account.email}`,
    `To: ${oneLine(to)}`,
    `Subject: ${encodeWord(oneLine(subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ]
  if (inReplyTo) headers.push(`In-Reply-To: ${oneLine(inReplyTo)}`, `References: ${oneLine(inReplyTo)}`)

  const body = Buffer.from(text, 'utf8').toString('base64').replace(/.{76}(?=.)/g, '$&\r\n')
  const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'utf8').toString('base64url')

  const sent = await gmailApi('/messages/send', { method: 'POST', body: { raw, ...(threadId ? { threadId } : {}) } })
  const meta = await gmailApi(`/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`)
  const messageId = meta.payload?.headers?.find((h) => h.name.toLowerCase() === 'message-id')?.value ?? null
  return { id: sent.id, threadId: sent.threadId, messageId, from: account.email }
}

// Messages du fil qui ne viennent pas de nous (réponses, rejets)
export async function threadReplies(threadId) {
  const thread = await gmailApi(`/threads/${threadId}?format=metadata&metadataHeaders=From`)
  return (thread.messages ?? [])
    .filter((m) => !(m.labelIds ?? []).includes('SENT'))
    .map((m) => ({
      from: m.payload?.headers?.find((h) => h.name.toLowerCase() === 'from')?.value ?? '',
      snippet: m.snippet ?? '',
      date: Number(m.internalDate),
    }))
}
