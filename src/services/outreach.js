// ─── Campagne email Juridique & Fiscal ───────────────────────────────────────
// Cibles (cabinets ajoutés depuis les tableaux de segment), réglages de campagne
// (objectif, critères d'acquisition), signature expéditeur et modèles d'emails.
// Le statut relationnel partage la clé `scout_campaign` (même format
// "segmentId:companyKey") que les tableaux et l'onglet Campagnes.
// Cibles, statuts et réglages sont partagés (store.js) ; la signature reste propre au navigateur.

import { saveShared } from './store.js'
import { assertCompleteEmail, IncompleteEmailError } from './emailGuard.js'

export const OUTREACH_ID = '__outreach_juridique__'

export const JURIDIQUE_SEGMENTS = {
  avocat:         { label: 'Avocats',          short: 'Avocat',        icon: '⚖️' },
  notaire:        { label: 'Notaires',         short: 'Notaire',       icon: '📜' },
  fiduciaire:     { label: 'Fiduciaires',      short: 'Fiduciaire',    icon: '📊' },
  conseil_fiscal: { label: 'Conseils fiscaux', short: 'Conseil fiscal', icon: '🧾' },
}

export const OBJECTIVES = {
  dealflow:    { label: 'Deal flow', desc: 'Obtenir des dossiers de sociétés small & mid cap suisses à reprendre' },
  partenariat: { label: 'Partenariat', desc: 'Présenter Seerius et nouer une relation de recommandation' },
}

// Critères d'acquisition cités dans les emails deal flow (modifiables dans la page)
export const DEAL_CRITERIA_FIELDS = [
  { id: 'ca',           label: "Chiffre d'affaires" },
  { id: 'ebitda',       label: 'EBITDA' },
  { id: 'situations',   label: 'Situations' },
  { id: 'secteurs',     label: 'Secteurs' },
  { id: 'region',       label: 'Région' },
  { id: 'responseTime', label: 'Délai de premier retour' },
]

const DEFAULT_SETTINGS = {
  objective: 'dealflow',
  criteria: {
    ca:           'de 5 à 100 MCHF',
    ebitda:       'de 1 à 15 MCHF, rentable',
    situations:   "succession familiale, départ à la retraite du dirigeant, sortie d'un actionnaire",
    secteurs:     'industrie, services B2B, distribution, technologies (hors immobilier et services financiers)',
    region:       'Suisse, en priorité la Suisse romande',
    responseTime: '10 jours ouvrés',
  },
}

const TARGETS_KEY  = 'scout_outreach_juridique'
const SETTINGS_KEY = 'scout_outreach_settings'
const SENDER_KEY   = 'scout_outreach_sender'
const PIPELINE_KEY = 'scout_campaign'

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ─── Cibles ───────────────────────────────────────────────────────────────────
export const readTargets  = () => readJSON(TARGETS_KEY, {})
export const writeTargets = (targets) => saveShared(TARGETS_KEY, targets)

// list: [{ segment, key, name, domain, canton, municipality, uid, decideurs }]
// Retourne le nombre de nouvelles cibles (les existantes sont rafraîchies).
export function addTargets(list) {
  const current = readTargets()
  let added = 0
  for (const t of list) {
    const id = `${t.segment}:${t.key}`
    const fresh = Object.fromEntries(Object.entries(t).filter(([, v]) => v != null && v !== ''))
    if (current[id]) {
      current[id] = { ...current[id], ...fresh }
    } else {
      current[id] = { ...fresh, id, addedAt: Date.now() }
      added++
    }
  }
  writeTargets(current)
  return added
}

// ─── Réglages, signature & pipeline ───────────────────────────────────────────
export function readSettings() {
  const s = readJSON(SETTINGS_KEY, {})
  return {
    objective: OBJECTIVES[s.objective] ? s.objective : DEFAULT_SETTINGS.objective,
    criteria: { ...DEFAULT_SETTINGS.criteria, ...(s.criteria ?? {}) },
  }
}
export const writeSettings = (settings) => saveShared(SETTINGS_KEY, settings)

export const readSender  = () => readJSON(SENDER_KEY, { name: '', title: '', phone: '' })
export const writeSender = (sender) => writeJSON(SENDER_KEY, sender)

export const readPipeline = () => readJSON(PIPELINE_KEY, {})
export function setPipelineStatus(id, statut) {
  const pipeline = readPipeline()
  if (!statut) delete pipeline[id]
  else pipeline[id] = statut
  saveShared(PIPELINE_KEY, pipeline)
  return pipeline
}

