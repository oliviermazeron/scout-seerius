// ─── Client HubSpot « SCOUT » — sourcing et journalisation des emails ────────
// Identité : clé de service « SCOUT » (HUBSPOT_SCOUT_KEY, ou HUBSPOT_TOKEN).
// Portées : crm.objects.contacts.read/write, crm.objects.companies.read/write,
//           crm.lists.read/write, sales-email-read.
// Usage autorisé : créer / mettre à jour contacts et sociétés, créer l'objet
// email et l'associer au contact. Jamais de préférences de communication ici
// (voir hubspot-comms.js).

import { hubspotRequest } from './hubspot-http.js'
import { redisOne } from './redis.js'

const HS_LEAD_STATUS_MAP = {
  a_contacter: 'NEW',
  envoye:      'ATTEMPTED_TO_CONTACT',
  relance:     'ATTEMPTED_TO_CONTACT',
  repondu:     'CONNECTED',
  rdv_obtenu:  'OPEN_DEAL',
  exclu:       'UNQUALIFIED',
}

const SEGMENT_MAP = {
  banque_cantonale: "Banque cantonale",
  banque_affaires:  "Banque d'affaires",
  fiduciaire:       "Fiduciaire / Trust",
  avocat:           "Cabinet juridique / Notarial",
}

// Valeurs internes HubSpot pour scout_segment (portail 147633255)
const SCOUT_SEGMENT_MAP = {
  avocat:              'cabinet_avocats',
  notaire:             'cabinet_avocats',
  conseil_fiscal:      'cabinet_avocats',
  fiduciaire:          'fiduciaire',
  banque_privee:       'banquier_prive',
  banque_cantonale:    'banque_cantonale',
  banque_affaires:     'banque_affaires',
  gestionnaire_fortune: 'banquier_prive',
  asset_manager:       'banquier_prive',
  family_office:       'banquier_prive',
  multi_family_office: 'banquier_prive',
}

// Domaines mutualisés : pas de société créée pour ces adresses
const SHARED_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'bluewin.ch', 'hotmail.com', 'hotmail.fr',
  'live.com', 'live.fr', 'outlook.com', 'protonmail.com', 'proton.me',
  'yahoo.fr', 'yahoo.com', 'icloud.com', 'me.com',
])

// Minuit UTC en millisecondes — HubSpot exige un epoch ms pour les champs de type date
const todayUTC = () => {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export const scoutKeyConfigured = () => !!(process.env.HUBSPOT_SCOUT_KEY || process.env.HUBSPOT_TOKEN)

function scoutKey() {
  const key = process.env.HUBSPOT_SCOUT_KEY || process.env.HUBSPOT_TOKEN
  if (!key) throw new Error('Clé HubSpot SCOUT absente (HUBSPOT_SCOUT_KEY)')
  return key
}

const request = (path, options) => hubspotRequest(scoutKey(), path, options)

// ─── Sociétés & contacts ──────────────────────────────────────────────────────

// Recherche par domaine avant création pour éviter les doublons.
// Domaines mutualisés (gmail.com, bluewin.ch…) : pas de société créée.
// En cas de résultats multiples, la fiche la plus ancienne (createdate asc) est retenue.
export async function upsertCompany({ name, domain, canton, uid, segment }) {
  const properties = {
    name,
    ...(domain  ? { domain }                                : {}),
    ...(canton  ? { state: canton, country: 'Switzerland' } : { country: 'Switzerland' }),
    ...(segment ? { segment: SEGMENT_MAP[segment] ?? segment } : {}),
    ...(uid     ? { description: `ZEFIX UID: ${uid}` }      : {}),
  }

  const normalDomain = domain?.toLowerCase().trim()

  // Domaine mutualisé : ne pas chercher ni créer de société
  if (normalDomain && SHARED_DOMAINS.has(normalDomain)) {
    return { action: 'skipped', id: null }
  }

  // Rechercher d'abord par domaine (évite la création de doublons)
  if (normalDomain) {
    const search = await request('/crm/v3/objects/companies/search', {
      method: 'POST',
      body: {
        filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: normalDomain }] }],
        properties: ['name', 'domain'],
        sorts: [{ propertyName: 'createdate', direction: 'ASCENDING' }],
        limit: 1,
      },
    })
    if (search.ok && (search.data?.total ?? 0) > 0) {
      const existingId = search.data.results[0].id
      await request(`/crm/v3/objects/companies/${existingId}`, { method: 'PATCH', body: { properties } })
      return { action: 'updated', id: existingId }
    }
  }

  // Aucune fiche trouvée : créer
  const r = await request('/crm/v3/objects/companies', { method: 'POST', body: { properties } })
  // 409 = race condition (deux requêtes parallèles) → récupérer l'ID dans le message
  if (r.status === 409) {
    const existingId = r.data?.message?.match(/ID: (\d+)/)?.[1]
    if (existingId) {
      await request(`/crm/v3/objects/companies/${existingId}`, { method: 'PATCH', body: { properties } })
      return { action: 'updated', id: existingId }
    }
  }
  return { action: r.ok ? 'created' : 'error', id: r.data?.id ?? null, data: r.data }
}

