// ─── Tests de l'envoi de campagne ────────────────────────────────────────────
// Gmail, HubSpot (clients SCOUT et COMMS) et Redis sont simulés : aucun test ne
// touche Gmail ni le portail HubSpot réel. Aucune valeur de token réelle.
// Lancer : npm test

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const SCOUT_KEY = 'fake-scout-key'
const COMMS_TOKEN = 'fake-comms-token'

const BASE_ENV = {
  KV_REST_API_URL: 'https://fake-upstash', KV_REST_API_TOKEN: 'fake-kv',
  SCOUT_ACCESS_CODE: 'code-test', OUTREACH_SECRET: 'fake-sign-secret', CRON_SECRET: 'fake-cron-secret',
  PUBLIC_URL: 'https://scout.test', GOOGLE_CLIENT_ID: 'fake-google-id', GOOGLE_CLIENT_SECRET: 'fake-google-secret',
  HUBSPOT_SCOUT_KEY: SCOUT_KEY, HUBSPOT_COMMS_TOKEN: COMMS_TOKEN, OUTREACH_DAILY_CAP: '3',
}
Object.assign(process.env, BASE_ENV)
console.info = () => {}
console.warn = () => {}

const ACCESS = { 'x-scout-access': 'code-test' }
const CRON = { authorization: 'Bearer fake-cron-secret' }
const MONDAY_10H_ZURICH = '2026-09-14T08:00:00Z'

// ─── Monde simulé ─────────────────────────────────────────────────────────────
let world

function resetWorld() {
  world = {
    kv: new Map(),
    calls: [],           // { url, method, auth }
    violations: [],      // mauvais identifiant HubSpot utilisé
    gmailSent: [],       // { id, threadId, raw }
    threads: new Map(),  // threadId → [{ labelIds, from, snippet }]
    unsubscribed: new Set(),         // désinscrits du type « Prospection Seerius — intermédiaires »
    unsubscribedOneToOne: new Set(), // désinscrits du type « One to One » (hors périmètre)
    unsubscribedAll: new Set(),
    definitions: 'ok',               // 'ok' | 'missing' | 'inactive'
    wideShape: 'observed',           // 'observed' (production) | 'object' (documentée) | 'unreadable'
    owners: [{ id: '87370009', email: 'olivier@seerius.ch', archived: false }],
    ownersFail: false,
    tasks: [],                       // corps POST /engagements/v1/engagements
    statusFail: null,    // 'http' | 'timeout' | '429once'
    emailLog: 'ok',      // 'ok' | 'error' | 'network'
    unsubscribeFail: false,
    emailPosts: [],
  }
}

const hash = (k) => { if (!world.kv.has(k)) world.kv.set(k, new Map()); return world.kv.get(k) }
function redisCommand([c, ...a]) {
  switch (c) {
    case 'GET': return typeof world.kv.get(a[0]) === 'string' ? world.kv.get(a[0]) : null
    case 'SET': world.kv.set(a[0], a[1]); return 'OK'
    case 'GETDEL': { const v = world.kv.get(a[0]) ?? null; world.kv.delete(a[0]); return v }
    case 'DEL': world.kv.delete(a[0]); return 1
    case 'INCR': { const v = Number(world.kv.get(a[0]) ?? 0) + 1; world.kv.set(a[0], String(v)); return v }
    case 'DECR': { const v = Number(world.kv.get(a[0]) ?? 0) - 1; world.kv.set(a[0], String(v)); return v }
    case 'EXPIRE': return 1
    case 'HGET': return hash(a[0]).get(a[1]) ?? null
    case 'HSET': hash(a[0]).set(a[1], a[2]); return 1
    case 'HSETNX': if (hash(a[0]).has(a[1])) return 0; hash(a[0]).set(a[1], a[2]); return 1
    case 'HDEL': hash(a[0]).delete(a[1]); return 1
    case 'HGETALL': return [...hash(a[0]).entries()].flat()
    case 'SCAN': return ['0', [...world.kv.keys()].filter((k) => k.startsWith('scout:'))]
  }
  throw new Error(`commande Redis non simulée : ${c}`)
}