// ─── Éléments communs ─────────────────────────────────────────────────────────
function salutation(segment, contact) {
  if (segment === 'avocat' || segment === 'notaire') {
    return contact?.lastName ? `Maître ${contact.lastName},` : 'Maître,'
  }
  const name = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ')
  return name ? `Bonjour ${name},` : 'Madame, Monsieur,'
}

function inPerson(city) {
  return city ? `à ${city}` : 'en personne'
}

// ─── Modèles « Partenariat » ──────────────────────────────────────────────────
const PARTNER_PITCH = `Seerius est une société d'investissement spécialisée dans les PME suisses et européennes en situation de succession familiale. Notre approche est opérationnelle : après chaque acquisition, nos équipes travaillent avec le management pour auditer les processus, identifier les leviers de productivité et les déployer — avec des outils d'intelligence artificielle là où ils améliorent concrètement l'EBITDA.`

const PARTNER_HOOKS = {
  avocat: {
    subject: (co) => `Cessions de PME — Seerius x ${co}`,
    intro: `Vous structurez les cessions d'entreprises ; nous les finançons et accompagnons les sociétés après la reprise. C'est une complémentarité naturelle.`,
    close: `Nous souhaitons construire des relations durables avec quelques cabinets actifs en M&A et droit des sociétés — des partenaires à qui présenter nos dossiers, et qui peuvent nous présenter les leurs.`,
  },
  notaire: {
    subject: (co) => `Transmissions d'entreprises — Seerius x ${co}`,
    intro: `Vous formalisez les transmissions. Certains de vos clients dirigeants s'interrogent sur l'avenir de leur entreprise bien avant d'en parler à leur banquier ou à leur avocat.`,
    close: `Lorsqu'un de vos clients réfléchit à sa succession, nous pouvons être un interlocuteur sérieux et discret à lui présenter, très en amont du processus.`,
  },
  fiduciaire: {
    subject: (co) => `Vos clients dirigeants et leur succession — Seerius x ${co}`,
    intro: `Vous êtes souvent le premier confident d'un dirigeant qui pense à transmettre son entreprise : vous voyez les comptes et connaissez la réalité de la société.`,
    close: `Si certains de vos clients réfléchissent à leur succession, nous serions un repreneur sérieux à leur présenter — et nous travaillons volontiers avec la fiduciaire en place après la reprise.`,
  },
  conseil_fiscal: {
    subject: (co) => `Structuration de cessions PME — Seerius x ${co}`,
    intro: `La réflexion fiscale précède souvent la décision de céder : vos clients vous posent ces questions avant d'en parler ailleurs. C'est précisément à ce stade que nous pouvons intervenir ensemble.`,
    close: `Votre expertise reste centrale dans la structuration de ces opérations, et nous cherchons des conseils fiscaux avec qui travailler dans la durée.`,
  },
}

function partnerEmail(target, contact, sender) {
  const hook = PARTNER_HOOKS[target.segment] ?? PARTNER_HOOKS.fiduciaire
  return {
    subject: hook.subject(target.name),
    body: [
      salutation(target.segment, contact),
      hook.intro,
      PARTNER_PITCH,
      hook.close,
      `Seriez-vous disponible pour un premier échange de 20 minutes dans les prochaines semaines — en visio, ou ${target.municipality ? `autour d'un café à ${target.municipality}` : 'en personne'} si vous préférez ? Je m'adapte volontiers à vos disponibilités.`,
    ].join('\n\n'),
  }
}

function partnerFollowUp(target, contact, sender, subject) {
  return {
    subject: `RE: ${subject}`,
    body: [
      salutation(target.segment, contact),
      `Je me permets de revenir vers vous suite à mon message de la semaine dernière au sujet d'une collaboration entre ${target.name} et Seerius autour des transmissions de PME.`,
      `Un échange de 20 minutes, en visio ou en personne, suffirait pour voir si nos approches se rejoignent. Auriez-vous un créneau dans les deux prochaines semaines ?`,
    ].join('\n\n'),
  }
}

