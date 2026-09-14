// ─── Proxy serverless → Brave Search API ─────────────────────────────────────
// Cherche le site web officiel d'une société suisse par son nom.
//
// POST /api/brave { "name": "Fiduciaire Dupont SA", "canton": "GE", "municipality": "Genève" }
// → { domain, confidence: 'high' | 'medium', url, title, candidates }
// → { domain: null, confidence: 'none', candidates }   si aucun résultat ne correspond au nom
//
// Un domaine n'est retenu que s'il correspond au nom de la société (mots
// distinctifs, sigle ou nom complet) — jamais « le premier résultat ».
// Les candidats non confirmés sont renvoyés pour un choix manuel.
//
// Variables d'environnement :
//   BRAVE_API_KEY=BSAUf...

// Annuaires, médias, réseaux, sites publics : jamais le site officiel d'une société
const EXCLUDE = [
  'linkedin.', 'facebook.', 'twitter.', 'x.com', 'instagram.', 'youtube.', 'tiktok.', 'xing.',
  'wikipedia.', 'wikidata.', 'google.', 'bing.', 'yahoo.',
  'zefix.', 'moneyhouse.', 'companyhouse.', 'easymonitoring.', 'business-monitor.', 'help.ch',
  'search.ch', 'local.ch', 'yellowpages', 'gelbeseiten', 'pagesjaunes', 'kompass.', 'dnb.com',
  'northdata.', 'firmenwissen.', 'monetas.', 'swissfirms.', 'infocube.', 'opencorporates.',
  'lixt.ch', 'pappers.', 'zip.ch', 'lei.info', 'auditorstats.', 'wirtschaftsregister.', 'swissfunddata.',
  'business-informations.', 'allbiz.', '.directory', 'fiduciaires.ch', 'comparatif.ch', 'shab.ch',
  'firmania.', 'cylex.', 'hotfrog.', 'infoisinfo.', 'moneycab.', 'fundinfo.',
  'crunchbase.', 'bloomberg.', 'reuters.', 'marketscreener.', 'finanzen.', 'handelszeitung.',
  'nzz.ch', 'letemps.ch', 'tdg.ch', '24heures.ch', 'bilan.ch', 'agefi.ch', 'swissinfo.',
  'indeed.', 'jobup.', 'jobs.ch', 'glassdoor.', 'kununu.',
  'admin.ch', 'finma.ch', 'swisscom.', 'sav-fsa.ch', 'expertsuisse.ch', 'treuhandsuisse.ch',
  'am-switzerland.ch', 'swissbanking.ch', 'vsv-asg.ch', 'fiduciairesuisse.ch', 'notaires.ch',
  'lawinside.ch', 'legal500.', 'chambers.com', 'whoswholegal.', 'avocats.ch', 'anwaltssuche.',
]

const CANTON_CODES = [
  'ag', 'ai', 'ar', 'be', 'bl', 'bs', 'fr', 'ge', 'gl', 'gr', 'ju', 'lu', 'ne', 'nw', 'ow',
  'sg', 'sh', 'so', 'sz', 'tg', 'ti', 'ur', 'vd', 'vs', 'zg', 'zh',
]

// Formes juridiques et mots génériques du métier : ne distinguent pas une société
const GENERIC = new Set([
  'sa', 'ag', 'sarl', 'gmbh', 'sas', 'ltd', 'llc', 'inc', 'kg', 'snc', 'scm', 'cie', 'co',
  'holding', 'group', 'groupe', 'gruppe', 'succursale', 'zweigniederlassung', 'filiale',
  'genossenschaft', 'cooperative', 'societe', 'gesellschaft', 'compagnie', 'company', 'agence', 'maison',
  'fiduciaire', 'fiduciaires', 'fiducia', 'treuhand', 'treuhandgesellschaft', 'fiduciary', 'trust', 'trustees',
  'avocat', 'avocats', 'avocate', 'rechtsanwalt', 'rechtsanwalte', 'anwalt', 'anwalte', 'anwaltskanzlei',
  'kanzlei', 'law', 'lawyers', 'legal', 'attorneys', 'notaire', 'notaires', 'notariat', 'notar', 'etude',
  'cabinet', 'bureau', 'office', 'offices', 'conseil', 'conseils', 'conseiller', 'consulting', 'consultants',
  'beratung', 'advisory', 'advisors', 'advisers', 'tax', 'taxes', 'fiscal', 'fiscale', 'fiscalite', 'steuer',
  'steuerberatung', 'audit', 'revision', 'expertise', 'comptable', 'comptabilite', 'buchhaltung', 'accounting',
  'gestion', 'management', 'wealth', 'asset', 'assets', 'fund', 'funds', 'fonds', 'capital', 'finance',
  'finanz', 'financial', 'investment', 'investments', 'invest', 'bank', 'banque', 'private', 'privee',
  'partners', 'partner', 'associes', 'associates', 'services', 'service', 'solutions', 'family',
  'suisse', 'swiss', 'schweiz', 'switzerland', 'helvetia', 'international', 'global',
  'geneve', 'genf', 'geneva', 'lausanne', 'zurich', 'bern', 'berne', 'basel', 'bale', 'lugano', 'zug',
  'et', 'und', 'and', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'der', 'die', 'das', 'von', 'en', 'the', 'of',
])