// Upsert par email (batch/upsert idProperty=email) — jamais de POST aveugle.
// Les propriétés scout_* sont incluses directement si campaignId est fourni,
// évitant un PATCH séparé. scout_campagnes_historique reste en append séparé.
export async function upsertContact({ email, firstname, lastname, jobtitle, company,
  campaignId, segment, statut, etapeSequence, ownerId }) {
  const normalEmail = email.toLowerCase().trim()
  const hsSegment = campaignId && segment ? SCOUT_SEGMENT_MAP[segment] : undefined
  const hsLeadStatus = statut ? HS_LEAD_STATUS_MAP[statut] : undefined
  const properties = {
    email: normalEmail,
    ...(firstname     ? { firstname }                       : {}),
    ...(lastname      ? { lastname  }                       : {}),
    ...(jobtitle      ? { jobtitle  }                       : {}),
    ...(company       ? { company   }                       : {}),
    ...(hsLeadStatus  ? { hs_lead_status: hsLeadStatus }    : {}),
    ...(campaignId ? {
      scout_campagne:           campaignId,
      scout_statut:             statut ?? 'envoye',
      scout_date_dernier_envoi: todayUTC(),
      scout_etape_sequence:     etapeSequence ?? 1,
      ...(hsSegment ? { scout_segment: hsSegment } : {}),
    } : {}),
  }
  const r = await request('/crm/v3/objects/contacts/batch/upsert', {
    method: 'POST',
    body: { inputs: [{ idProperty: 'email', id: normalEmail, properties }] },
  })
  if (!r.ok) {
    console.error(`[SCOUT] upsertContact HTTP ${r.status} email=${normalEmail} — ${JSON.stringify(r.data)}`)
    throw new Error(`upsertContact: HTTP ${r.status} — ${r.data?.message ?? 'erreur'}`)
  }
  const result = r.data?.results?.[0]
  const contactId = result?.id ?? null

  // Attribuer le propriétaire seulement si la fiche n'en a pas déjà un —
  // évite d'écraser un propriétaire posé manuellement entre deux campagnes.
  if (contactId && ownerId) {
    try {
      const g = await request(`/crm/v3/objects/contacts/${contactId}?properties=hubspot_owner_id`)
      if (g.ok && !g.data?.properties?.hubspot_owner_id) {
        await request(`/crm/v3/objects/contacts/${contactId}`, {
          method: 'PATCH',
          body: { properties: { hubspot_owner_id: String(ownerId) } },
        })
      }
    } catch (err) {
      console.warn(`[SCOUT] hubspot_owner_id non posé sur ${normalEmail} : ${err.message}`)
    }
  }

  return { action: result ? 'upserted' : 'error', id: contactId, data: result }
}

export async function associateContactToCompany(contactId, companyId) {
  await request(`/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`, { method: 'PUT' })
}

// ─── Journalisation des emails envoyés ────────────────────────────────────────
let emailToContactTypeId = null