const reply = (data, status = 200, headers = {}) => ({
  ok: status < 300, status, headers: new Headers(headers),
  json: async () => data, text: async () => JSON.stringify(data),
})

const HS = 'https://api.hubapi.com'
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url)
  const method = opts.method ?? 'GET'
  const auth = opts.headers?.Authorization ?? ''
  world.calls.push({ url: u, method, auth })
  const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body

  if (u === 'https://fake-upstash/pipeline') return reply(body.map((cmd) => ({ result: redisCommand(cmd) })))
  if (u === 'https://oauth2.googleapis.com/token') return reply({ access_token: 'fake-access', expires_in: 3600, refresh_token: 'fake-refresh' })

  if (u.startsWith(GMAIL)) {
    const path = u.slice(GMAIL.length)
    if (path === '/profile') return reply({ emailAddress: 'olivier@seerius.ch' })
    if (path === '/messages/send') {
      const id = `m${world.gmailSent.length + 1}`
      const threadId = body.threadId ?? `t${world.gmailSent.length + 1}`
      world.gmailSent.push({ id, threadId, raw: Buffer.from(body.raw, 'base64url').toString('utf8') })
      world.threads.set(threadId, [...(world.threads.get(threadId) ?? []), { labelIds: ['SENT'], from: 'olivier@seerius.ch', snippet: '' }])
      return reply({ id, threadId })
    }
    if (path.startsWith('/messages/')) {
      const id = path.split('/')[2].split('?')[0]
      return reply({ payload: { headers: [{ name: 'Message-ID', value: `<${id}@mail.gmail.com>` }] } })
    }
    if (path.startsWith('/threads/')) {
      const tid = path.split('/')[2].split('?')[0]
      return reply({
        messages: (world.threads.get(tid) ?? []).map((m, i) => ({
          id: `${tid}-${i}`, labelIds: m.labelIds, snippet: m.snippet, internalDate: String(Date.now()),
          payload: { headers: [{ name: 'From', value: m.from }] },
        })),
      })
    }
  }

  if (u.startsWith(HS)) {
    const path = u.slice(HS.length)
    const isPrefs = path.startsWith('/communication-preferences/')
    const expected = isPrefs ? COMMS_TOKEN : SCOUT_KEY
    if (auth !== `Bearer ${expected}`) world.violations.push(`${method} ${path} appelé avec le mauvais identifiant`)

    if (path.startsWith('/crm/v3/owners')) {
      if (world.ownersFail) return reply({ message: "This app hasn't been granted all required scopes to make this call." }, 403)
      const email = new URL(u).searchParams.get('email')
      return reply({ results: world.owners.filter((o) => o.email === email) })
    }
    if (path === '/engagements/v1/engagements') {
      world.tasks.push(body)
      return reply({ engagement: { id: world.tasks.length } })
    }
    if (path === '/crm/v3/objects/companies') return reply({ id: 'c1' }, 201)
    if (path === '/crm/v3/objects/contacts') return reply({ id: 'p1' }, 201)
    if (path.includes('/associations/companies/')) return reply({})
    if (path === '/crm/associations/2026-09/email/contact/labels') {
      return reply({ results: [{ category: 'HUBSPOT_DEFINED', typeId: 198, label: null }] })
    }
    if (path === '/crm/v3/objects/emails') {
      world.emailPosts.push(body)
      if (world.emailLog === 'network') throw new TypeError('fetch failed')
      if (world.emailLog === 'error') return reply({ message: 'Property values were not valid' }, 400)
      return reply({ id: `e${world.emailPosts.length}` }, 201)
    }
    if (path === '/communication-preferences/v4/definitions') {
      const results = [
        { id: '444', name: 'Marketing Information', isActive: true },
        { id: '555', name: 'One to One', isActive: true, isDefault: true },
      ]
      if (world.definitions !== 'missing') {
        results.push({ id: '777', name: 'Prospection Seerius – intermédiaires', isActive: world.definitions !== 'inactive' })
      }
      return reply({ results })
    }
    const statusMatch = path.match(/^\/communication-preferences\/v4\/statuses\/([^/?]+)(\/unsubscribe-all)?/)
    if (statusMatch) {
      const email = decodeURIComponent(statusMatch[1])
      if (method === 'POST') {
        if (body.subscriptionId !== 777) world.violations.push(`désinscription sur le type ${body.subscriptionId} au lieu de 777`)
        if (world.unsubscribeFail) return reply({ message: 'Unavailable' }, 403)
        world.unsubscribed.add(email)
        return reply({ status: 'UNSUBSCRIBED' })
      }
      if (world.statusFail === 'timeout') throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
      if (world.statusFail === 'http') return reply({ message: 'Forbidden' }, 403)
      if (world.statusFail === '429once') {
        world.statusFail = null
        return reply({ policyName: 'TEN_SECONDLY_ROLLING' }, 429, { 'x-hubspot-ratelimit-remaining': '0', 'x-hubspot-ratelimit-interval-milliseconds': '5' })
      }
      if (statusMatch[2]) {
        if (!u.includes('channel=EMAIL')) return reply({ message: 'channel is required' }, 400)
        const unsubscribedAll = world.unsubscribedAll.has(email)
        if (world.wideShape === 'unreadable') return reply({ foo: 'bar' })
        if (world.wideShape === 'object') {
          // Forme documentée : objet unique
          return reply({
            businessUnitId: 0, channel: 'EMAIL', subscriberIdString: email, wideStatusType: 'PORTAL_WIDE',
            status: unsubscribedAll ? 'UNSUBSCRIBED' : 'SUBSCRIBED', timestamp: '2026-09-15T08:00:00Z',
          })
        }
        // Forme constatée en production : tableau vide = aucune désinscription totale
        return reply({
          status: 'COMPLETE',
          results: unsubscribedAll ? [{ subscriberIdString: email, channel: 'EMAIL', wideStatusType: 'PORTAL_WIDE', status: 'UNSUBSCRIBED' }] : [],
          startedAt: '2026-09-15T09:31:36.031Z', completedAt: '2026-09-15T09:31:36.037Z',
        })
      }
      return reply({ results: [
        { subscriptionId: 555, channel: 'EMAIL', status: world.unsubscribedOneToOne.has(email) ? 'UNSUBSCRIBED' : 'SUBSCRIBED' },
        { subscriptionId: 777, channel: 'EMAIL', status: world.unsubscribed.has(email) ? 'UNSUBSCRIBED' : 'NOT_SPECIFIED' },
      ] })
    }
  }

  throw new Error(`appel réseau non simulé : ${method} ${u}`)
}

