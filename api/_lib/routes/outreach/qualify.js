// ─── Qualification d'une cible SWIFT → affaire HubSpot « Deal sourcing » ─────
// POST /api/outreach/qualify  (en-tête X-Scout-Access)
// Body : {
//   target:        { key, name, domain?, canton?, uid? },
//   contact:       { email, firstName, lastName, role } | null,   // dirigeant choisi
//   qualification: { priority?, signal?, estimate?, notes? }
// }
// → { deal: { key, dealId, companyId, contactId, created } }  |  { dryRun: true, preview }
//
// Idempotent par target.key : une cible déjà qualifiée renvoie son affaire
// (le dirigeant éventuellement ajouté ensuite y est associé). Pipeline, étape
// ou propriétaire introuvables → échec explicite, aucune affaire créée.

import { setCors, requireAccess } from '../../access.js'
import { reportConfig, isDryRun, logDryRun } from '../../config.js'
import {
  scoutKeyConfigured, upsertCompany, upsertContact, associateContactToCompany,
  createDeal, associateDealToContact, DEAL_PIPELINE_NAME, DEAL_STAGES,
} from '../../hubspot-scout.js'
import { hgetJSON, hsetJSON } from '../../redis.js'
import { DEALS_KEY, EMAIL_RE, normEmail } from '../../outreach.js'

reportConfig()

const KEY_RE = /^[a-z0-9][a-z0-9_-]{1,80}$/
const EXPLICIT_CODES = ['PIPELINE_NOT_FOUND', 'PIPELINE_LOOKUP_FAILED', 'OWNER_NOT_FOUND', 'OWNER_LOOKUP_FAILED', 'ASSOCIATION_LOOKUP_FAILED']

function describe({ priority, signal, estimate, notes } = {}) {
  return [
    priority && `Priorité : ${priority}`,
    signal && `Signal : ${signal}`,
    estimate && `Estimation : ${estimate}`,
    notes && `Notes : ${notes}`,
    'Source : SWIFT',
  ].filter(Boolean).join('\n')
}

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })
  if (!requireAccess(req, res)) return

  const { target, contact, qualification } = req.body ?? {}
  const key = String(target?.key ?? '').trim().toLowerCase()
  const name = String(target?.name ?? '').trim()
  if (!KEY_RE.test(key) || !name) return res.status(400).json({ error: 'Cible invalide : clé et nom de société requis' })
  const to = contact?.email ? normEmail(contact.email) : null
  if (to && !EMAIL_RE.test(to)) return res.status(400).json({ error: `Email du dirigeant invalide : ${contact.email}` })

  const dealname = `Sourcing — ${name}`
  const description = describe(qualification)

  if (isDryRun()) {
    const preview = {
      deal: { dealname, pipeline: DEAL_PIPELINE_NAME, stage: DEAL_STAGES.qualified, description },
      company: { name, domain: target.domain ?? null, canton: target.canton ?? null, uid: target.uid ?? null },
      contact: to ? { email: to, firstname: contact.firstName ?? '', lastname: contact.lastName ?? '', jobtitle: contact.role ?? '' } : null,
    }
    logDryRun('qualification', preview)
    return res.status(200).json({ dryRun: true, preview })
  }

  if (!scoutKeyConfigured()) return res.status(503).json({ error: 'Clé HubSpot SCOUT absente' })

  try {
    const existing = await hgetJSON(DEALS_KEY, key)

    const company = existing?.companyId
      ? { id: existing.companyId }
      : await upsertCompany({ name, domain: target.domain, canton: target.canton, uid: target.uid })
    if (!company.id) return res.status(502).json({ error: `Société HubSpot non créée : ${company.data?.message ?? 'erreur'}` })

    let contactId = existing?.contactId ?? null
    if (to && to !== existing?.contactEmail) {
      const hsContact = await upsertContact({
        email: to, firstname: contact.firstName ?? '', lastname: contact.lastName ?? '', jobtitle: contact.role ?? '', company: name,
      })
      if (!hsContact.id) return res.status(502).json({ error: `Contact HubSpot non créé : ${hsContact.data?.message ?? 'erreur'}` })
      contactId = hsContact.id
      await associateContactToCompany(hsContact.id, company.id)
      if (existing?.dealId) await associateDealToContact(existing.dealId, hsContact.id)
    }

    if (existing?.dealId) {
      const updated = { ...existing, contactId, contactEmail: to ?? existing.contactEmail ?? null, updatedAt: Date.now() }
      await hsetJSON(DEALS_KEY, key, updated)
      return res.status(200).json({ deal: { ...updated, created: false } })
    }

    const deal = await createDeal({ name: dealname, companyId: company.id, contactId, description })
    if (!deal.ok) return res.status(502).json({ error: `Transaction HubSpot non créée : ${deal.error}` })

    const entry = { key, name, dealId: deal.id, companyId: company.id, contactId, contactEmail: to, createdAt: Date.now() }
    await hsetJSON(DEALS_KEY, key, entry)
    return res.status(200).json({ deal: { ...entry, created: true } })
  } catch (err) {
    const status = EXPLICIT_CODES.includes(err.code) ? 503 : 502
    return res.status(status).json({ error: `Qualification non enregistrée : ${err.message}`, code: err.code })
  }
}