// Type d'association email → contact, lu dynamiquement (jamais en dur).
// Doc : https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide
async function emailToContactType() {
  if (emailToContactTypeId) return emailToContactTypeId
  const r = await request('/crm/associations/2026-09/email/contact/labels')
  const type = r.ok ? (r.data.results ?? []).find((t) => t.category === 'HUBSPOT_DEFINED') : null
  if (!type) throw new Error(`Type d'association email → contact introuvable (HTTP ${r.status})`)
  emailToContactTypeId = type.typeId
  return emailToContactTypeId
}

// Crée l'objet email sur la fiche du contact.
// Doc : https://developers.hubspot.com/docs/api-reference/crm/objects/emails
// Propriétés : hs_timestamp (seule obligatoire, epoch ms UTC), hs_email_direction
// EMAIL (envoyé), hs_email_status SENT, hs_email_subject, hs_email_text,
// hs_email_headers (JSON sérialisé from / to).
// → { ok: true, id } | { ok: false, error } ; lève err.uncertain si HubSpot n'a
//   pas répondu (l'email a peut-être été créé : ne pas rejouer automatiquement).
export function emailPayload({ contactId, subject, text, html, from, to, timestamp, associationTypeId }) {
  return {
    properties: {
      hs_timestamp: timestamp,
      hs_email_direction: 'EMAIL',
      hs_email_status: 'SENT',
      hs_email_subject: subject,
      hs_email_text: text,
      ...(html ? { hs_email_html: html } : {}),
      hs_email_headers: JSON.stringify({ from: { email: from }, to: [{ email: to }], cc: [], bcc: [] }),
    },
    associations: [{
      to: { id: String(contactId) },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId }],
    }],
  }
}

// ─── Tâches (API Engagements v1, héritée) ─────────────────────────────────────
let taskOwnerIdCache = null
const DAY_MS = 24 * 60 * 60 * 1000

export function clearScoutCache() {
  taskOwnerIdCache = null
  emailToContactTypeId = null
  dealPipelineCache = null
  associationTypeCache.clear()
}

// ─── Affaires : pipeline « Deal sourcing » (cibles SWIFT) ─────────────────────
// Pipeline et étapes lus par leur libellé exact ; introuvables → échec explicite.
export const DEAL_PIPELINE_NAME = 'Deal sourcing'
export const DEAL_STAGES = { qualified: 'Qualifiée', contacted: 'Contactée', conversation: 'Échange en cours' }
const AUTO_STAGE_ORDER = ['qualified', 'contacted', 'conversation']

