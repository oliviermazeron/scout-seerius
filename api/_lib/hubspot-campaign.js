// ─── Traçabilité des campagnes SCOUT dans HubSpot ─────────────────────────────
// Propriétés de contact écrites : scout_campagne, scout_segment, scout_statut,
// scout_date_dernier_envoi, scout_etape_sequence, scout_campagnes_historique.
// Toutes les valeurs d'énumération (scout_segment, scout_statut) sont validées
// avant envoi : un mot hors liste est rejeté par l'API HubSpot.

import { hubspotRequest } from './hubspot-http.js'
import { checkSubscription, DEFAULT_AUDIENCE } from './hubspot-comms.js'

// Valeurs d'énumération HubSpot valides pour scout_segment
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

// Statuts qui bloquent tout nouveau contact automatique (règle 2)
const BLOCKING_STATUTS = new Set(['repondu', 'rdv_obtenu', 'exclu'])

// Propriétés lues lors de l'audit d'audience
const AUDIT_PROPS = ['email', 'scout_campagne', 'scout_statut', 'scout_date_dernier_envoi', 'scout_etape_sequence', 'scout_campagnes_historique']

function scoutKey() {
  const key = process.env.HUBSPOT_SCOUT_KEY || process.env.HUBSPOT_TOKEN
  if (!key) throw new Error('Clé HubSpot SCOUT absente (HUBSPOT_SCOUT_KEY)')
  return key
}

const request = (path, options) => hubspotRequest(scoutKey(), path, options)

// Minuit UTC au format YYYY-MM-DD (le portail est en Europe/Zurich, les dates
// sont stockées à minuit UTC : ne jamais envoyer un horodatage local)
const todayUTC = () => new Date().toISOString().slice(0, 10)

// ─── Écriture des propriétés de campagne sur un contact (par ID HubSpot) ─────
// Appelé immédiatement après l'envoi réussi. Ne bloque pas l'envoi en cas
// d'échec (l'email est parti) : l'appelant doit logger l'erreur.
export async function writeCampaignProps(contactId, { campaignId, segment, statut, etapeSequence }) {
  if (!contactId || !campaignId) return
  const hsSegment = SCOUT_SEGMENT_MAP[segment]
  const properties = {
    scout_campagne: campaignId,
    scout_statut: statut ?? 'envoye',
    scout_date_dernier_envoi: todayUTC(),
    scout_etape_sequence: String(etapeSequence ?? 1),
    ...(hsSegment ? { scout_segment: hsSegment } : {}),
  }
  const r = await request(`/crm/v3/objects/contacts/${contactId}`, { method: 'PATCH', body: { properties } })
  if (!r.ok) throw new Error(`writeCampaignProps: HTTP ${r.status} — ${r.data?.message ?? 'erreur'}`)
  return r.data
}

// ─── Historique : ajoute une ligne à scout_campagnes_historique ───────────────
// Lecture-puis-écriture : non atomique, acceptable (opération de traçabilité).
// Format : YYYY-MM-DD — <identifiant de campagne>, une ligne par campagne.
export async function appendCampaignHistory(contactId, campaignId) {
  if (!contactId || !campaignId) return false
  const today = todayUTC()
  const entry = `${today} — ${campaignId}`
  const r = await request(`/crm/v3/objects/contacts/${contactId}?properties=scout_campagnes_historique`)
  const existing = r.ok ? (r.data?.properties?.scout_campagnes_historique ?? '') : ''
  const lines = existing ? existing.split('\n').map((l) => l.trim()).filter(Boolean) : []
  if (lines.includes(entry)) return true // déjà enregistré
  const newValue = [...lines, entry].join('\n')
  const w = await request(`/crm/v3/objects/contacts/${contactId}`, {
    method: 'PATCH',
    body: { properties: { scout_campagnes_historique: newValue } },
  })
  return w.ok
}

// ─── Lecture HubSpot en batch (par email) ────────────────────────────────────
// POST /crm/v3/objects/contacts/batch/read avec idProperty: email.
// Retourne une Map email (minuscule) → contact HubSpot.
async function fetchContactsByEmail(emails) {
  const map = {}
  if (!emails.length) return map
  for (let i = 0; i < emails.length; i += 100) {
    const batch = emails.slice(i, i + 100)
    const r = await request('/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      body: {
        inputs: batch.map((e) => ({ id: e })),
        properties: AUDIT_PROPS,
        idProperty: 'email',
      },
    })
    if (r.ok) {
      for (const c of r.data.results ?? []) {
        const email = (c.properties?.email ?? '').toLowerCase().trim()
        if (email) map[email] = c
      }
    }
    // 429 : attendre avant de continuer (back-off exponentiel simplifié)
    if (r.status === 429) {
      const wait = parseInt(r.headers?.['retry-after'] ?? '10', 10) * 1000
      await new Promise((resolve) => setTimeout(resolve, wait))
      i -= 100 // rejouer le lot
    }
  }
  return map
}

