// ─── Proxy serverless → Proxycurl API ────────────────────────────────────────
// Proxycurl permet d'enrichir un contact LinkedIn (nom, poste, email pro).
// La clé API reste côté serveur : jamais exposée dans le navigateur.
//
// Variables d'environnement requises (à configurer dans Vercel) :
//   PROXYCURL_API_KEY=xxxxx
//
// Usage : POST /api/proxycurl
// Body  : { "linkedin_url": "https://www.linkedin.com/in/jean-dupont" }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const apiKey = process.env.PROXYCURL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'PROXYCURL_API_KEY non configurée' });
  }

  const { linkedin_url } = req.body ?? {};
  if (!linkedin_url) {
    return res.status(400).json({ error: 'linkedin_url requis' });
  }

  try {
    const upstream = await fetch(
      `https://nubela.co/proxycurl/api/v2/linkedin?url=${encodeURIComponent(linkedin_url)}&personal_email=include`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: `Proxycurl error: ${err.message}` });
  }
}