const normalizeLabel = (label) => String(label ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

let dealPipelineCache = null
const associationTypeCache = new Map() // "from/to" → typeId

// Type d'association HubSpot (non libellé de préférence), lu dynamiquement.
// Doc : https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide
async function associationTypeId(from, to) {
  const cacheKey = `${from}/${to}`
  if (associationTypeCache.has(cacheKey)) return associationTypeCache.get(cacheKey)
  const r = await request(`/crm/associations/2026-09/${from}/${to}/labels`)
  const defined = r.ok ? (r.data.results ?? []).filter((t) => t.category === 'HUBSPOT_DEFINED') : []
  const type = defined.find((t) => t.label == null) ?? defined[0]
  if (!type) throw Object.assign(new Error(`Type d'association ${from} → ${to} introuvable (HTTP ${r.status})`), { code: 'ASSOCIATION_LOOKUP_FAILED' })
  associationTypeCache.set(cacheKey, type.typeId)
  return type.typeId
}

// Doc : https://developers.hubspot.com/docs/api-reference/latest/crm/pipelines/guide
export async function dealPipeline() {
  if (dealPipelineCache) return dealPipelineCache
  const r = await request('/crm/v3/pipelines/deals')
  if (!r.ok) {
    throw Object.assign(
      new Error(`Pipelines de transactions HubSpot illisibles (HTTP ${r.status}${r.data?.message ? ` : ${r.data.message}` : ''})`),
      { code: 'PIPELINE_LOOKUP_FAILED' },
    )
  }
  const pipelines = (r.data.results ?? []).filter((p) => !p.archived && normalizeLabel(p.label) === normalizeLabel(DEAL_PIPELINE_NAME))
  if (pipelines.length !== 1) {
    throw Object.assign(new Error(pipelines.length
      ? `Plusieurs pipelines « ${DEAL_PIPELINE_NAME} » dans HubSpot : ambigu`
      : `Pipeline « ${DEAL_PIPELINE_NAME} » introuvable dans HubSpot`), { code: 'PIPELINE_NOT_FOUND' })
  }
  const stages = {}
  for (const [stageKey, label] of Object.entries(DEAL_STAGES)) {
    const found = (pipelines[0].stages ?? []).filter((s) => !s.archived && normalizeLabel(s.label) === normalizeLabel(label))
    if (found.length !== 1) {
      throw Object.assign(new Error(`Étape « ${label} » introuvable ou en double dans le pipeline « ${DEAL_PIPELINE_NAME} »`), { code: 'PIPELINE_NOT_FOUND' })
    }
    stages[stageKey] = found[0].id
  }
  dealPipelineCache = { id: pipelines[0].id, stages }
  return dealPipelineCache
}

// Crée l'affaire à l'étape « Qualifiée », assignée, associée à la société (et au contact).
// Doc : https://developers.hubspot.com/docs/api-reference/latest/crm/objects/deals/guide
export async function createDeal({ name, companyId, contactId, description }) {
  const [pipeline, ownerId] = await Promise.all([dealPipeline(), taskOwnerId()])
  const associations = []
  for (const [id, objectType] of [[companyId, 'company'], [contactId, 'contact']]) {
    if (!id) continue
    associations.push({
      to: { id: String(id) },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: await associationTypeId('deal', objectType) }],
    })
  }
  const r = await request('/crm/v3/objects/deals', {
    method: 'POST',
    body: {
      properties: {
        dealname: name,
        pipeline: pipeline.id,
        dealstage: pipeline.stages.qualified,
        hubspot_owner_id: String(ownerId),
        ...(description ? { description } : {}),
      },
      associations,
    },
  })
  return r.ok ? { ok: true, id: r.data.id } : { ok: false, error: r.data?.message ?? `HTTP ${r.status}` }
}

export async function associateDealToContact(dealId, contactId) {
  const typeId = await associationTypeId('deal', 'contact')
  const r = await request(`/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`, {
    method: 'PUT',
    body: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId }],
  })
  return { ok: r.ok }
}

