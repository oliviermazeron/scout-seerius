// ─── Proxy serverless → Hunter.io API ────────────────────────────────────────
// Deux usages :
//   1. Domain Search  : POST /api/hunter  { "domain": "bcv.ch" }
//      → retourne tous les emails trouvés pour un domaine
//   2. Email Finder   : POST /api/hunter  { "domain": "bcv.ch", "first_name": "Jean", "last_name": "Dupont" }
//      → retourne l'email le plus probable pour une personne
//
// Variables d'environnement requises :
//   HUNTER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//
// Crédits consommés :
//   - 1 crédit par email trouvé (Domain Search)
//   - 1 crédit par email trouvé (Email Finder), gratuit si non trouvé

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HUNTER_API_KEY non configurée' })

  const { domain, first_name, last_name, limit = 10 } = req.body ?? {}
  if (!domain) return res.status(400).json({ error: 'domain requis' })

  try {
    if (first_name && last_name) {
      // ── Email Finder (personne précise) ──────────────────────────────────
      const url = new URL('https://api.hunter.io/v2/email-finder')
      url.searchParams.set('domain', domain)
      url.searchParams.set('first_name', first_name)
      url.searchParams.set('last_name', last_name)
      url.searchParams.set('api_key', apiKey)

      const r = await fetch(url)
      const data = await r.json()
      return res.status(r.ok ? 200 : r.status).json({
        mode: 'email-finder',
        email: data.data?.email ?? null,
        confidence: data.data?.score ?? null,
        sources: data.data?.sources ?? [],
      })
    } else {
      // ── Domain Search (tous les emails d'un domaine) ──────────────────────
      const url = new URL('https://api.hunter.io/v2/domain-search')
      url.searchParams.set('domain', domain)
      url.searchParams.set('limit', limit)
      url.searchParams.set('api_key', apiKey)

      const r = await fetch(url)
      const data = await r.json()
      // Hunter renvoie 400 quand le domaine est inconnu de leur base — on traite ça comme 0 résultats
      if (!r.ok) {
        return res.status(200).json({
          mode: 'domain-search',
          domain,
          organization: null,
          total: 0,
          emails: [],
          _hunterStatus: r.status,
          _hunterError: data.errors?.[0]?.details ?? data.message ?? 'unknown',
        })
      }
      const emails = (data.data?.emails ?? []).map((e) => ({
        email: e.value,
        firstName: e.first_name,
        lastName: e.last_name,
        position: e.position,
        confidence: e.confidence,
        linkedin: e.linkedin,
      }))
      return res.status(200).json({
        mode: 'domain-search',
        domain: data.data?.domain ?? domain,
        organization: data.data?.organization ?? null,
        total: data.meta?.results ?? emails.length,
        emails,
      })
    }
  } catch (err) {
    return res.status(502).json({ error: `Hunter.io error: ${err.message}` })
  }
}
