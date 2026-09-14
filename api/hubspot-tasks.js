// ─── Création de tâches HubSpot (email à envoyer) ────────────────────────────
// POST /api/hubspot-tasks
// Body: { tasks: [{ companyName, contactName, template, companyId?, contactId?, subject?, dueInDays? }] }
//
// Utilise l'API Engagements v1 (legacy) — compatible avec les tokens pat-eu1-*
// sans scope tasks supplémentaire.

const HS_ENGAGE = 'https://api.hubapi.com/engagements/v1/engagements'
const DAY_MS = 24 * 60 * 60 * 1000

// Le corps de tâche HubSpot est du HTML : on préserve les retours à la ligne du modèle
function textToHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

async function createTask(token, { companyName, contactName, template, companyId, contactId, subject: customSubject, dueInDays = 2 }) {
  const subject = customSubject ?? `📧 Email — ${companyName}${contactName ? ' · ' + contactName : ''}`
  const dueDate = Date.now() + Number(dueInDays) * DAY_MS

  const body = {
    engagement: {
      active:    true,
      type:      'TASK',
      timestamp: dueDate,
    },
    associations: {
      companyIds: companyId ? [Number(companyId)] : [],
      contactIds: contactId ? [Number(contactId)] : [],
      dealIds:    [],
      ownerIds:   [],
      ticketIds:  [],
    },
    metadata: {
      subject,
      body:     textToHtml(template),
      status:   'NOT_STARTED',
      taskType: 'EMAIL',
      priority: 'MEDIUM',
    },
  }

  const r = await fetch(HS_ENGAGE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json()
  if (!r.ok) return { ok: false, error: data?.message ?? r.status, status: r.status }
  return { ok: true, taskId: data?.engagement?.id }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const token = process.env.HUBSPOT_TOKEN
  if (!token) return res.status(500).json({ error: 'HUBSPOT_TOKEN non configuré' })

  const { tasks } = req.body ?? {}
  if (!tasks?.length) return res.status(400).json({ error: 'tasks[] requis' })

  try {
    const results = await Promise.allSettled(
      tasks.map((t) => createTask(token, t))
    )

    const created = results.filter((r) => r.status === 'fulfilled' && r.value?.ok).length
    const errors  = results.length - created

    return res.status(200).json({ created, errors, total: tasks.length })
  } catch (err) {
    return res.status(502).json({ error: `HubSpot error: ${err.message}` })
  }
}
