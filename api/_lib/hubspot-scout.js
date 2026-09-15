// ─── Client HubSpot « SCOUT » — sourcing et journalisation des emails ────────
// Identité : clé de service « SCOUT » (HUBSPOT_SCOUT_KEY, ou HUBSPOT_TOKEN).
// Portées : crm.objects.contacts.read/write, crm.objects.companies.read/write,
//           sales-email-read.
// Usage autorisé : créer / mettre à jour contacts et sociétés, créer l'objet
// email et l'associer au contact. Jamais de préférences de communication ici
// (voir hubspot-comms.js).

import { hubspotRequest } from './hubspot-http.js'

const SEGMENT_MAP = {
  banque_cantonale: "Banque cantonale",
  banque_affaires:  "Banque d'affaires",
  fiduciaire:       "Fiduciaire / Trust",
  avocat:           "Cabinet juridique / Notarial",
}

export const scoutKeyConfigured = () => !!(process.env.HUBSPOT_SCOUT_KEY || process.env.HUBSPOT_TOKEN)

function scoutKey() {
  const key = process.env.HUBSPOT_SCOUT_KEY || process.env.HUBSPOT_TOKEN
  if (!key) throw new Error('Clé HubSpot SCOUT absente (HUBSPOT_SCOUT_KEY)')
  return key
}

const request = (path, options) => hubspotRequest(scoutKey(), path, options)

// ─── Sociétés & contacts ──────────────────────────────────────────────────────
export async function upsertCompany({ name, domain, canton, uid, segment }) {
  const properties = {
    name,
    ...(domain  ? { domain }                               : {}),
    ...(canton  ? { state: canton, country: 'Switzerland' } : { country: 'Switzerland' }),
    ...(segment ? { segment: SEGMENT_MAP[segment] ?? segment } : {}),
    ...(uid     ? { description: `ZEFIX UID: ${uid}` }     : {}),
  }

  const r = await request('/crm/v3/objects/companies', { method: 'POST', body: { properties } })

  // 409 = domaine déjà existant → on met à jour
  if (r.status === 409) {
    const existingId = r.data?.message?.match(/ID: (\d+)/)?.[1]
    if (existingId) {
      const p = await request(`/crm/v3/objects/companies/${existingId}`, { method: 'PATCH', body: { properties } })
      return { action: 'updated', id: existingId, data: p.data }
    }
  }

  return { action: r.ok ? 'created' : 'error', id: r.data.id ?? null, data: r.data }
}

export async function upsertContact({ email, firstname, lastname, jobtitle, company }) {
  const properties = {
    email,
    ...(firstname ? { firstname } : {}),
    ...(lastname  ? { lastname  } : {}),
    ...(jobtitle  ? { jobtitle  } : {}),
    ...(company   ? { company   } : {}),
  }

  const r = await request('/crm/v3/objects/contacts', { method: 'POST', body: { properties } })

  // 409 = email déjà existant → on met à jour
  if (r.status === 409) {
    const existingId = r.data?.message?.match(/ID: (\d+)/)?.[1]
    if (existingId) {
      const p = await request(`/crm/v3/objects/contacts/${existingId}`, { method: 'PATCH', body: { properties } })
      return { action: 'updated', id: existingId, data: p.data }
    }
  }

  return { action: r.ok ? 'created' : 'error', id: r.data.id ?? null, data: r.data }
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
export function emailPayload({ contactId, subject, text, from, to, timestamp, associationTypeId }) {
  return {
    properties: {
      hs_timestamp: timestamp,
      hs_email_direction: 'EMAIL',
      hs_email_status: 'SENT',
      hs_email_subject: subject,
      hs_email_text: text,
      hs_email_headers: JSON.stringify({ from: { email: from }, to: [{ email: to }], cc: [], bcc: [] }),
    },
    associations: [{
      to: { id: String(contactId) },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId }],
    }],
  }
}

export async function logEmail(email) {
  const associationTypeId = await emailToContactType()
  const r = await request('/crm/v3/objects/emails', { method: 'POST', body: emailPayload({ ...email, associationTypeId }) })
  return r.ok ? { ok: true, id: r.data.id } : { ok: false, error: r.data.message ?? `HTTP ${r.status}` }
}
