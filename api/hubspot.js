// ─── Proxy serverless → HubSpot API ──────────────────────────────────────────
// Crée/met à jour des fiches Entreprise ET Contact dans HubSpot.
//
// Deux usages :
//   1. POST /api/hubspot { name, domain, canton, uid, segment }
//      → crée/met à jour une Company
//   2. POST /api/hubspot { name, domain, canton, uid, segment, _contact: { email, firstname, lastname, jobtitle } }
//      → crée/met à jour la Company + crée le Contact et l'associe
//
// Variables d'environnement :
//   HUBSPOT_TOKEN=pat-eu1-xxxxx   (Private App token)
//
// Scopes requis :
//   crm.objects.companies.read, crm.objects.companies.write
//   crm.objects.contacts.read,  crm.objects.contacts.write  (si _contact présent)

const SEGMENT_MAP = {
  banque_cantonale: "Banque cantonale",
  banque_affaires:  "Banque d'affaires",
  fiduciaire:       "Fiduciaire / Trust",
  avocat:           "Cabinet juridique / Notarial",
}

const HS = 'https://api.hubapi.com/crm/v3'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function upsertCompany(token, { name, domain, canton, uid, segment }) {
  const properties = {
    name,
    ...(domain  ? { domain }                               : {}),
    ...(canton  ? { state: canton, country: 'Switzerland' } : { country: 'Switzerland' }),
    ...(segment ? { segment: SEGMENT_MAP[segment] ?? segment } : {}),
    ...(uid     ? { description: `ZEFIX UID: ${uid}` }     : {}),
  }

  const r = await fetch(`${HS}/objects/companies`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties }),
  })
  const data = await r.json()

  // 409 = domaine déjà existant → on met à jour
  if (r.status === 409) {
    const existingId = data?.message?.match(/ID: (\d+)/)?.[1]
    if (existingId) {
      const p = await fetch(`${HS}/objects/companies/${existingId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties }),
      })
      return { action: 'updated', id: existingId, data: await p.json() }
    }
  }

  return { action: r.ok ? 'created' : 'error', id: data.id ?? null, data }
}

async function upsertContact(token, { email, firstname, lastname, jobtitle, company }) {
  const properties = {
    email,
    ...(firstname ? { firstname } : {}),
    ...(lastname  ? { lastname  } : {}),
    ...(jobtitle  ? { jobtitle  } : {}),
    ...(company   ? { company   } : {}),
  }

  const r = await fetch(`${HS}/objects/contacts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties }),
  })
  const data = await r.json()

  // 409 = email déjà existant → on met à jour
  if (r.status === 409) {
    const existingId = data?.message?.match(/ID: (\d+)/)?.[1]
    if (existingId) {
      const p = await fetch(`${HS}/objects/contacts/${existingId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties }),
      })
      return { action: 'updated', id: existingId, data: await p.json() }
    }
  }

  return { action: r.ok ? 'created' : 'error', id: data.id ?? null, data }
}

async function associateContactToCompany(token, contactId, companyId) {
  await fetch(
    `${HS}/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }
  )
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const token = process.env.HUBSPOT_TOKEN
  if (!token) return res.status(500).json({ error: 'HUBSPOT_TOKEN non configuré' })

  const { name, domain, canton, uid, segment, _contact } = req.body ?? {}
  if (!name) return res.status(400).json({ error: 'name requis' })

  try {
    // 1. Company
    const company = await upsertCompany(token, { name, domain, canton, uid, segment })

    // 2. Contact + association (si _contact fourni)
    if (_contact?.email) {
      const contact = await upsertContact(token, {
        ..._contact,
        company: _contact.company ?? name,
      })

      if (contact.id && company.id) {
        await associateContactToCompany(token, contact.id, company.id)
      }

      return res.status(200).json({ company, contact })
    }

    return res.status(company.action === 'created' ? 201 : 200).json({ company })
  } catch (err) {
    return res.status(502).json({ error: `HubSpot error: ${err.message}` })
  }
}