// ─── Horloge figée (créneau d'envoi, échéances de relance) ────────────────────
const RealDate = Date
function setNow(iso) {
  const t = new RealDate(iso).getTime()
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [t])) }
    static now() { return t }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Même routage que vercel.json : 'gmail/status' → api/gmail.js avec ?action=status
async function call(route, { method = 'POST', body, query = {}, headers = {} } = {}) {
  const [file, action] = route.split('/')
  const { default: handler } = await import(`../api/${file}.js`)
  if (action) query = { ...query, action }
  let status = 200
  let payload
  const sentHeaders = {}
  const res = {
    status(code) { status = code; return this },
    setHeader(k, v) { sentHeaders[k] = v; return this },
    json(data) { payload = data },
    end(data) { payload = data },
  }
  await handler({ method, body, query, headers }, res)
  return { status, payload, headers: sentHeaders }
}

function sendBody(email, overrides = {}) {
  return {
    target: { id: `avocat:${email}`, name: 'Étude Test SA', segment: 'avocat', canton: 'VD', domain: 'etude.ch' },
    contact: { email, firstName: 'Claire', lastName: 'Dupont', role: 'Associée' },
    email: { subject: 'Dossiers de cession PME — critères', body: 'Maître Dupont,\n\nTexte accentué éàü.\n\nOlivier Mazeron' },
    followUp: { subject: 'RE: Dossiers de cession PME — critères', body: 'Relance' },
    senderName: 'Olivier Mazeron',
    ...overrides,
  }
}