// ─── Modèles « Deal flow » ────────────────────────────────────────────────────
const DEALFLOW_PITCH = [
  `Nous reprenons des PME suisses et européennes rentables, et nous les transformons opérationnellement.`,
  `Seerius associe deux compétences rarement réunies. D'un côté, un parcours d'entrepreneur : trois sociétés créées, développées et cédées, à Accenture, Ardian et Interpublic Group. De l'autre, quinze ans de private equity institutionnel, avec la structuration de fonds et des sorties réussies. Nous savons donc à la fois investir et diriger.`,
  `Société d'investissement genevoise, nous investissons directement au bilan, via un véhicule dédié à chaque opération, aux côtés d'investisseurs suisses sélectionnés.`,
  `Nous recherchons des sociétés rentables, à cash-flow récurrent, dont la structure financière permet un montage combinant fonds propres et effet de levier. Agnostiques sur le secteur, exigeants sur le profil.`,
  `Notre valeur ajoutée n'est pas uniquement financière, elle est opérationnelle. Nous accompagnons les dirigeants sur la croissance et déployons une méthodologie de transformation par l'intelligence artificielle qui améliore la productivité de manière mesurable. Nous construisons avec chaque dirigeant une solution de transmission sur mesure, qu'il souhaite se retirer à court, moyen ou long terme, avec la possibilité de réinvestir à nos côtés et de participer à la création de valeur future.`,
].join('\n\n')

// Différenciant opérationnel (inséré après le pitch dans les emails deal flow)
const OPERATIONAL_EDGE = ``

const DEALFLOW_HOOKS = {
  avocat: {
    subject: () => `Dossiers de cession PME — critères d'acquisition Seerius`,
    intro: `Vous accompagnez des actionnaires de PME dans la cession de leur société, et voyez passer des dossiers bien avant qu'ils ne soient mis sur le marché.`,
    edge: `Pour vos clients cédants, c'est un acquéreur qui apporte davantage qu'un prix : un projet crédible pour l'entreprise, souvent déterminant dans le choix du repreneur.`,
    ask: `Si vous conseillez des actionnaires qui envisagent de céder, ou si vous accompagnez un processus de vente à la recherche d'un acquéreur, nous serions heureux d'étudier ces dossiers. Un teaser anonymisé suffit pour un premier retour, et un accord de confidentialité peut être signé en amont.`,
  },
  notaire: {
    subject: () => `Transmissions d'entreprises sans repreneur — Seerius`,
    intro: `Lors de la préparation d'une succession, vous rencontrez des dirigeants dont l'entreprise n'a pas de repreneur identifié dans la famille ou parmi les cadres.`,
    edge: `Pour un dirigeant attaché à son entreprise, c'est l'assurance d'une continuité : l'entreprise, ses emplois et son ancrage local sont préservés et développés.`,
    ask: `Lorsque c'est le cas, nous étudions volontiers ces situations très en amont, en toute discrétion. Un teaser anonymisé suffit pour un premier retour.`,
  },
  fiduciaire: {
    subject: () => `Vos clients dirigeants sans successeur — Seerius, repreneur`,
    intro: `Parmi vos clients, certains dirigeants approchent de la retraite sans successeur identifié. Vous connaissez leurs comptes mieux que quiconque, et êtes souvent le premier à savoir qu'ils envisagent de vendre.`,
    edge: `Vous connaissez les marges de progrès de vos clients ; notre métier est précisément de les concrétiser après la reprise. Et le mandat de la fiduciaire reste en place.`,
    ask: `Nous étudions volontiers ces situations, même à un stade préliminaire. Un teaser anonymisé suffit pour un premier retour.`,
  },
  conseil_fiscal: {
    subject: () => `Cessions de PME en préparation — Seerius, acquéreur`,
    intro: `Lorsque vous travaillez sur la planification successorale d'un dirigeant ou la structuration fiscale d'une vente, la question de l'acquéreur se pose rapidement.`,
    edge: `Une reprise préparée avec un acquéreur impliqué opérationnellement facilite la structuration de l'opération et la transition du dirigeant.`,
    ask: `Si l'un de vos clients prépare la cession de sa société et n'a pas encore d'acquéreur, nous serions heureux d'étudier le dossier. Votre rôle dans la structuration de l'opération reste entier, et nous travaillons en coordination avec vous.`,
  },
}

// Critère retiré volontairement dans la page : null → non mentionné.
// Chaîne vide : oubli → la génération échoue (voir missingData).
const isRemoved = (value) => value === null
const LISTED_CRITERIA = DEAL_CRITERIA_FIELDS.filter((f) => f.id !== 'responseTime')

