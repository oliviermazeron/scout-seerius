// ─── Tests de génération d'email : un gabarit incomplet est une erreur ───────
// Lancer : npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEmail, buildFollowUp, readSettings, JURIDIQUE_SEGMENTS, OBJECTIVES } from '../src/services/outreach.js'
import { emailProblems, IncompleteEmailError } from '../src/services/emailGuard.js'

const sender = { name: 'Olivier Mazeron', title: 'Associé', phone: '+41 00 000 00 00' }
const target = { segment: 'avocat', name: 'Étude Test SA', municipality: 'Lausanne' }
const contact = { firstName: 'Valentine', lastName: 'Bagnoud' }
const complete = readSettings() // critères par défaut, tous renseignés

const withCriteria = (patch) => ({ ...complete, criteria: { ...complete.criteria, ...patch } })

function assertIncomplete(fn, expected) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof IncompleteEmailError, `IncompleteEmailError attendue, reçu : ${err}`)
    for (const text of expected) assert.ok(err.problems.some((p) => p.includes(text)), `problème « ${text} » attendu dans ${JSON.stringify(err.problems)}`)
    return true
  })
}

test('jeu complet : tous les segments et objectifs produisent un email sans trou', () => {
  for (const segment of Object.keys(JURIDIQUE_SEGMENTS)) {
    for (const objective of Object.keys(OBJECTIVES)) {
      const settings = { ...complete, objective }
      const t = { ...target, segment }
      const email = buildEmail(t, contact, sender, settings)
      assert.deepEqual(emailProblems(email), [], `${segment} / ${objective}`)
      assert.deepEqual(emailProblems(buildFollowUp(t, contact, sender, email.subject, settings)), [], `relance ${segment} / ${objective}`)
    }
  }
})

test('CA manquant (défaut constaté dans HubSpot) : génération refusée, email et relance', () => {
  const settings = withCriteria({ ca: '', ebitda: 'rentable ou proche de la rentabilité' })
  assertIncomplete(() => buildEmail(target, contact, sender, settings), ["Chiffre d'affaires"])
  assertIncomplete(() => buildFollowUp(target, contact, sender, 'Objet', settings), ["Chiffre d'affaires"])
  assertIncomplete(() => buildEmail(target, contact, sender, withCriteria({ ca: '   ' })), ["Chiffre d'affaires"])
})

test('nom du signataire manquant : génération refusée (pas de [Prénom Nom])', () => {
  assertIncomplete(() => buildEmail(target, contact, { ...sender, name: '' }, complete), ['signataire'])
  assertIncomplete(() => buildEmail(target, contact, { title: 'Associé' }, complete), ['signataire'])
})

test('contact sans société : génération refusée', () => {
  assertIncomplete(() => buildEmail({ ...target, name: '' }, contact, sender, complete), ['société'])
})

test('jeu incomplet cumulé : tous les manques sont listés', () => {
  assertIncomplete(
    () => buildEmail({ ...target, name: '' }, contact, { name: '' }, withCriteria({ ca: '' })),
    ['société', 'signataire', "Chiffre d'affaires"],
  )
})

test('objectif Partenariat : les critères d\'acquisition ne sont pas exigés', () => {
  const settings = { ...withCriteria({ ca: '' }), objective: 'partenariat' }
  assert.deepEqual(emailProblems(buildEmail(target, contact, sender, settings)), [])
})

test('le contrôle détecte les défauts des tâches HubSpot inspectées', () => {
  const cases = [
    ["Les dossiers que nous recherchons :\n• Chiffre d'affaires : \n• EBITDA : rentable", 'critère sans valeur'],
    ["Seerius recherche des PME (chiffre d'affaires , EBITDA rentable)", 'énumération'],
    ['Cordialement,\n[Votre nom] — Seerius', 'placeholder'],
    ['Disponible 20 minutes ?\n\n[Prénom Nom] — Seerius', 'placeholder'],
    ['Madame, Monsieur,\n\n[Nom banque] recherche…', 'placeholder'],
    ["Chiffre d'affaires : {{ca}}", 'token de gabarit'],
    ["Chiffre d'affaires : ${ca}", 'token de gabarit'],
    ["Chiffre d'affaires : undefined", 'valeur invalide'],
  ]
  for (const [body, expected] of cases) {
    const problems = emailProblems({ subject: 'Objet', body })
    assert.ok(problems.some((p) => p.includes(expected)), `« ${expected} » attendu pour : ${body}`)
  }
  assert.ok(emailProblems({ subject: '', body: 'Texte' }).includes('objet vide'))
})
