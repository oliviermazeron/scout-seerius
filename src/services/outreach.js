// ─── Campagne email Juridique & Fiscal ───────────────────────────────────────
// Cibles (cabinets ajoutés depuis les tableaux de segment), signature expéditeur
// et modèles d'emails personnalisés — persistés en localStorage.
// Le statut relationnel partage la clé `scout_campaign` (même format
// "segmentId:companyKey") que les tableaux et l'onglet Campagnes.

export const OUTREACH_ID = '__outreach_juridique__'

export const JURIDIQUE_SEGMENTS = {
  avocat:         { label: 'Avocats',          short: 'Avocat',        icon: '⚖️' },
  notaire:        { label: 'Notaires',         short: 'Notaire',       icon: '📜' },
  fiduciaire:     { label: 'Fiduciaires',      short: 'Fiduciaire',    icon: '📊' },
  conseil_fiscal: { label: 'Conseils fiscaux', short: 'Conseil fiscal', icon: '🧾' },
}

const TARGETS_KEY  = 'scout_outreach_juridique'
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
export const writeTargets = (targets) => writeJSON(TARGETS_KEY, targets)

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

// ─── Signature & pipeline ─────────────────────────────────────────────────────
export const readSender  = () => readJSON(SENDER_KEY, { name: '', title: '', phone: '' })
export const writeSender = (sender) => writeJSON(SENDER_KEY, sender)

export const readPipeline = () => readJSON(PIPELINE_KEY, {})
export function setPipelineStatus(id, statut) {
  const pipeline = readPipeline()
  if (!statut) delete pipeline[id]
  else pipeline[id] = statut
  writeJSON(PIPELINE_KEY, pipeline)
  return pipeline
}

// ─── Modèles ──────────────────────────────────────────────────────────────────
const PITCH = `Seerius est une société d'investissement spécialisée dans les PME suisses et européennes en situation de succession familiale. Notre approche est opérationnelle : après chaque acquisition, nos équipes travaillent avec le management pour auditer les processus, identifier les leviers de productivité et les déployer — avec des outils d'intelligence artificielle là où ils améliorent concrètement l'EBITDA.`

const HOOKS = {
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

function salutation(segment, contact) {
  if (segment === 'avocat' || segment === 'notaire') {
    return contact?.lastName ? `Maître ${contact.lastName},` : 'Maître,'
  }
  const name = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ')
  return name ? `Bonjour ${name},` : 'Madame, Monsieur,'
}

function signature(sender) {
  return [sender?.name || '[Prénom Nom]', sender?.title, 'Seerius', sender?.phone].filter(Boolean).join('\n')
}

function meetingAsk(city) {
  const inPerson = city ? `autour d'un café à ${city}` : 'en personne'
  return `Seriez-vous disponible pour un premier échange de 20 minutes dans les prochaines semaines — en visio, ou ${inPerson} si vous préférez ? Je m'adapte volontiers à vos disponibilités.`
}

// target: { segment, name, municipality } · contact: { firstName, lastName } · sender: { name, title, phone }
export function buildEmail(target, contact, sender) {
  const hook = HOOKS[target.segment] ?? HOOKS.fiduciaire
  return {
    subject: hook.subject(target.name),
    body: [
      salutation(target.segment, contact),
      hook.intro,
      PITCH,
      hook.close,
      meetingAsk(target.municipality),
      `Avec mes meilleures salutations,\n\n${signature(sender)}`,
    ].join('\n\n'),
  }
}

export function buildFollowUp(target, contact, sender, subject) {
  return {
    subject: `RE: ${subject}`,
    body: [
      salutation(target.segment, contact),
      `Je me permets de revenir vers vous suite à mon message de la semaine dernière au sujet d'une collaboration entre ${target.name} et Seerius autour des transmissions de PME.`,
      `Un échange de 20 minutes, en visio ou en personne, suffirait pour voir si nos approches se rejoignent. Auriez-vous un créneau dans les deux prochaines semaines ?`,
      `Avec mes meilleures salutations,\n\n${signature(sender)}`,
    ].join('\n\n'),
  }
}
