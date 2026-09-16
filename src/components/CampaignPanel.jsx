import { useState, useMemo } from 'react'
import { OUTREACH_ID } from '../services/outreach.js'
import './CampaignPanel.css'

const STATUTS = ['Non contacté', 'Contacté', 'RDV', 'Partenaire']
const STATUT_COLOR = {
  'Non contacté': 'grey',
  'Contacté':     'gold',
  'RDV':          'blue',
  'Partenaire':   'green',
}

const SEGMENT_LABELS = {
  banque_cantonale:     'Banques cantonales',
  banque_privee:        'Banques privées',
  banque_affaires:      "Banques d'affaires",
  fiduciaire:           'Fiduciaires',
  avocat:               'Avocats',
  gestionnaire_fortune: 'Gestionnaires de fortune',
  asset_manager:        'Asset Managers',
  family_office:        'Family Offices',
  multi_family_office:  'Multi Family Offices',
  notaire:              'Notaires',
  conseil_fiscal:       'Conseils fiscaux',
}

// ─── Socle commun Seerius (§2, §3, §4 — invariants) ──────────────────────────
const CORE = `Seerius associe deux compétences rarement réunies. D'un côté, un parcours d'entrepreneur : trois sociétés créées, développées et cédées, à Accenture, Ardian et Interpublic Group. De l'autre, quinze ans de private equity institutionnel, avec la structuration de fonds et des sorties réussies. Nous savons donc à la fois investir et diriger.

Société d'investissement genevoise, nous investissons directement au bilan, via un véhicule dédié à chaque opération, aux côtés d'investisseurs suisses sélectionnés.

Nous recherchons des sociétés rentables, à cash-flow récurrent, dont la structure financière permet un montage combinant fonds propres et effet de levier. Agnostiques sur le secteur, exigeants sur le profil.`

// ─── Variante A — Apporteurs de deals ────────────────────────────────────────
// Avocats, notaires, fiduciaires, banques d'affaires
// Angle : acquéreur crédible, décision rapide, solution sur mesure pour le cédant
const PITCH_DEALS = `Nous reprenons des PME suisses et européennes rentables, et nous les transformons opérationnellement.

${CORE}

Notre valeur ajoutée n'est pas uniquement financière, elle est opérationnelle. Nous construisons avec chaque dirigeant une solution de transmission sur mesure — qu'il souhaite se retirer immédiatement ou progressivement, avec la possibilité de réinvestir à nos côtés. Pour vous, cela se traduit par un acquéreur qui répond vite, traite en toute confidentialité, et apporte un projet crédible pour l'entreprise — souvent l'élément déterminant dans le choix du repreneur.`

// ─── Variante B — Banques relationnelles ─────────────────────────────────────
// Banques cantonales, banques privées
// Angle : partenaire de référence en amont, complémentarité avec la banque
const PITCH_BANQUES = `Nous reprenons des PME suisses et européennes rentables, et nous les transformons opérationnellement.

${CORE}

Notre valeur ajoutée n'est pas uniquement financière, elle est opérationnelle. Nous accompagnons les dirigeants sur la durée et construisons avec chacun une solution de transmission sur mesure. Pour vos équipes, c'est un partenaire sérieux à présenter très en amont — avant que le processus soit formalisé — avec la possibilité pour le dirigeant de réinvestir à nos côtés et de rester actif dans la création de valeur future.`

// ─── Variante C — Co-investisseurs ───────────────────────────────────────────
// GFI, asset managers, family offices, multi-family offices
// Angle : rendement mesuré, structure SPV dédiée, co-investissement
const PITCH_COINVEST = `Nous investissons dans des PME suisses et européennes rentables, et nous créons de la valeur opérationnelle après chaque acquisition.

${CORE}

Notre différence : nous ne sommes pas des investisseurs passifs. Nous déployons une méthodologie de transformation — incluant l'intelligence artificielle là où elle améliore concrètement la productivité — avec un objectif clair : l'amélioration de l'EBITDA, suivie et documentée à chaque participation. Chaque opération est structurée via un véhicule dédié, avec la possibilité pour nos co-investisseurs de participer directement à la création de valeur.`

// Alias pour compatibilité avec les templates (remplace l'ancien SEERIUS_PITCH)
const SEERIUS_PITCH = PITCH_DEALS

