// ─── Création de tâches HubSpot (email à envoyer) ────────────────────────────
// POST /api/hubspot-tasks
// Body: { tasks: [{ companyName, contactName, contactRole, template, companyId? }] }
//
// Crée une tâche de type EMAIL pour chaque contact dans HubSpot.
// La tâche contient le template pré-rempli dans hs_task_body.
//
// Scopes requis : crm.objects.tasks.write

const HS = 'https://api.hubapi.com/crm/v3'

async function createTask(token, { companyName, contactName, contactRole, template, companyId, contactId }) {
  const subject = `📧 Email à envoyer — ${companyName}${contactName ? ' · ' + contactName : ''}`
  const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // +2 jours

  const properties = {
    hs_task_subject:    subject,
    hs_task_body:       template,
    hs_task_status:     'NOT_STARTED',
    hs_task_type:       'EMAIL',
    hs_timestamp:       dueDate,
    hs_task_priority:   'MEDIUM',
  }

  const r = await fetch(`${HS}/objects/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties }),
  })
  const data = await r.json()
  if (!r.ok) return { ok: false, error: data?.message ?? r.status }

  const taskId = data.id

  // Associer à la company si on a l'ID
  if (taskId && companyId) {
    await fetch(`${HS}/objects/tasks/${taskId}/associations/companies/${companyId}/task_to_company`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  }

  // Associer au contact si on a l'ID
  if (taskId && contactId) {
    await fetch(`${HS}/objects/tasks/${taskId}/associations/contacts/${contactId}/task_to_contact`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  }

  return { ok: true, taskId }
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
