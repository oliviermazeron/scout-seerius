// ─── Lookup ZEFIX par nom de société ─────────────────────────────────────────
// Cherche la meilleure correspondance ZEFIX pour un nom donné.
//
// POST /api/zefix-lookup { "name": "Pictet & Cie SA", "canton": "GE" }
// → { uid, legalForm, legalFormId, canton, municipality, excerptUrl, status }

const LEGAL_FORMS = {
  1: 'EI', 2: 'SNC', 3: 'SA', 4: 'Sàrl', 5: 'Coopérative',
  6: 'Association', 7: 'Fondation', 9: 'Succursale', 10: 'SCm',
}

const CANTON_PATTERNS = {
  VD: ['vd.ch', 'prestations.vd'], GE: ['ge.ch', 'geneve.ch', 'rcge.ch'],
  NE: ['ne.ch'], FR: ['fr.ch', 'fribourg'], VS: ['vs.ch'],
  ZH: ['zh.ch'], BE: ['be.ch'], BS: ['bs.ch'], BL: ['bl.ch'],
  AG: ['ag.ch'], SG: ['sg.ch'], LU: ['lu.ch'], ZG: ['zg.ch'],
  SO: ['so.ch'], TI: ['ti.ch'], GR: ['gr.ch'], SH: ['sh.ch'],
  TG: ['tg.ch'], SZ: ['sz.ch'], ZW: ['zw.ch'],
}

function detectCanton(url = '') {
  const u = url.toLowerCase()
  for (const [c, patterns] of Object.entries(CANTON_PATTERNS)) {
    if (patterns.some(p => u.includes(p))) return c
  }
  return null
}

// Score de similarité simple entre deux noms
function similarity(a, b) {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, '')
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  // Nombre de mots en commun
  const wa = new Set(a.toLowerCase().split(/\s+/))
  const wb = b.toLowerCase().split(/\s+/)
  const common = wb.filter(w => wa.has(w) && w.length > 2).length
  return common / Math.max(wa.size, wb.length)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { name, canton } = req.body ?? {}
  if (!name) return res.status(400).json({ error: 'name requis' })

  try {
    // Chercher dans ZEFIX par nom (on prend les 3 premiers mots pour éviter les noms trop longs)
    const searchName = name.split(/[\s,]/)[0] // Premier mot = plus fiable
    const r = await fetch('https://www.zefix.admin.ch/ZefixREST/api/v1/firm/search.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: searchName, maxEntries: 20, activeOnly: true }),
    })

    if (!r.ok) return res.status(502).json({ error: `ZEFIX ${r.status}` })
    const data = await r.json()
    const list = data.list ?? []

    if (!list.length) return res.status(200).json({ found: false })

    // Scorer chaque résultat
    const scored = list.map(c => ({
      ...c,
      score: similarity(name, c.name) + (detectCanton(c.cantonalExcerptWeb) === canton ? 0.2 : 0),
    })).sort((a, b) => b.score - a.score)

    const best = scored[0]
    if (best.score < 0.3) return res.status(200).json({ found: false, tried: name })

    return res.status(200).json({
      found: true,
      name: best.name,
      uid: best.uidFormatted ?? best.uid ?? '',
      legalFormId: best.legalFormId,
      legalForm: LEGAL_FORMS[best.legalFormId] ?? String(best.legalFormId ?? '—'),
      canton: detectCanton(best.cantonalExcerptWeb),
      municipality: best.legalSeat ?? '',
      excerptUrl: best.cantonalExcerptWeb ?? '',
      status: best.status === 'EXISTIEREND' ? 'active' : 'radié',
      score: best.score,
    })
  } catch (err) {
    return res.status(502).json({ error: `ZEFIX error: ${err.message}` })
  }
}