async function connectGmail() {
  const auth = await call('gmail/auth-url', { headers: ACCESS })
  const state = new URL(auth.payload.url).searchParams.get('state')
  const cb = await call('gmail/callback', { method: 'GET', query: { code: 'fake-code', state } })
  assert.equal(cb.headers.Location, 'https://scout.test/?gmail=connected')
}

const sendsRegistry = () => Object.fromEntries([...hash('scout:scout_outreach_sends').entries()].map(([k, v]) => [k, JSON.parse(v)]))
const outboundTo = (prefix) => world.calls.filter((c) => c.url.startsWith(prefix))

beforeEach(async () => {
  resetWorld()
  Object.assign(process.env, BASE_ENV)
  process.env.HUBSPOT_DRY_RUN = 'false'
  setNow(MONDAY_10H_ZURICH)
  const { clearCommsCache } = await import('../api/_lib/hubspot-comms.js')
  clearCommsCache()
  const { clearScoutCache } = await import('../api/_lib/hubspot-scout.js')
  clearScoutCache()
})

afterEach(() => {
  globalThis.Date = RealDate
  assert.deepEqual(world.violations, [], 'isolation des identifiants HubSpot')
})

// ─── Mode test ────────────────────────────────────────────────────────────────
test('mode test actif par défaut, désactivé uniquement par « false »', async () => {
  const { isDryRun } = await import('../api/_lib/config.js')
  for (const [value, expected] of [[undefined, true], ['true', true], ['TRUE', true], ['0', true], ['false', false], [' False ', false]]) {
    if (value === undefined) delete process.env.HUBSPOT_DRY_RUN
    else process.env.HUBSPOT_DRY_RUN = value
    assert.equal(isDryRun(), expected, `HUBSPOT_DRY_RUN=${value}`)
  }
})

test('mode test : envoi simulé, contenu journalisé, zéro appel réseau sortant', async () => {
  delete process.env.HUBSPOT_DRY_RUN
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 200)
  assert.equal(r.payload.dryRun, true)
  assert.equal(world.calls.length, 0, 'aucun appel Redis, Gmail ou HubSpot')
  assert.equal(r.payload.preview.to, 'claire@etude.ch')
  assert.match(r.payload.preview.text, /https:\/\/scout\.test\/api\/outreach\/unsubscribe\?e=claire%40etude\.ch&t=/)
  assert.deepEqual(r.payload.preview.hubspot.contact, { email: 'claire@etude.ch', firstname: 'Claire', lastname: 'Dupont', jobtitle: 'Associée' })
})

test('mode test : suivi des relances sans lecture Gmail ni appel HubSpot', async () => {
  hash('scout:scout_outreach_sends').set('marc@fidu.ch', JSON.stringify({
    email: 'marc@fidu.ch', status: 'sent', sentAt: 0, threadId: 't9',
    followUp: { subject: 'RE: x', body: 'Relance', dueAt: 1 },
  }))
  delete process.env.HUBSPOT_DRY_RUN
  const r = await call('outreach/followups', { method: 'GET', headers: CRON })
  assert.equal(r.payload.dryRun, true)
  assert.equal(r.payload.wouldFollowUp, 1)
  assert.equal(outboundTo(GMAIL).length + outboundTo(HS).length, 0)
})

// ─── Garde-fous avant envoi ───────────────────────────────────────────────────
test('code d\'accès requis pour envoyer et pour le suivi', async () => {
  assert.equal((await call('outreach/send', { body: sendBody('a@b.ch') })).status, 401)
  assert.equal((await call('outreach/send', { body: sendBody('a@b.ch'), headers: { 'x-scout-access': 'faux' } })).status, 401)
  assert.equal((await call('outreach/followups', { method: 'GET' })).status, 401)
})

test('sans HUBSPOT_COMMS_TOKEN : envoi refusé, aucun email', async () => {
  await connectGmail()
  delete process.env.HUBSPOT_COMMS_TOKEN
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 503)
  assert.equal(r.payload.code, 'COMMS_DISABLED')
  assert.equal(world.gmailSent.length, 0)
})

