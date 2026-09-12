// ─── Proxy serverless → Brave Search API ─────────────────────────────────────
// Cherche le site web d'une société suisse par son nom.
//
// POST /api/brave { "name": "Fiduciaire Dupont SA", "canton": "GE" }
// → { domain: "dupont-fiduciaire.ch", url: "https://...", title: "..." }
//
// Variables d'environnement :
//   BRAVE_API_KEY=BSAUf...

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const apiKey = process.env.BRAVE_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'BRAVE_API_KEY non configurée' })

  const { name, canton } = req.body ?? {}
  if (!name) return res.status(400).json({ error: 'name requis' })

  try {
    const query = canton ? `"${name}" ${canton} site officiel` : `"${name}" Suisse site officiel`
    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', query)
    url.searchParams.set('count', '5')
    url.searchParams.set('country', 'ch')
    url.searchParams.set('search_lang', 'fr')

    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    })

    if (!r.ok) {
      const err = await r.text()
      return res.status(502).json({ error: `Brave error ${r.status}: ${err}` })
    }

    const data = await r.json()
    const results = data?.web?.results ?? []

    // Filtrer les résultats pour trouver le site officiel
    // On exclut les annuaires, réseaux sociaux, etc.
    const EXCLUDE = ['linkedin.com', 'facebook.com', 'twitter.com', 'zefix.ch',
      'moneyhouse.ch', 'search.ch', 'local.ch', 'instagram.com', 'youtube.com',
      'wikipedia.org', 'google.com', 'admin.ch', 'uid.admin.ch', 'companyhouse.ch',
      'swisscom.ch', 'yellowpages', 'pages jaunes', 'tel.search.ch']

    const best = results.find((r) => {
      try {
        const domain = new URL(r.url).hostname.replace('www.', '')
        return !EXCLUDE.some((ex) => domain.includes(ex))
      } catch { return false }
    })

    if (!best) return res.status(200).json({ domain: null, results: [] })

    const domain = new URL(best.url).hostname.replace('www.', '')
    return res.status(200).json({
      domain,
      url: best.url,
      title: best.title,
      description: best.description,
    })
  } catch (err) {
    return res.status(502).json({ error: `Brave error: ${err.message}` })
  }
}
