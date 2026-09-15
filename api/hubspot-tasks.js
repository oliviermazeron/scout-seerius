// ─── Création de tâches HubSpot (email à envoyer manuellement) ───────────────
// POST /api/hubspot-tasks
// Body: { tasks: [{ companyName, companyId, contactName?, contactId?, template, subject?, dueInDays? }] }
//   template : « Objet : … » puis une ligne vide, puis le texte de l'email.
//
// Garde-fous — le lot entier est refusé avant toute création si une tâche échoue :
//  - gabarit complet : aucun placeholder, token, critère vide ni énumération
//    trouée (src/services/emailGuard.js) ;
//  - association systématique : société obligatoire, contact obligatoire dès
//    qu'un nom de contact est indiqué ;
//  - propriétaire renseigné (API owners, clé SCOUT), sinon échec explicite.

import { scoutKeyConfigured, taskOwnerId, createTask } from './_lib/hubspot-scout.js'
import { emailProblems } from '../src/services/emailGuard.js'

function splitTemplate(template) {
  const [first, ...rest] = String(template ?? '').split('\n\n')
  return /^Objet\s*:/.test(first)
    ? { subject: first.replace(/^Objet\s*:\s*/, ''), body: rest.join('\n\n') }
    : { subject: null, body: String(template ?? '') }
}

export function taskProblems(task, index) {
  const label = `tâche ${index + 1}${task?.companyName ? ` (${task.companyName})` : ''}`
  const problems = []
  if (!task?.companyId) problems.push(`${label} : société HubSpot non associée`)
  if (String(task?.contactName ?? '').trim() && !task?.contactId) problems.push(`${label} : contact HubSpot non associé`)
  const email = splitTemplate(task?.template)
  const subject = email.subject ?? task?.subject ?? ''
  for (const problem of emailProblems({ subject, body: email.body })) problems.push(`${label} : ${problem}`)
  return problems
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  if (!scoutKeyConfigured()) return res.status(500).json({ error: 'Clé HubSpot SCOUT non configurée (HUBSPOT_SCOUT_KEY)' })

  const { tasks } = req.body ?? {}
  if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: 'tasks[] requis' })

  // 1. Validation de tout le lot : un gabarit incomplet est une erreur
  const problems = tasks.flatMap(taskProblems)
  if (problems.length) {
    return res.status(400).json({
      error: `Tâches refusées : ${problems.join(' ; ')}`, code: 'INVALID_TASKS', problems, created: 0, errors: tasks.length, total: tasks.length,
    })
  }

  // 2. Propriétaire obligatoire
  let ownerId
  try {
    ownerId = await taskOwnerId()
  } catch (err) {
    return res.status(503).json({ error: `Tâches non créées : ${err.message}`, code: err.code, created: 0, errors: tasks.length, total: tasks.length })
  }

  // 3. Création
  try {
    const results = await Promise.allSettled(tasks.map((t) => createTask({
      subject: t.subject ?? `📧 Email — ${t.companyName}${t.contactName ? ' · ' + t.contactName : ''}`,
      template: t.template,
      companyId: t.companyId,
      contactId: t.contactId,
      ownerId,
      dueInDays: t.dueInDays,
    })))

    const created = results.filter((r) => r.status === 'fulfilled' && r.value?.ok).length
    const failures = results
      .map((r, i) => (r.status === 'fulfilled' && r.value?.ok ? null : `tâche ${i + 1} : ${r.value?.error ?? r.reason?.message ?? 'erreur'}`))
      .filter(Boolean)

    return res.status(200).json({ created, errors: failures.length, total: tasks.length, ...(failures.length ? { problems: failures } : {}) })
  } catch (err) {
    return res.status(502).json({ error: `HubSpot error: ${err.message}` })
  }
}