test('destinataire désinscrit de « Prospection Seerius — intermédiaires » : pas d\'envoi', async () => {
  await connectGmail()
  world.unsubscribed.add('claire@etude.ch')
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 409)
  assert.equal(r.payload.code, 'UNSUBSCRIBED')
  assert.equal(world.gmailSent.length, 0)
})

test('seul le type « Prospection Seerius — intermédiaires » est visé (One to One hors périmètre)', async () => {
  await connectGmail()
  world.unsubscribedOneToOne.add('claire@etude.ch')
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 200)
  assert.equal(world.gmailSent.length, 1)
})

test('type d\'abonnement introuvable ou inactif : échec explicite, pas d\'envoi ni de repli', async () => {
  await connectGmail()
  const { clearCommsCache } = await import('../api/_lib/hubspot-comms.js')
  for (const state of ['missing', 'inactive']) {
    clearCommsCache()
    world.definitions = state
    const r = await call('outreach/send', { headers: ACCESS, body: sendBody(`${state}@etude.ch`) })
    assert.equal(r.status, 503, state)
    assert.equal(r.payload.code, 'SUBSCRIPTION_CHECK_FAILED')
    assert.match(r.payload.error, /Prospection Seerius — intermédiaires/)
  }
  assert.equal(world.gmailSent.length, 0)
  assert.equal(world.calls.filter((c) => /\/statuses\//.test(c.url)).length, 0, 'aucune lecture de statut sur un autre type')
})

test('destinataire désinscrit de toutes les communications : pas d\'envoi', async () => {
  await connectGmail()
  world.unsubscribedAll.add('claire@etude.ch')
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 409)
  assert.equal(world.gmailSent.length, 0)
})

test('désinscription totale : la forme documentée (objet unique) est aussi lue', async () => {
  await connectGmail()
  world.wideShape = 'object'
  world.unsubscribedAll.add('claire@etude.ch')
  assert.equal((await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })).status, 409)
  assert.equal((await call('outreach/send', { headers: ACCESS, body: sendBody('marc@fidu.ch') })).status, 200)
  assert.equal(world.gmailSent.length, 1)
})

test('statut d\'abonnement en erreur : pas d\'envoi (fail-closed)', async () => {
  await connectGmail()
  world.statusFail = 'http'
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 503)
  assert.equal(r.payload.code, 'SUBSCRIPTION_CHECK_FAILED')
  assert.equal(world.gmailSent.length, 0)
  assert.equal(world.kv.get('secret:quota:2026-09-14') ?? null, null, 'quota non consommé')
})

test('réponse « désinscrit de tout » illisible : pas d\'envoi (fail-closed)', async () => {
  await connectGmail()
  world.wideShape = 'unreadable'
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 503)
  assert.match(r.payload.error, /illisible/)
  assert.equal(world.gmailSent.length, 0)
})

test('statut d\'abonnement hors délai : pas d\'envoi (fail-closed)', async () => {
  await connectGmail()
  world.statusFail = 'timeout'
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 503)
  assert.equal(world.gmailSent.length, 0)
})

test('limite de débit HubSpot (429) : nouvel essai après la fenêtre, puis envoi', async () => {
  await connectGmail()
  world.statusFail = '429once'
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 200)
  const statusReads = world.calls.filter((c) => /statuses\/claire%40etude\.ch\?channel=EMAIL/.test(c.url))
  assert.equal(statusReads.length, 2)
})

test('créneau et plafond journalier', async () => {
  await connectGmail()
  setNow('2026-09-19T08:00:00Z') // samedi
  assert.equal((await call('outreach/send', { headers: ACCESS, body: sendBody('w@e.ch') })).status, 423)
  setNow(MONDAY_10H_ZURICH)
  for (const email of ['a1@x.ch', 'a2@x.ch', 'a3@x.ch']) {
    assert.equal((await call('outreach/send', { headers: ACCESS, body: sendBody(email) })).status, 200)
  }
  assert.equal((await call('outreach/send', { headers: ACCESS, body: sendBody('a4@x.ch') })).status, 429)
  assert.equal(world.gmailSent.length, 3)
})

