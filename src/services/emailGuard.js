// ─── Contrôle d'un email avant création de tâche ou envoi ────────────────────
// Un gabarit incomplet est une erreur, pas un email à envoyer : placeholder non
// substitué, token de gabarit résiduel, critère sans valeur, énumération trouée
// ou valeur « undefined ». Module sans dépendance, partagé par l'interface et
// par les routes serveur (/api/hubspot-tasks, /api/outreach/send).

const CHECKS = [
  [/\[[^\]\n]{1,60}\]/, (m) => `placeholder non substitué ${m[0]}`],
  [/\{\{[^}\n]*\}\}|\$\{[^}\n]*\}/, (m) => `token de gabarit non substitué ${m[0]}`],
  [/\b(?:undefined|null|NaN)\b/, (m) => `valeur invalide « ${m[0]} »`],
  [/^[ \t]*•[^:\n]*:[ \t]*$/m, (m) => `critère sans valeur « ${m[0].trim()} »`],
  [/[^\S\n],|\([ \t]*,|,[ \t]*[),.]/, (m) => `valeur vide dans une énumération « ${m[0].trim()} »`],
]

export class IncompleteEmailError extends Error {
  constructor(problems) {
    super(`Email incomplet : ${problems.join(' ; ')}`)
    this.name = 'IncompleteEmailError'
    this.code = 'INCOMPLETE_EMAIL'
    this.problems = problems
  }
}

export function emailProblems({ subject, body } = {}) {
  const problems = []
  if (!String(subject ?? '').trim()) problems.push('objet vide')
  if (!String(body ?? '').trim()) problems.push('texte vide')
  for (const [label, text] of [['objet', subject], ['texte', body]]) {
    for (const [pattern, describe] of CHECKS) {
      const match = String(text ?? '').match(pattern)
      if (match) problems.push(`${label} : ${describe(match)}`)
    }
  }
  return problems
}

export function assertCompleteEmail(email) {
  const problems = emailProblems(email)
  if (problems.length) throw new IncompleteEmailError(problems)
}