// Si la valeur saisie est un entier brut (ex. "1000000"), la formater en CHF avec
// séparateur suisse (apostrophe). Toute autre forme est conservée telle quelle.
function formatCriteriaValue(id, value) {
  const s = String(value).trim()
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10)
    const formatted = n.toLocaleString('fr-CH').replace(/\s/g, '’') // apostrophe suisse
    return id === 'ca' || id === 'ebitda' ? `CHF ${formatted}` : formatted
  }
  return s
}

function criteriaBlock(c) {
  const lines = LISTED_CRITERIA
    .filter((f) => !isRemoved(c[f.id]))
    .map((f) => `• ${f.label} : ${formatCriteriaValue(f.id, c[f.id])}`)
  return lines.length ? ['Les dossiers que nous recherchons :', ...lines].join('\n') : null
}

const responseDelay = (c) => (isRemoved(c.responseTime) ? 'rapidement' : `sous ${String(c.responseTime).trim()}`)

function dealflowEmail(target, contact, sender, criteria) {
  const hook = DEALFLOW_HOOKS[target.segment] ?? DEALFLOW_HOOKS.fiduciaire
  return {
    subject: hook.subject(target.name),
    body: [
      salutation(target.segment, contact),
      hook.intro,
      DEALFLOW_PITCH,
      OPERATIONAL_EDGE,
      hook.edge,
      criteriaBlock(criteria),
      hook.ask,
      `Nous revenons ${responseDelay(criteria)} avec une position claire, en toute confidentialité. Seriez-vous ouvert à un échange de 20 minutes, en visio ou ${inPerson(target.municipality)}, pour vous présenter notre approche et comprendre les dossiers que vous accompagnez ?`,
    ].filter(Boolean).join('\n\n'),
  }
}

// « (chiffre d'affaires …, EBITDA …) » limité aux critères mentionnés
function sizeSummary(c) {
  const parts = [
    !isRemoved(c.ca) && `chiffre d'affaires ${String(c.ca).trim()}`,
    !isRemoved(c.ebitda) && `EBITDA ${String(c.ebitda).trim()}`,
  ].filter(Boolean)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

function dealflowFollowUp(target, contact, sender, subject, criteria) {
  return {
    subject: `RE: ${subject}`,
    body: [
      salutation(target.segment, contact),
      `Je me permets de revenir vers vous au sujet de mon message de la semaine dernière : Seerius recherche des PME suisses à reprendre${sizeSummary(criteria)} — en repreneur qui s'implique opérationnellement après la reprise, pas en simple investisseur financier.`,
      `Si un dossier correspondant se présente chez ${target.name}, un simple email avec un teaser anonymisé suffit : nous revenons ${responseDelay(criteria)}. Et si un échange de 20 minutes en visio vous convient pour faire connaissance, je m'adapte à vos disponibilités.`,
    ].join('\n\n'),
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────
// target: { segment, name, municipality } · contact: { firstName, lastName }
// sender: { name, title, phone } · settings: { objective, criteria }
// Lève IncompleteEmailError si une donnée requise manque ou si le résultat
// contient un trou (placeholder, critère vide…) : jamais d'email incomplet.

function missingData(target, sender, settings) {
  const missing = []
  if (!String(target?.name ?? '').trim()) missing.push('société du contact manquante')
  if (!String(sender?.name ?? '').trim()) missing.push('nom du signataire manquant (« Votre signature »)')
  if (settings?.objective !== 'partenariat') {
    for (const field of DEAL_CRITERIA_FIELDS) {
      const value = settings?.criteria?.[field.id]
      if (value === null) continue // retiré volontairement : non mentionné
      if (!String(value ?? '').trim()) missing.push(`critère « ${field.label} » vide (renseignez-le ou retirez-le)`)
    }
  }
  return missing
}

function checked(build, target, sender, settings) {
  const missing = missingData(target, sender, settings)
  if (missing.length) throw new IncompleteEmailError(missing)
  const email = build()
  assertCompleteEmail(email)
  return email
}

export function buildEmail(target, contact, sender, settings = DEFAULT_SETTINGS) {
  return checked(() => (settings.objective === 'partenariat'
    ? partnerEmail(target, contact, sender)
    : dealflowEmail(target, contact, sender, settings.criteria)), target, sender, settings)
}

export function buildFollowUp(target, contact, sender, subject, settings = DEFAULT_SETTINGS) {
  return checked(() => (settings.objective === 'partenariat'
    ? partnerFollowUp(target, contact, sender, subject)
    : dealflowFollowUp(target, contact, sender, subject, settings.criteria)), target, sender, settings)
}