// ─── Envoi et journalisation ──────────────────────────────────────────────────
test('envoi réussi : message Gmail, objet email HubSpot associé au contact', async () => {
  await connectGmail()
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 200)

  const [head, b64] = world.gmailSent[0].raw.split('\r\n\r\n')
  const text = Buffer.from(b64.replace(/\r\n/g, ''), 'base64').toString('utf8')
  const subject = Buffer.from(head.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)[1], 'base64').toString('utf8')
  assert.equal(subject, 'Dossiers de cession PME — critères')
  assert.ok(head.includes('From: Olivier Mazeron <olivier@seerius.ch>'))
  assert.ok(head.includes('To: claire@etude.ch'))
  assert.ok(text.includes('Texte accentué éàü.'))
  assert.ok(text.includes('https://scout.test/api/outreach/unsubscribe?e=claire%40etude.ch&t='))

  assert.equal(world.emailPosts.length, 1)
  const logged = world.emailPosts[0]
  assert.equal(logged.properties.hs_email_direction, 'EMAIL')
  assert.equal(logged.properties.hs_email_status, 'SENT')
  assert.equal(logged.properties.hs_email_subject, 'Dossiers de cession PME — critères')
  assert.equal(logged.properties.hs_timestamp, new RealDate(MONDAY_10H_ZURICH).getTime())
  assert.equal(logged.properties.hs_email_text, text)
  assert.deepEqual(JSON.parse(logged.properties.hs_email_headers).to, [{ email: 'claire@etude.ch' }])
  assert.deepEqual(logged.associations, [{ to: { id: 'p1' }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 198 }] }])

  const record = sendsRegistry()['claire@etude.ch']
  assert.equal(record.hubspotLogs.m1.state, 'logged')
  assert.equal(JSON.parse(hash('scout:scout_campaign').get('avocat:claire@etude.ch')), 'Contacté')
})

test('doublon : un contact déjà écrit n\'est pas relancé manuellement', async () => {
  await connectGmail()
  await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  const again = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(again.status, 409)
  assert.equal(world.gmailSent.length, 1)
})

test('journalisation en échec : l\'envoi reste valide, reprise idempotente', async () => {
  await connectGmail()
  world.emailLog = 'error'
  const r = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(r.status, 200)
  assert.equal(sendsRegistry()['claire@etude.ch'].hubspotLogs.m1.state, 'failed')

  world.emailLog = 'ok'
  await call('outreach/followups', { method: 'GET', headers: CRON })
  assert.equal(sendsRegistry()['claire@etude.ch'].hubspotLogs.m1.state, 'logged')
  assert.equal(world.emailPosts.length, 2)

  await call('outreach/followups', { method: 'GET', headers: CRON })
  assert.equal(world.emailPosts.length, 2, 'rejeu sans nouvelle écriture')
})

test('journalisation sans réponse de HubSpot : jamais rejouée (pas de doublon)', async () => {
  await connectGmail()
  world.emailLog = 'network'
  await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(sendsRegistry()['claire@etude.ch'].hubspotLogs.m1.state, 'uncertain')
  world.emailLog = 'ok'
  await call('outreach/followups', { method: 'GET', headers: CRON })
  assert.equal(world.emailPosts.length, 1)
})

// ─── Relances et désinscriptions ──────────────────────────────────────────────
test('relance J+7 dans le même fil, après une nouvelle vérification du statut', async () => {
  await connectGmail()
  await call('outreach/send', { headers: ACCESS, body: sendBody('marc@fidu.ch') })
  setNow('2026-09-22T08:00:00Z')
  const r = await call('outreach/followups', { method: 'GET', headers: CRON })
  assert.equal(r.payload.followedUp, 1)
  const followUp = world.gmailSent[1]
  assert.equal(followUp.threadId, 't1')
  assert.ok(followUp.raw.includes('In-Reply-To: <m1@mail.gmail.com>'))
  const record = sendsRegistry()['marc@fidu.ch']
  assert.equal(record.status, 'followed_up')
  assert.equal(record.hubspotLogs.m2.state, 'logged')
  const statusReads = world.calls.filter((c) => /statuses\/marc%40fidu\.ch\?channel=EMAIL/.test(c.url))
  assert.equal(statusReads.length, 2, 'statut relu avant la relance')
})