function normalize(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return null }
}

// "fr.gva-tax.ch" → "gvatax" ; "etude-dupont.law" → "etudedupont"
function domainLabel(domain) {
  const parts = domain.split('.')
  const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
  return label.replace(/[^a-z0-9]/g, '')
}

function isExcluded(domain) {
  if (EXCLUDE.some((ex) => domain.includes(ex))) return true
  // Sites cantonaux et communaux : ge.ch, vd.ch, ville-geneve.ch…
  if (CANTON_CODES.some((c) => domain === `${c}.ch` || domain.endsWith(`.${c}.ch`))) return true
  return /^(ville|commune|stadt|gemeinde)-/.test(domain)
}

export function analyzeName(name) {
  const words = normalize(name).split(/[^a-z0-9]+/).filter(Boolean)
  const distinctive = words.filter((w) => !GENERIC.has(w) && !/^\d+$/.test(w) && w.length >= 2)
  const meaningful = words.filter((w) => !['sa', 'ag', 'sarl', 'gmbh', 'et', 'und', 'and', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'cie', 'co'].includes(w))
  return {
    distinctive,
    numbers: words.filter((w) => /^\d{3,}$/.test(w)), // "1741 Fund Solutions" → 1741group.com
    full: meaningful.join(''),
    acronym: meaningful.length >= 2 ? meaningful.map((w) => w[0]).join('') : '',
  }
}

// Score de correspondance nom ↔ domaine : 2 = sûr, 1 = probable, 0 = non
export function matchScore(name, domain, title = '') {
  const { distinctive, numbers, full, acronym } = analyzeName(name)
  const label = domainLabel(domain)
  if (!label) return 0

  if (full.length >= 4 && (label === full || label.includes(full))) return 2

  const strong = distinctive.filter((w) => w.length >= 4 && label.includes(w))
  const short = distinctive.filter((w) => w.length < 4 && (label.startsWith(w) || label.endsWith(w)))

  if (distinctive.length && strong.length + short.length === distinctive.length) return 2
  if (strong.length && strong.join('').length >= 5) return 2
  if (acronym.length >= 3 && label.startsWith(acronym)) return 1
  if (!distinctive.length && numbers.some((n) => label.startsWith(n))) return 1
  if (strong.length || short.length) {
    // Correspondance partielle : confirmée si le titre de la page reprend le nom
    const t = normalize(title)
    return distinctive.some((w) => w.length >= 3 && t.includes(w)) ? 1 : 0
  }
  return 0
}

async function braveSearch(apiKey, q) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', q)
  url.searchParams.set('count', '10')
  url.searchParams.set('country', 'ch')
  const r = await fetch(url, {
    headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`Brave error ${r.status}: ${await r.text()}`)
  const data = await r.json()
  return data?.web?.results ?? []
}

function pickBest(name, results) {
  const seen = new Set()
  const candidates = []
  for (const res of results) {
    const domain = hostname(res.url)
    if (!domain || seen.has(domain) || isExcluded(domain)) continue
    seen.add(domain)
    candidates.push({ domain, url: res.url, title: res.title, score: matchScore(name, domain, res.title) })
  }
  const best = candidates.find((c) => c.score === 2) ?? candidates.find((c) => c.score === 1) ?? null
  return { best, candidates }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const apiKey = process.env.BRAVE_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'BRAVE_API_KEY non configurée' })

  const { name, municipality } = req.body ?? {}
  if (!name) return res.status(400).json({ error: 'name requis' })

  try {
    // 1. Nom exact entre guillemets, en excluant les annuaires les plus fréquents
    let { best, candidates } = pickBest(name, await braveSearch(
      apiKey, `"${name}" -site:moneyhouse.ch -site:zefix.ch -site:linkedin.com`,
    ))

    // 2. Sans guillemets, avec la localité, si rien de convaincant
    if (!best) {
      const retry = pickBest(name, await braveSearch(apiKey, `${name} ${municipality ?? ''} site officiel`.trim()))
      best = retry.best
      const known = new Set(candidates.map((c) => c.domain))
      candidates = [...candidates, ...retry.candidates.filter((c) => !known.has(c.domain))]
    }

    const top = candidates.slice(0, 5).map(({ domain, url, title }) => ({ domain, url, title }))
    if (!best) return res.status(200).json({ domain: null, confidence: 'none', candidates: top })

    return res.status(200).json({
      domain: best.domain,
      confidence: best.score === 2 ? 'high' : 'medium',
      url: best.url,
      title: best.title,
      candidates: top,
    })
  } catch (err) {
    return res.status(502).json({ error: `Brave error: ${err.message}` })
  }
}