// ─── Templates email par segment (v3 — positionnement Seerius) ───────────────
// ─── Templates email par segment (v4 — 3 variantes de pitch) ─────────────────
const TEMPLATES = {
  // ── Variante B : Banques relationnelles ──────────────────────────────────────
  banque_cantonale: `Objet : Partenaire sur les successions de PME — Seerius x [Nom banque]

Madame, Monsieur,

Vos chargés de relations PME sont souvent les premiers à savoir qu'un dirigeant envisage de transmettre son entreprise — bien avant que le processus soit formalisé. C'est précisément là que Seerius intervient.

${PITCH_BANQUES}

Ce serait un plaisir d'échanger 20 minutes pour voir comment nous pouvons nous référer mutuellement sur ces dossiers.

[Prénom Nom] — Seerius`,

  banque_privee: `Objet : Vos clients cédants — Seerius x [Nom banque]

Madame, Monsieur,

Certains de vos clients entrepreneurs envisagent de céder leur entreprise. Avant qu'ils arrivent chez vous avec leur liquidité, il y a une phase que nous gérons : la préparation et la transaction.

${PITCH_BANQUES}

Un café pour voir comment nous pouvons travailler ensemble sur ces dossiers ?

[Prénom Nom] — Seerius`,

  // ── Variante A : Apporteurs de deals ─────────────────────────────────────────
  banque_affaires: `Objet : Dossiers de cession PME — Seerius x [Nom banque]

Madame, Monsieur,

Vous accompagnez des mandats de cession et voyez passer des dossiers bien avant qu'ils soient mis sur le marché. Nous sommes l'acquéreur que vous cherchez pour ces situations.

${PITCH_DEALS}

Nous cherchons des partenaires avec qui travailler dans la durée. Disponible 20 minutes ?

[Prénom Nom] — Seerius`,

  avocat: `Objet : Dossiers de cession PME — Seerius x [Nom cabinet]

Maître,

Vous structurez les cessions. Nous les finançons et accompagnons les entreprises après l'acquisition. C'est une complémentarité naturelle.

${PITCH_DEALS}

Nous cherchons des avocats M&A avec qui travailler dans la durée. Disponible 20 minutes ?

[Prénom Nom] — Seerius`,

  notaire: `Objet : Transmissions d'entreprises sans repreneur — Seerius x [Nom étude]

Maître,

Vous formalisez les transmissions. Certains de vos clients dirigeants s'interrogent sur leur succession bien avant d'en parler à leur banquier ou à leur avocat — c'est exactement à ce stade que nous pouvons intervenir.

${PITCH_DEALS}

Un échange de 20 minutes pour se connaître ?

[Prénom Nom] — Seerius`,

  fiduciaire: `Objet : Vos clients dirigeants sans successeur — Seerius x [Nom fiduciaire]

Madame, Monsieur,

Vous êtes souvent le premier confident d'un dirigeant qui pense à transmettre son entreprise. Vous voyez les comptes, vous connaissez la réalité de l'entreprise mieux que quiconque.

${PITCH_DEALS}

Si vous avez des clients qui réfléchissent à leur succession, nous serions un partenaire sérieux à leur présenter. 20 minutes pour se présenter ?

[Prénom Nom] — Seerius`,

  conseil_fiscal: `Objet : Cessions de PME en préparation — Seerius x [Cabinet fiscal]

Madame, Monsieur,

La réflexion fiscale précède souvent la décision de céder. Vos clients vous posent ces questions avant d'en parler ailleurs — c'est exactement à ce stade que nous pouvons intervenir ensemble.

${PITCH_DEALS}

Un échange de 20 minutes pour voir comment travailler ensemble ?

[Prénom Nom] — Seerius`,

  // ── Variante C : Co-investisseurs ────────────────────────────────────────────
  gestionnaire_fortune: `Objet : Opportunités PME suisses — Seerius x [Nom GFI]

Madame, Monsieur,

Certains de vos clients cherchent des placements dans l'économie réelle — des participations dans des PME suisses solides, hors des marchés cotés, avec une création de valeur mesurable.

${PITCH_COINVEST}

Seriez-vous disponible pour un échange confidentiel ?

[Prénom Nom] — Seerius`,

  asset_manager: `Objet : Co-investissement PME suisses et européennes — Seerius x [Nom AM]

Madame, Monsieur,

Vous gérez des stratégies cherchant de la performance dans l'économie réelle. Nous pourrions représenter une source d'accès à des opportunités hors marchés cotés, avec une approche opérationnelle documentée.

${PITCH_COINVEST}

Nous pourrions échanger sur des structures de co-investissement correspondant à vos mandats. Un échange de 20 minutes ?

[Prénom Nom] — Seerius`,

  family_office: `Objet : Investissement direct PME — Seerius x [Family Office]

Madame, Monsieur,

Les family offices que nous rencontrons cherchent souvent des placements dans l'économie réelle — des entreprises solides, hors des marchés cotés, avec une création de valeur opérationnelle tangible.

${PITCH_COINVEST}

Seriez-vous ouverts à un échange confidentiel ?

[Prénom Nom] — Seerius`,

  multi_family_office: `Objet : Co-investissement PME suisses — Seerius x [MFO]

Madame, Monsieur,

Pour les familles que vous gérez, nous pouvons représenter une source d'accès à des opportunités dans l'économie réelle — avec des rendements mesurés et une structuration par véhicule dédié.

${PITCH_COINVEST}

Seriez-vous disponible pour un échange ?

[Prénom Nom] — Seerius`,
}