test('relance annulée si le statut d\'abonnement est indisponible', async () => {
  await connectGmail()
  await call('outreach/send', { headers: ACCESS, body: sendBody('marc@fidu.ch') })
  setNow('2026-09-22T08:00:00Z')
  world.statusFail = 'http'
  const r = await call('outreach/followups', { method: 'GET', headers: CRON })
  assert.equal(r.payload.followedUp, 0)
  assert.equal(r.payload.errors.length, 1)
  assert.equal(world.gmailSent.length, 1)
})

test('réponse « stop » : désinscription enregistrée dans HubSpot, relances arrêtées', async () => {
  await connectGmail()
  await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  world.threads.get('t1').push({ labelIds: ['INBOX'], from: 'Claire <claire@etude.ch>', snippet: 'Stop merci' })
  setNow('2026-09-22T08:00:00Z')
  const r = await call('outreach/followups', { method: 'GET', headers: CRON })
  assert.equal(r.payload.optedOut, 1)
  assert.equal(r.payload.followedUp, 0)
  assert.ok(world.unsubscribed.has('claire@etude.ch'))
  assert.equal(sendsRegistry()['claire@etude.ch'].status, 'optout')
})

test('réponse humaine : statut « répondu », pas de relance', async () => {
  await connectGmail()
  await call('outreach/send', { headers: ACCESS, body: sendBody('marc@fidu.ch') })
  world.threads.get('t1').push({ labelIds: ['INBOX'], from: 'Marc <marc@fidu.ch>', snippet: 'Volontiers, appelons-nous jeudi' })
  setNow('2026-09-22T08:00:00Z')
  const r = await call('outreach/followups', { method: 'GET', headers: CRON })
  assert.equal(r.payload.replied, 1)
  assert.equal(world.gmailSent.length, 1)
})

test('page de désinscription : lien signé, confirmation en deux temps', async () => {
  const { emailToken } = await import('../api/_lib/access.js')
  assert.equal((await call('outreach/unsubscribe', { method: 'GET', query: { e: 'new@x.ch', t: 'forged' } })).status, 400)

  const get = await call('outreach/unsubscribe', { method: 'GET', query: { e: 'new@x.ch', t: emailToken('new@x.ch') } })
  assert.equal(get.status, 200)
  assert.ok(get.payload.includes('Confirmer la désinscription'))
  assert.equal(outboundTo(HS).length, 0, 'aucune écriture à l\'ouverture du lien')

  const post = await call('outreach/unsubscribe', { method: 'POST', body: { e: 'new@x.ch', t: emailToken('new@x.ch') } })
  assert.equal(post.status, 200)
  assert.ok(world.unsubscribed.has('new@x.ch'))

  const xss = await call('outreach/unsubscribe', { method: 'GET', query: { e: '"><script>@x.ch', t: 'x' } })
  assert.ok(!String(xss.payload).includes('<script>'))
})

test('désinscription non enregistrée dans HubSpot : bloque l\'envoi puis se rattrape', async () => {
  const { emailToken } = await import('../api/_lib/access.js')
  await connectGmail()
  world.unsubscribeFail = true
  const post = await call('outreach/unsubscribe', { method: 'POST', body: { e: 'claire@etude.ch', t: emailToken('claire@etude.ch') } })
  assert.equal(post.status, 202)

  const send = await call('outreach/send', { headers: ACCESS, body: sendBody('claire@etude.ch') })
  assert.equal(send.status, 409)
  assert.equal(world.gmailSent.length, 0)

  world.unsubscribeFail = false
  const r = await call('outreach/followups', { method: 'GET', headers: CRON })
  assert.equal(r.payload.optOutsSynced, 1)
  assert.ok(world.unsubscribed.has('claire@etude.ch'))
})

// ─── Tâches HubSpot ───────────────────────────────────────────────────────────
const TASK_TEMPLATE = "Objet : Dossiers de cession PME\n\nMaître Bagnoud,\n\nTexte complet.\n\nOlivier Mazeron\nSeerius"

