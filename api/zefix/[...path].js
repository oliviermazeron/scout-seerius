// ─── Proxy serverless → ZEFIX REST API ────────────────────────────────────────
// Copié depuis SwissDealScout, identique.
// /api/zefix/firm/search.json → zefix.admin.ch/ZefixREST/api/v1/firm/search.json
// ZEFIX est public : aucune clé API nécessaire.

export default async function handler(req, res) {
  const segments = req.query.path ?? [];
  const subpath = Array.isArray(segments) ? segments.join('/') : segments;

  const target = `https://www.zefix.admin.ch/ZefixREST/api/v1/${subpath}`;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });

    const data = await upstream.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: `ZEFIX proxy error: ${err.message}` });
  }
}
