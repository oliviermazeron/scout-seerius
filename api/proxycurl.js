// ─── Proxy serverless → NinjaPear API (ex-Proxycurl) ─────────────────────────
// Stratégie en 3 niveaux :
//   1. NinjaPear par domaine + rôles élargis (titres suisses inclus)
//   2. NinjaPear par nom de société si domaine peu connu
//   3. Fallback Brave Search → profils LinkedIn publics
//
// POST /api/proxycurl { "domain": "bcv.ch", "companyName": "BCV" }

const BASE = 'https://nubela.co/api/v1'

// Rôles élargis — inclut titres suisses courants
const ROLES = [
  'CEO', 'CFO', 'CIO', 'COO', 'CTO',
  'director', 'managing director', 'executive director',
  'partner', 'associate partner', 'senior partner',
  'president', 'vice president',
  'head', 'manager', 'senior manager',
  'founder', 'co-founder',
  'gérant', 'directeur', 'associé',
]

// On prend les 6 rôles les plus susceptibles de donner des décideurs
const ROLES_PRIORITY = ROLES.slice(0, 6)

async function searchNinjaPear(apiKey, params) {
  const url = new URL(`${BASE}/employee/search`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!r.ok) return []
  const data = await r.json()
  return data?.employees ?? []
}

async function fallbackBrave(apiKey, companyName, domain) {
  if (!apiKey) return []
  const query = `"${companyName}" linkedin directeur CEO associé gérant site:linkedin.com/in`
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', '5')
  url.searchParams.set('country', 'ch')

  const r = await fetch(url, {
    headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
  })
  if (!r.ok) return []
  const data = await r.json()

  return (data?.web?.results ?? [])
    .filter(res => res.url.includes('linkedin.com/in/'))
    .map(res => {
      // Extraire prénom/nom du titre LinkedIn : "Prénom Nom - Titre | LinkedIn"
      const titleMatch = res.title.match(/^([A-ZÀ-Ü][a-zà-ü]+)\s+([A-ZÀ-Ü][A-Za-zà-üÀ-Ü\-']+)/)
      const roleMatch = res.title.match(/[-–]\s*([^|]+)/)
      return {
        firstName:  titleMatch?.[1] ?? '',
        lastName:   titleMatch?.[2] ?? '',
        role:       roleMatch?.[1]?.trim() ?? '',
        domain,
        profileUrl: res.url,
        source:     'brave',
      }
    })
    .filter(e => e.firstName && e.lastName)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const apiKey      = process.env.NINJAPEAR_API_KEY
  const braveKey    = process.env.BRAVE_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'NINJAPEAR_API_KEY non configurée' })

  const { domain, companyName } = req.body ?? {}
  if (!domain && !companyName) return res.status(400).json({ error: 'domain ou companyName requis' })

  try {
    const seen = new Set()
    const employees = []

    function addEmployee(e, source = 'ninjapear') {
      const key = `${e.first_name ?? e.firstName}|${e.last_name ?? e.lastName}`
      if (seen.has(key)) return
      seen.add(key)
      employees.push({
        firstName:  e.first_name  ?? e.firstName  ?? '',
        lastName:   e.last_name   ?? e.lastName   ?? '',
        role:       e.role        ?? '',
        domain:     e.company_website ?? e.domain ?? domain,
        profileUrl: e.person_profile  ?? e.profileUrl ?? null,
        emailUrl:   e.work_email      ?? null,
        source,
      })
    }

    // ── Niveau 1 : NinjaPear par domaine + rôles élargis ──────────────────────
    if (domain) {
      await Promise.allSettled(
        ROLES_PRIORITY.map(async (role) => {
          const results = await searchNinjaPear(apiKey, {
            company_website: domain,
            role,
            page_size: '5',
          })
          results.forEach(e => addEmployee(e, 'ninjapear'))
        })
      )
    }

    // ── Niveau 2 : NinjaPear par nom de société (si peu de résultats) ─────────
    if (employees.length < 3 && companyName) {
      await Promise.allSettled(
        ['CEO', 'director', 'partner', 'founder'].map(async (role) => {
          const results = await searchNinjaPear(apiKey, {
            company_name: companyName,
            role,
            page_size: '5',
          })
          results.forEach(e => addEmployee(e, 'ninjapear-name'))
        })
      )
    }

    // ── Niveau 3 : Fallback Brave Search LinkedIn ──────────────────────────────
    if (employees.length === 0 && companyName && braveKey) {
      const braveResults = await fallbackBrave(braveKey, companyName, domain)
      braveResults.forEach(e => addEmployee(e, 'brave'))
    }

    return res.status(200).json({
      domain,
      total: employees.length,
      employees,
      sources: [...new Set(employees.map(e => e.source))],
    })
  } catch (err) {
    return res.status(502).json({ error: `NinjaPear error: ${err.message}` })
  }
}