function getTemplate(segmentId) {
  return TEMPLATES[segmentId] ?? TEMPLATES['fiduciaire_default']
}

// ─── Lecture du pipeline depuis localStorage ──────────────────────────────────
function readPipeline() {
  try { return JSON.parse(localStorage.getItem('scout_campaign') ?? '{}') } catch { return {} }
}

// ─── Pipeline global ──────────────────────────────────────────────────────────
export default function CampaignPanel({ onNavigate }) {
  const [pipeline] = useState(readPipeline)
  const [activeTemplate, setActiveTemplate] = useState(null)
  const [copied, setCopied] = useState(false)

  // Agréger les statuts par segment
  const stats = useMemo(() => {
    const result = {}
    for (const [key, statut] of Object.entries(pipeline)) {
      // key = "segmentId:companyUid"
      const [segId] = key.split(':')
      if (!result[segId]) result[segId] = { 'Non contacté': 0, 'Contacté': 0, 'RDV': 0, 'Partenaire': 0, total: 0 }
      result[segId][statut] = (result[segId][statut] ?? 0) + 1
      result[segId].total++
    }
    return result
  }, [pipeline])

  const hasData = Object.keys(stats).length > 0

  function copyTemplate(segId) {
    navigator.clipboard.writeText(getTemplate(segId))
    setCopied(segId)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="campaign-panel">
      <div className="campaign-header">
        <div>
          <h2>Campagnes d'outreach</h2>
          <p className="campaign-sub">Suivez votre pipeline relationnel et accédez aux templates par segment.</p>
        </div>
      </div>

      <button className="campaign-outreach-cta" onClick={() => onNavigate(OUTREACH_ID)}>
        <span>✉️ <strong>Campagne email Juridique &amp; Fiscal</strong> — emails personnalisés aux avocats, notaires, fiduciaires et conseils fiscaux, envoyés via HubSpot</span>
        <span>Ouvrir →</span>
      </button>

      {/* ── Templates par segment ── */}
      <div className="templates-section">
        <div className="section-title">📋 Templates email par segment</div>
        <div className="templates-grid">
          {Object.entries(SEGMENT_LABELS).map(([segId, label]) => (
            <div key={segId} className="template-card">
              <div className="template-card-header">
                <span className="template-label">{label}</span>
                <div className="template-actions">
                  <button className="btn-template-preview" onClick={() => setActiveTemplate(activeTemplate === segId ? null : segId)}>
                    {activeTemplate === segId ? '▲' : '▼ Voir'}
                  </button>
                  <button className="btn-template-copy" onClick={() => copyTemplate(segId)}>
                    {copied === segId ? '✓' : '📋'}
                  </button>
                  <button className="btn-template-goto" onClick={() => onNavigate(segId)}>
                    Ouvrir →
                  </button>
                </div>
              </div>
              {activeTemplate === segId && (
                <pre className="template-preview">{getTemplate(segId)}</pre>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Pipeline par segment ── */}
      <div className="pipeline-section">
        <div className="section-title">📊 Pipeline relationnel</div>
        {!hasData ? (
          <div className="campaign-empty">
            Aucun statut enregistré. Dans chaque segment, utilisez la colonne "Statut" pour suivre vos contacts (Contacté, RDV, Partenaire…).
          </div>
        ) : (
          <div className="pipeline-table-wrap">
            <table className="pipeline-table">
              <thead>
                <tr>
                  <th>Segment</th>
                  {STATUTS.map((s) => <th key={s}>{s}</th>)}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats).map(([segId, counts]) => (
                  <tr key={segId}>
                    <td>
                      <button className="btn-seg-goto" onClick={() => onNavigate(segId)}>
                        {SEGMENT_LABELS[segId] ?? segId} →
                      </button>
                    </td>
                    {STATUTS.map((s) => (
                      <td key={s} className="pipeline-cell">
                        {counts[s] > 0
                          ? <span className={`pipeline-badge pipeline-badge--${STATUT_COLOR[s]}`}>{counts[s]}</span>
                          : <span className="pipeline-zero">—</span>}
                      </td>
                    ))}
                    <td className="pipeline-total">{counts.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
