// ─── Proxy serverless → Brave Search : recherche de sociétés par catégorie ────
// Pour les segments où ZEFIX est inefficace (family office, MFO) :
// on cherche via Brave et on extrait les domaines/noms des résultats.
//
// POST /api/brave-segment { "category": "family_office", "cantons": ["GE","VD"] }
// → { companies: [{ name, domain, url, canton }] }

const CATEGORY_QUERIES = {
  family_office: [
    '"family office" Genève',
    '"family office" Zürich',
    '"family office" Lausanne',
    '"family office" Zug',
    '"family office" Suisse gestion patrimoine',
    '"single family office" suisse',
    'family office SA Genève gestion fortune',
    'family office AG Zürich wealth',
  ],
  multi_family_office: [
    '"multi family office" suisse',
    '"multi-family office" Genève',
    '"multi family office" Zürich',
    'MFO suisse gestion fortune plusieurs familles',
    '"multi family" wealth management suisse',
    'multi family office Zug Genève',
  ],
}

// Domaines à exclure (annuaires, réseaux sociaux, etc.)
const EXCLUDE = [
  'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com',
  'wikipedia.org', 'google.com', 'admin.ch', 'zefix.ch', 'moneyhouse.ch',
  'search.ch', 'local.ch', 'companyhouse.ch', 'tel.search.ch', 'yellowpages',
  'swisscom.ch', 'uid.admin.ch', 'finma.ch', 'hkbb.ch', 'pwc.com', 'deloitte.com',
  'kpmg.com', 'ey.com', 'mckinsey.com', 'bcg.com', 'bain.com',
  'investopedia.com', 'bloomberg.com', 'reuters.com', 'lemonde.fr', 'lefigaro.fr',
  'hesge.ch', 'hec.unil.ch', 'epfl.ch', 'unige.ch',
]

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch { return null }
}

function isCH(domain) {
  return domain.endsWith('.ch') || domain.includes('.ch/')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const apiKey = process.env.BRAVE_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'BRAVE_API_KEY non configurée' })

  const { category, cantons = [] } = req.body ?? {}
  if (!category) return res.status(400).json({ error: 'category requis' })

  const queries = CATEGORY_QUERIES[category]
  if (!queries) return res.status(400).json({ error: `Catégorie inconnue : ${category}` })

  try {
    const seen = new Set()
    const companies = []

    await Promise.allSettled(
      queries.map(async (q) => {
        const url = new URL('https://api.search.brave.com/res/v1/web/search')
        url.searchParams.set('q', q)
        url.searchParams.set('count', '10')
        url.searchParams.set('country', 'ch')

        const r = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey,
          },
        })
        if (!r.ok) return

        const data = await r.json()
        for (const result of data?.web?.results ?? []) {
          const domain = extractDomain(result.url)
          if (!domain) continue
          if (seen.has(domain)) continue
          if (EXCLUDE.some((ex) => domain.includes(ex))) continue
          if (!isCH(domain)) continue // On ne garde que les .ch

          seen.add(domain)

          // Détection canton approximative depuis le titre/description
          const text = `${result.title} ${result.description ?? ''}`.toLowerCase()
          let detectedCanton = null
          const cantonMap = { ge: 'GE', genève: 'GE', geneva: 'GE', vd: 'VD', lausanne: 'VD', zh: 'ZH', zürich: 'ZH', zurich: 'ZH', bs: 'BS', bâle: 'BS', zg: 'ZG', zug: 'ZG', lu: 'LU', luzern: 'LU', ne: 'NE', neuchâtel: 'NE', fr: 'FR', fribourg: 'FR' }
          for (const [kw, canton] of Object.entries(cantonMap)) {
            if (text.includes(kw)) { detectedCanton = canton; break }
          }

          // Filtrer par canton si demandé
          if (cantons.length > 0 && detectedCanton && !cantons.includes(detectedCanton)) continue

          // Nom : nettoyer le titre
          let name = result.title
            .replace(/\s*[|\-–—]\s*.+$/, '') // Enlève tout après | ou -
            .replace(/\s*(SA|Sàrl|AG|GmbH|Ltd)\.?\s*$/, (m) => m) // garde la forme jur.
            .trim()

          companies.push({
            name,
            domain,
            url: result.url,
            canton: detectedCanton,
            uid: '',
            legalForm: '—',
            legalFormId: null,
            municipality: detectedCanton ?? 'Suisse',
            status: 'active',
            website: `https://${domain}`,
            excerptUrl: result.url,
            contacts: [],
          })
        }
      })
    )

    return res.status(200).json({ category, total: companies.length, companies })
  } catch (err) {
    return res.status(502).json({ error: `Brave segment error: ${err.message}` })
  }
}