// ─── Construction de l'audience avec les 5 règles d'exclusion ────────────────
// contacts : [{ email, segment, firstName, lastName, companyKey, companyName, role? }]
// Règles (dans l'ordre) :
//   1. Cooldown          — scout_date_dernier_envoi > aujourd'hui - cooldownDays
//   2. Statut bloquant   — scout_statut ∈ {repondu, rdv_obtenu, exclu}
//   3. Campagne active   — scout_campagne renseignée et ≠ campaignId courant
//   4. Désabonnement     — contacts existants : vérif. préférence HubSpot
//   5. Plafond société   — 1 contact max par companyKey par campagne
//
// Retourne { included, excluded } — chaque exclu porte reason et detail.
export async function buildAudience(contacts, { campaignId, cooldownDays = 90, audience = DEFAULT_AUDIENCE } = {}) {
  const emails = contacts.map((c) => (c.email ?? '').toLowerCase().trim()).filter(Boolean)
  const hsMap = await fetchContactsByEmail(emails)

  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000
  const cutoff = Date.now() - cooldownMs

  const stage1 = [] // passe les règles 1–3
  const excluded = []

  for (const contact of contacts) {
    const email = (contact.email ?? '').toLowerCase().trim()
    if (!email) {
      excluded.push({ ...contact, reason: 'email_absent', detail: 'Adresse email manquante' })
      continue
    }
    const hs = hsMap[email]
    if (hs) {
      const props = hs.properties ?? {}

      // Règle 1 : cooldown
      if (props.scout_date_dernier_envoi) {
        const lastSent = new Date(props.scout_date_dernier_envoi).getTime()
        if (lastSent > cutoff) {
          excluded.push({ ...contact, hubspotId: hs.id, reason: 'cooldown', detail: `Dernier envoi le ${props.scout_date_dernier_envoi} (moins de ${cooldownDays} jours)` })
          continue
        }
      }

      // Règle 2 : statut bloquant
      if (BLOCKING_STATUTS.has(props.scout_statut)) {
        excluded.push({ ...contact, hubspotId: hs.id, reason: 'statut_bloquant', detail: `Statut HubSpot : ${props.scout_statut}` })
        continue
      }

      // Règle 3 : campagne active différente
      if (props.scout_campagne && props.scout_campagne !== campaignId) {
        excluded.push({ ...contact, hubspotId: hs.id, reason: 'campagne_active', detail: `Campagne en cours : ${props.scout_campagne}` })
        continue
      }
    }

    stage1.push({ ...contact, email, hubspotId: hs?.id ?? null, hubspotProps: hs?.properties ?? null })
  }

  // Règle 4 : désabonnement (uniquement pour les contacts déjà dans HubSpot)
  const stage2 = []
  for (const contact of stage1) {
    if (contact.hubspotId) {
      try {
        const sub = await checkSubscription(contact.email, audience)
        if (sub.unsubscribed) {
          excluded.push({
            ...contact,
            reason: 'desinscrit',
            detail: sub.unsubscribedFromAll ? 'Désabonné de toutes communications' : 'Désabonné (Prospection Seerius — intermédiaires)',
          })
          continue
        }
      } catch (err) {
        // En cas d'erreur de l'API : inclure avec avertissement, pas d'exclusion silencieuse
        contact.subCheckWarning = err.message
      }
    }
    stage2.push(contact)
  }

  // Règle 5 : plafond par société (max 1 contact par companyKey)
  // En cas d'égalité de séniorité, hs_object_id croissant est déterministe.
  const byCompany = {}
  for (const contact of stage2) {
    const ck = contact.companyKey ?? null
    if (!ck) {
      // Pas de clé société connue : inclure sans contrainte
      continue
    }
    if (!byCompany[ck]) {
      byCompany[ck] = []
    }
    byCompany[ck].push(contact)
  }

  const included = []
  const companySelected = new Set()

  for (const contact of stage2) {
    const ck = contact.companyKey ?? null
    if (!ck) {
      included.push(contact)
      continue
    }
    if (companySelected.has(ck)) {
      excluded.push({ ...contact, reason: 'doublure_societe', detail: `Un contact a déjà été retenu pour ${contact.companyName ?? ck}` })
    } else {
      // Retenir le plus senior (heuristique sur le rôle) ou le premier (hs_object_id asc)
      const candidates = byCompany[ck]
      const best = pickSenior(candidates)
      if (best.email === contact.email) {
        companySelected.add(ck)
        included.push(contact)
      } else {
        excluded.push({ ...contact, reason: 'doublure_societe', detail: `${best.firstName ?? ''} ${best.lastName ?? ''} retenu pour ${contact.companyName ?? ck}` })
      }
    }
  }

  const stats = {
    included: included.length,
    excluded: excluded.length,
    byReason: excluded.reduce((acc, c) => { acc[c.reason] = (acc[c.reason] ?? 0) + 1; return acc }, {}),
  }

  return { included, excluded, stats }
}