// Avance l'affaire automatiquement (Qualifiée → Contactée → Échange en cours),
// sans jamais la faire reculer ni toucher une affaire déplacée à la main ailleurs.
export async function moveDealToStage(dealId, stageKey) {
  const pipeline = await dealPipeline()
  const r = await request(`/crm/v3/objects/deals/${dealId}?properties=dealstage,pipeline`)
  if (!r.ok) return { ok: false, error: `Transaction illisible (HTTP ${r.status})` }
  const currentKey = AUTO_STAGE_ORDER.find((k) => pipeline.stages[k] === r.data.properties?.dealstage)
  if (r.data.properties?.pipeline !== pipeline.id || !currentKey) return { ok: true, skipped: 'étape modifiée manuellement' }
  if (AUTO_STAGE_ORDER.indexOf(currentKey) >= AUTO_STAGE_ORDER.indexOf(stageKey)) return { ok: true, skipped: 'déjà à cette étape ou plus loin' }
  const u = await request(`/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    body: { properties: { dealstage: pipeline.stages[stageKey] } },
  })
  return u.ok ? { ok: true, moved: stageKey } : { ok: false, error: u.data?.message ?? `HTTP ${u.status}` }
}

// Propriétaire des tâches : lu via l'API owners, mis en cache en mémoire.
// Portée requise : crm.objects.owners.read. Introuvable → échec explicite,
// jamais de tâche non assignée.
// Doc : https://developers.hubspot.com/docs/api-reference/latest/crm/owners/get-owners
export async function taskOwnerId() {
  if (taskOwnerIdCache) return taskOwnerIdCache
  const email = String(process.env.HUBSPOT_TASK_OWNER_EMAIL || 'olivier@seerius.ch').trim().toLowerCase()
  const r = await request(`/crm/v3/owners?email=${encodeURIComponent(email)}&limit=1`)
  if (!r.ok) {
    throw Object.assign(
      new Error(`Propriétaire HubSpot illisible pour ${email} (HTTP ${r.status}${r.data?.message ? ` : ${r.data.message}` : ''})`),
      { code: 'OWNER_LOOKUP_FAILED' },
    )
  }
  const owner = (r.data.results ?? []).find((o) => String(o.email ?? '').toLowerCase() === email && !o.archived)
  if (!owner) throw Object.assign(new Error(`Propriétaire HubSpot introuvable pour ${email}`), { code: 'OWNER_NOT_FOUND' })
  taskOwnerIdCache = owner.id
  return taskOwnerIdCache
}

// Résout l'ownerId HubSpot depuis l'adresse Gmail de l'expéditeur.
// Mis en cache dans Redis (TTL 4h) : l'ownerId ne change pas entre deux envois.
// En cas d'échec : console.warn + retourne null (l'envoi continue sans propriétaire).
export async function resolveOwnerId(gmailEmail) {
  if (!gmailEmail) return null
  const email = gmailEmail.toLowerCase().trim()
  const cacheKey = `scout:owner:${email}`
  try {
    const cached = await redisOne('GET', cacheKey)
    if (cached) return cached
  } catch {}
  const r = await request(`/crm/v3/owners?email=${encodeURIComponent(email)}&limit=1`)
  if (!r.ok) {
    console.warn(`[SCOUT] resolveOwnerId ${email} : HTTP ${r.status} — ${JSON.stringify(r.data)}`)
    return null
  }
  const owner = (r.data.results ?? []).find((o) => String(o.email ?? '').toLowerCase() === email && !o.archived)
  if (!owner) {
    console.warn(`[SCOUT] resolveOwnerId : aucun owner HubSpot pour ${email}`)
    return null
  }
  try { await redisOne('SET', cacheKey, String(owner.id), 'EX', 4 * 3600) } catch {}
  return String(owner.id)
}

// Le corps de tâche HubSpot est du HTML : un seul chemin de formatage pour tous les gabarits
function textToHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

// Crée une tâche email assignée et associée (société obligatoire, contact si fourni).
// Doc : https://developers.hubspot.com/docs/api-reference/legacy/crm-engagements-v1/post-engagements-v1-engagements
export async function createTask({ subject, template, companyId, contactId, ownerId, dueInDays = 2 }) {
  const r = await request('/engagements/v1/engagements', {
    method: 'POST',
    body: {
      engagement: {
        active: true,
        type: 'TASK',
        ownerId: Number(ownerId),
        timestamp: Date.now() + Number(dueInDays) * DAY_MS,
      },
      associations: {
        companyIds: [Number(companyId)],
        contactIds: contactId ? [Number(contactId)] : [],
        dealIds: [],
        ownerIds: [],
        ticketIds: [],
      },
      metadata: {
        subject,
        body: textToHtml(template),
        status: 'NOT_STARTED',
        taskType: 'EMAIL',
        priority: 'MEDIUM',
      },
    },
  })
  return r.ok ? { ok: true, taskId: r.data?.engagement?.id } : { ok: false, error: r.data?.message ?? `HTTP ${r.status}` }
}

// Marque le contact « Do not email » dans HubSpot (propriété hs_email_optout).
// Identifie le contact par son adresse email (idProperty=email).
// Un 404 signifie que le contact n'existe pas encore : on ne crée pas, on passe.
export async function markDoNotEmail(email) {
  const r = await request(
    `/crm/v3/objects/contacts/${encodeURIComponent(String(email).trim().toLowerCase())}?idProperty=email`,
    { method: 'PATCH', body: { properties: { hs_email_optout: true } } },
  )
  if (!r.ok && r.status !== 404) {
    console.warn(`[SCOUT] markDoNotEmail ${email} : HTTP ${r.status} — ${r.data?.message ?? 'erreur'}`)
  }
  return r.ok
}

// email : { contactId, subject, text, html?, from, to, timestamp }
export async function logEmail(email) {
  const associationTypeId = await emailToContactType()
  const r = await request('/crm/v3/objects/emails', { method: 'POST', body: emailPayload({ ...email, associationTypeId }) })
  return r.ok ? { ok: true, id: r.data.id } : { ok: false, error: r.data.message ?? `HTTP ${r.status}` }
}
