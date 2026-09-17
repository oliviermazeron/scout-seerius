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

// Masquer les critères d'acquisition dans l'interface et les emails.
// Les composants, la logique d'injection et le stockage sont conservés pour une
// réactivation sans réécriture.
export const SHOW_ACQUISITION_CRITERIA = false

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
  campaignId: '',
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
    campaignId: s.campaignId?.trim() || generateCampaignId('INTERMEDIAIRES'),
    criteria: { ...DEFAULT_SETTINGS.criteria, ...(s.criteria ?? {}) },
  }
}

// Convention : SCOUT-<AAAA>-<MM>-<SEGMENT>-V<n>
export function generateCampaignId(segment = 'INTERMEDIAIRES', version = 1) {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const seg = String(segment).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '')
  return `SCOUT-${yyyy}-${mm}-${seg}-V${version}`
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
    return contact?.lastName ? `Bonjour Maître ${contact.lastName},` : 'Bonjour Madame, Monsieur,'
  }
  const name = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ')
  return name ? `Bonjour ${name},` : 'Bonjour Madame, Monsieur,'
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

// Tronc commun §3–§6, identique dans les trois nouveaux templates (avocat/fiduciaire/conseil_fiscal)
const SEERIUS_INTRO = `Seerius est une société d'investissement genevoise spécialisée dans la prise de participation et l'accompagnement de PME suisses, notamment dans le cadre de transmissions. Ses associés ont créé et cédé leurs propres sociétés — à Accenture, Ardian, Interpublic Group et Morningstar — et cumulent quinze ans de private equity institutionnel.`

const CORE_INVESTMENT = `Nous investissons directement au bilan, via un véhicule dédié à chaque opération, aux côtés d'investisseurs suisses sélectionnés. Nous construisons avec chaque dirigeant une solution de transmission sur mesure : LBO, LMBO, cession progressive, réinvestissement du cédant à nos côtés. Nous travaillons naturellement en coordination avec les conseils déjà en place, pour la structuration juridique et fiscale comme pour le suivi de leurs clients.`

const CORE_OPERATIONS = `Après l'opération, notre valeur ajoutée est avant tout opérationnelle. Nous appuyons le management sur la croissance, organique et par build-up, et sur l'internationalisation. Nous déployons aussi une méthodologie de transformation par l'intelligence artificielle aux résultats mesurables.`

const CORE_TARGET = `Nous recherchons des sociétés rentables, à cash-flow récurrent, en croissance ou bien établies sur leur marché, quel que soit le secteur. Nous regardons en particulier les situations où le dirigeant prépare sa succession ou souhaite s'adosser à un partenaire pour franchir une étape.`

const DEALFLOW_ASK = `Si certains de vos clients se posent ces questions, je serais heureux d'échanger avec vous une vingtaine de minutes, en visio ou par téléphone, en toute confidentialité. Vous pouvez réserver directement un créneau via le lien de prise de rendez-vous figurant dans ma signature, ou simplement me proposer une date à votre convenance en répondant à cet email.`

// Legacy pitch pour le path notaire uniquement (template inchangé)
const DEALFLOW_PITCH = [
  `Nous reprenons des PME suisses et européennes rentables, et nous les transformons opérationnellement.`,
  `Seerius associe deux compétences rarement réunies. D'un côté, un parcours d'entrepreneur : trois sociétés créées, développées et cédées, à Accenture, Ardian et Interpublic Group. De l'autre, quinze ans de private equity institutionnel, avec la structuration de fonds et des sorties réussies. Nous savons donc à la fois investir et diriger.`,
  `Société d'investissement genevoise, nous investissons directement au bilan, via un véhicule dédié à chaque opération, aux côtés d'investisseurs suisses sélectionnés.`,
  `Nous recherchons des sociétés rentables, à cash-flow récurrent, dont la structure financière permet un montage combinant fonds propres et effet de levier. Agnostiques sur le secteur, exigeants sur le profil.`,
  `Notre valeur ajoutée n'est pas uniquement financière, elle est opérationnelle. Nous accompagnons les dirigeants sur la croissance et déployons une méthodologie de transformation par l'intelligence artificielle qui améliore la productivité de manière mesurable. Nous construisons avec chaque dirigeant une solution de transmission sur mesure, qu'il souhaite se retirer à court, moyen ou long terme, avec la possibilité de réinvestir à nos côtés et de participer à la création de valeur future.`,
].join('\n\n')