// Heuristique de séniorité : associé/partner/directeur > manager > autre.
// En égalité, hs_object_id ascendant (plus petit = créé en premier).
function pickSenior(candidates) {
  const seniorityScore = (contact) => {
    const role = (contact.role ?? '').toLowerCase()
    if (/partner|associé|directeur|director|président|ceo|cfo|managing/i.test(role)) return 3
    if (/manager|responsable|head|chef/i.test(role)) return 2
    return 1
  }
  return candidates.reduce((best, c) => {
    const sb = seniorityScore(best)
    const sc = seniorityScore(c)
    if (sc > sb) return c
    if (sc === sb && c.hubspotId && best.hubspotId && Number(c.hubspotId) < Number(best.hubspotId)) return c
    return best
  })
}

// ─── Création du segment DYNAMIC HubSpot pour la campagne ────────────────────
// Le segment se peuple automatiquement à mesure que SCOUT écrit scout_campagne.
// Un échec de création n'est pas bloquant pour l'envoi.
export async function createCampaignList(campaignId) {
  const listName = `SCOUT — ${campaignId}`

  // Lire le segment de référence pour copier la structure exacte du filterBranch
  let refStructure = null
  try {
    const refEncoded = encodeURIComponent('SCOUT — Tous contacts touchés')
    const ref = await request(`/crm/v3/lists/object-type-id/0-1/name/${refEncoded}`)
    if (ref.ok && ref.data?.filterBranch) refStructure = ref.data.filterBranch
  } catch { /* non bloquant */ }

  const filterBranch = refStructure
    ? adaptRefFilter(refStructure, campaignId)
    : buildDefaultFilter(campaignId)

  const r = await request('/crm/v3/lists', {
    method: 'POST',
    body: { name: listName, objectTypeId: '0-1', processingType: 'DYNAMIC', filterBranch },
  })

  if (r.ok) return { ok: true, listId: r.data.listId ?? r.data.list?.listId, name: listName }
  // 409 = segment du même nom existe déjà : récupérer son ID
  if (r.status === 409) {
    try {
      const refEncoded = encodeURIComponent(listName)
      const existing = await request(`/crm/v3/lists/object-type-id/0-1/name/${refEncoded}`)
      if (existing.ok) return { ok: true, listId: existing.data.listId, name: listName, existing: true }
    } catch { /* ignore */ }
  }
  return { ok: false, error: r.data?.message ?? `HTTP ${r.status}`, name: listName }
}

// Réutilise la structure du segment de référence en substituant la valeur du filtre
function adaptRefFilter(refBranch, campaignId) {
  const adapted = JSON.parse(JSON.stringify(refBranch))
  function patchValues(node) {
    if (Array.isArray(node.filters)) {
      for (const f of node.filters) {
        if (f.property === 'scout_campagne' && f.operation?.values) {
          f.operation.values = [campaignId]
        }
      }
    }
    if (Array.isArray(node.filterBranches)) node.filterBranches.forEach(patchValues)
  }
  patchValues(adapted)
  return adapted
}

function buildDefaultFilter(campaignId) {
  return {
    filterBranchType: 'OR',
    filters: [],
    filterBranches: [{
      filterBranchType: 'AND',
      filterBranches: [],
      filters: [{
        filterType: 'PROPERTY',
        property: 'scout_campagne',
        operation: { operationType: 'MULTISTRING', operator: 'IS_EQUAL_TO', values: [campaignId] },
      }],
    }],
  }
}

// ─── Batch upsert contacts avec propriétés de campagne (lots de 100) ─────────
// inputs : [{ email, campaignId, segment, statut?, etapeSequence? }]
// Retourne : [{ batch, ok, count, error? }]
export async function batchUpsertCampaignContacts(inputs) {
  const results = []
  for (let i = 0; i < inputs.length; i += 100) {
    const batch = inputs.slice(i, i + 100)
    const r = await request('/crm/v3/objects/contacts/batch/upsert', {
      method: 'POST',
      body: {
        inputs: batch.map(({ email, campaignId, segment, statut, etapeSequence }) => {
          const hsSegment = SCOUT_SEGMENT_MAP[segment]
          return {
            idProperty: 'email',
            id: email,
            properties: {
              scout_campagne: campaignId,
              scout_statut: statut ?? 'envoye',
              scout_date_dernier_envoi: todayUTC(),
              scout_etape_sequence: String(etapeSequence ?? 1),
              ...(hsSegment ? { scout_segment: hsSegment } : {}),
            },
          }
        }),
      },
    })
    results.push({ batch: Math.floor(i / 100) + 1, ok: r.ok, count: batch.length, error: r.ok ? null : (r.data?.message ?? `HTTP ${r.status}`) })

    if (r.status === 429) {
      const wait = parseInt(r.headers?.['retry-after'] ?? '10', 10) * 1000
      await new Promise((resolve) => setTimeout(resolve, wait))
      i -= 100
    }
  }
  return results
}

export { SCOUT_SEGMENT_MAP }