test('tâche valide : propriétaire, associations société + contact, corps HTML', async () => {
  const r = await call('hubspot-tasks', { body: { tasks: [
    { companyName: 'Étude Test SA', companyId: '447930233034', contactName: 'Valentine Bagnoud', contactId: '868662795469', template: TASK_TEMPLATE, subject: '✉️ Deal flow · Avocat' },
  ] } })
  assert.equal(r.status, 200)
  assert.equal(r.payload.created, 1)
  const [task] = world.tasks
  assert.equal(task.engagement.ownerId, 87370009)
  assert.deepEqual(task.associations.companyIds, [447930233034])
  assert.deepEqual(task.associations.contactIds, [868662795469])
  assert.ok(task.metadata.body.includes('<br>') && !task.metadata.body.includes('\n'))
})

test('tâche sans société ou contact non associé : lot refusé, rien n\'est créé', async () => {
  const noCompany = await call('hubspot-tasks', { body: { tasks: [{ companyName: 'Étude Test SA', template: TASK_TEMPLATE }] } })
  assert.equal(noCompany.status, 400)
  assert.ok(noCompany.payload.problems.some((p) => p.includes('société HubSpot non associée')))
  const noContact = await call('hubspot-tasks', { body: { tasks: [{ companyName: 'Étude Test SA', companyId: 'c1', contactName: 'Valentine Bagnoud', template: TASK_TEMPLATE }] } })
  assert.equal(noContact.status, 400)
  assert.ok(noContact.payload.problems.some((p) => p.includes('contact HubSpot non associé')))
  assert.equal(world.tasks.length, 0)
})

test('gabarit incomplet dans un lot : tout le lot est refusé, aucune tâche créée', async () => {
  const r = await call('hubspot-tasks', { body: { tasks: [
    { companyName: 'A', companyId: 'c1', template: TASK_TEMPLATE },
    { companyName: 'B', companyId: 'c2', template: "Objet : Test\n\n• Chiffre d'affaires : \n\n[Prénom Nom] — Seerius" },
  ] } })
  assert.equal(r.status, 400)
  assert.ok(r.payload.problems.some((p) => p.includes('critère sans valeur')))
  assert.ok(r.payload.problems.some((p) => p.includes('placeholder')))
  assert.equal(world.tasks.length, 0)
})

test('propriétaire introuvable ou illisible : échec explicite, aucune tâche non assignée', async () => {
  world.ownersFail = true
  const denied = await call('hubspot-tasks', { body: { tasks: [{ companyName: 'A', companyId: 'c1', template: TASK_TEMPLATE }] } })
  assert.equal(denied.status, 503)
  assert.equal(denied.payload.code, 'OWNER_LOOKUP_FAILED')

  world.ownersFail = false
  world.owners = []
  const missing = await call('hubspot-tasks', { body: { tasks: [{ companyName: 'A', companyId: 'c1', template: TASK_TEMPLATE }] } })
  assert.equal(missing.status, 503)
  assert.equal(missing.payload.code, 'OWNER_NOT_FOUND')
  assert.equal(world.tasks.length, 0)
})

test('envoi : email ou relance incomplets refusés avant tout appel', async () => {
  await connectGmail()
  const holey = sendBody('claire@etude.ch', { email: { subject: 'Test', body: "• Chiffre d'affaires : \n\nOlivier" } })
  const r = await call('outreach/send', { headers: ACCESS, body: holey })
  assert.equal(r.status, 400)
  assert.equal(r.payload.code, 'INCOMPLETE_EMAIL')
  const badFollowUp = sendBody('claire@etude.ch', { followUp: { subject: 'RE: Test', body: "(chiffre d'affaires , EBITDA rentable)" } })
  assert.equal((await call('outreach/send', { headers: ACCESS, body: badFollowUp })).status, 400)
  assert.equal(world.gmailSent.length, 0)
})

test('le registre des envois et des désinscriptions n\'est pas modifiable via /api/store', async () => {
  const r = await call('store', { body: { ops: [{ key: 'scout_outreach_optout', field: 'a@b.ch', value: null }] } })
  assert.equal(r.status, 400)
})