const DEALFLOW_HOOKS = {
  // ── Nouveaux templates v2 ─────────────────────────────────────────────────
  avocat: {
    subject: () => `Seerius — repreneur pour les PME de vos clients en transmission`,
    body: (target, contact) => [
      salutation(target.segment, contact),
      `Vous accompagnez des actionnaires de PME dans la cession de leur société, et vous voyez ces dossiers bien avant qu'ils n'arrivent sur le marché. Ce que cherche un cédant, au-delà du prix, c'est un projet crédible pour son entreprise et pour ses équipes.`,
      SEERIUS_INTRO,
      CORE_INVESTMENT,
      CORE_OPERATIONS,
      CORE_TARGET,
      DEALFLOW_ASK,
    ].join('\n\n'),
  },
  fiduciaire: {
    subject: () => `Seerius — repreneur pour les PME de vos clients qui préparent leur succession`,
    body: (target, contact) => [
      salutation(target.segment, contact),
      `Vous tenez les comptes de dirigeants de PME depuis des années. Vous êtes souvent les premiers au courant quand l'un d'eux commence à penser à sa succession — bien avant qu'un mandat de vente ne soit lancé, et parfois avant qu'il n'en parle à quiconque.`,
      `${SEERIUS_INTRO} Nous intervenons précisément à ce stade amont, en coordination avec la fiduciaire en place, qui conserve naturellement son mandat après l'opération.`,
      CORE_INVESTMENT,
      CORE_OPERATIONS,
      CORE_TARGET,
      DEALFLOW_ASK,
    ].join('\n\n'),
  },
  conseil_fiscal: {
    subject: () => `Seerius — un repreneur souple sur la structuration pour les transmissions de vos clients`,
    body: (target, contact) => [
      salutation(target.segment, contact),
      `Dans une transmission de PME, c'est souvent le traitement fiscal qui dicte la forme et le calendrier de l'opération : transposition, liquidation partielle indirecte, étalement de la cession, réinvestissement du cédant. Un repreneur rigide sur le montage réduit d'autant votre marge de manœuvre.`,
      `${SEERIUS_INTRO} Nous investissons via un véhicule dédié à chaque opération, ce qui nous laisse libres d'adapter le montage à ce que la fiscalité du dossier commande.`,
      `Nous investissons directement au bilan, aux côtés d'investisseurs suisses sélectionnés, et nous construisons avec chaque dirigeant une solution de transmission sur mesure : LBO, LMBO, cession progressive, réinvestissement du cédant à nos côtés. Nous travaillons naturellement en coordination avec les conseils déjà en place, pour la structuration juridique et fiscale comme pour le suivi de leurs clients.`,
      CORE_OPERATIONS,
      CORE_TARGET,
      DEALFLOW_ASK,
    ].join('\n\n'),
  },
  // ── Template legacy (notaire inchangé) ───────────────────────────────────
  notaire: {
    subject: () => `Transmissions d'entreprises sans repreneur — Seerius`,
    intro: `Lors de la préparation d'une succession, vous rencontrez des dirigeants dont l'entreprise n'a pas de repreneur identifié dans la famille ou parmi les cadres.`,
    edge: `Pour un dirigeant attaché à son entreprise, c'est l'assurance d'une continuité : l'entreprise, ses emplois et son ancrage local sont préservés et développés.`,
    ask: `Lorsque c'est le cas, nous étudions volontiers ces situations très en amont, en toute discrétion. Un teaser anonymisé suffit pour un premier retour.`,
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
  // Nouveaux templates v2 : corps entier fourni par hook.body
  if (hook.body) {
    return { subject: hook.subject(target.name), body: hook.body(target, contact) }
  }
  // Legacy path (notaire uniquement)
  return {
    subject: hook.subject(target.name),
    body: [
      salutation(target.segment, contact),
      hook.intro,
      DEALFLOW_PITCH,
      hook.edge,
      SHOW_ACQUISITION_CRITERIA ? criteriaBlock(criteria) : null,
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
  if (settings?.objective !== 'partenariat' && SHOW_ACQUISITION_CRITERIA) {
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
