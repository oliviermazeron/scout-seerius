// ─── Proxy serverless → NinjaPear API (ex-Proxycurl) ─────────────────────────
// Cherche des employés par domaine + rôle via NinjaPear.
//
// POST /api/proxycurl { "domain": "bcv.ch", "roles": ["director","partner","manager"] }
// → retourne les employés trouvés avec nom, rôle, profil, email pro
//
// Variables d'environnement :
//   NINJAPEAR_API_KEY=xxxxxxxx

const ROLES_DEFAULT = ['director', 'partner', 'manager', 'head', 'associate', 'president']
const BASE = 'https://nubela.co/api/v1'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const apiKey = process.env.NINJAPEAR_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'NINJAPEAR_API_KEY non configurée' })

  const { domain, roles = ROLES_DEFAULT } = req.body ?? {}
  if (!domain) return res.status(400).json({ error: 'domain requis' })

  try {
    // Chercher pour chaque rôle et dédupliquer
    const seen = new Set()
    const employees = []

    await Promise.allSettled(
      roles.slice(0, 4).map(async (role) => {
        const url = new URL(`${BASE}/employee/search`)
        url.searchParams.set('company_website', domain)
        url.searchParams.set('role', role)
        url.searchParams.set('page_size', '5')

        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` }
        })
        if (!r.ok) return

        const data = await r.json()
        for (const e of data?.employees ?? []) {
          const key = `${e.first_name}|${e.last_name}`
          if (seen.has(key)) continue
          seen.add(key)
          employees.push({
            firstName:    e.first_name,
            lastName:     e.last_name,
            role:         e.role,
            domain:       e.company_website,
            profileUrl:   e.person_profile,
            emailUrl:     e.work_email,
            companyUrl:   e.company_details,
          })
        }
      })
    )

    return res.status(200).json({ domain, total: employees.length, employees })
  } catch (err) {
    return res.status(502).json({ error: `NinjaPear error: ${err.message}` })
  }
}
