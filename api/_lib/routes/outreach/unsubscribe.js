// ─── Page de désinscription (lien en bas des emails de campagne) ─────────────
// GET  /api/outreach/unsubscribe?e=email&t=signature  → page de confirmation
// POST /api/outreach/unsubscribe (e, t)               → enregistre la désinscription dans HubSpot
// La confirmation en deux temps évite que les antivirus de messagerie, qui
// ouvrent les liens, ne désinscrivent le destinataire à son insu.
// Si HubSpot est indisponible, la demande bloque tout envoi et est réessayée.

import { checkEmailToken } from '../../access.js'
import { reportConfig } from '../../config.js'
import { hgetJSON } from '../../redis.js'
import { OPTOUT_KEY, EMAIL_RE, normEmail, optOut } from '../../outreach.js'

reportConfig()

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function page(title, message, form = '') {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} — Seerius</title>
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f2; color: #0d1b2e;
         display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
  main { background: #fff; border: 1px solid #e2e2de; border-radius: 12px; max-width: 460px; width: 100%; padding: 32px; box-sizing: border-box; }
  .brand { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: #a07840; font-weight: 700; margin-bottom: 18px; }
  h1 { font-size: 20px; margin: 0 0 10px; }
  p { font-size: 14px; line-height: 1.6; color: #4a4a48; margin: 0 0 20px; }
  button { background: #0d1b2e; color: #fff; border: 0; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body><main><div class="brand">Seerius</div><h1>${esc(title)}</h1><p>${message}</p>${form}</main></body>
</html>`
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')

  const params = req.method === 'POST' ? { ...(req.query ?? {}), ...(req.body ?? {}) } : (req.query ?? {})
  const email = normEmail(params.e)
  const token = String(params.t ?? '')

  if (!EMAIL_RE.test(email) || !checkEmailToken(email, token)) {
    return res.status(400).end(page('Lien invalide',
      'Ce lien de désinscription est invalide ou incomplet. Vous pouvez aussi répondre « stop » à notre message.'))
  }

  try {
    if (req.method === 'POST') {
      const result = await optOut(email, 'link')
      if (result.dryRun) {
        return res.status(200).end(page('Mode test',
          `Mode test actif : la désinscription de <strong>${esc(email)}</strong> a été simulée, rien n'a été enregistré.`))
      }
      if (!result.synced) {
        return res.status(202).end(page('Demande bien reçue',
          `Votre demande est prise en compte : aucun nouveau message ne sera envoyé à <strong>${esc(email)}</strong>. `
          + 'Son enregistrement dans notre CRM a rencontré une erreur temporaire et sera réessayé automatiquement. '
          + 'Par précaution, vous pouvez aussi répondre « stop » à notre message.'))
      }
      return res.status(200).end(page('Désinscription confirmée',
        `L'adresse <strong>${esc(email)}</strong> ne recevra plus de message de notre part.`))
    }

    if (await hgetJSON(OPTOUT_KEY, email)) {
      return res.status(200).end(page('Déjà désinscrit',
        `L'adresse <strong>${esc(email)}</strong> ne reçoit plus de message de notre part.`))
    }

    return res.status(200).end(page('Ne plus recevoir nos messages',
      `Confirmez que l'adresse <strong>${esc(email)}</strong> ne doit plus recevoir de message de Seerius.`,
      `<form method="post"><input type="hidden" name="e" value="${esc(email)}"><input type="hidden" name="t" value="${esc(token)}"><button type="submit">Confirmer la désinscription</button></form>`))
  } catch {
    return res.status(500).end(page('Erreur temporaire',
      'La désinscription n\'a pas pu être enregistrée. Réessayez dans quelques instants, ou répondez « stop » à notre message.'))
  }
}
