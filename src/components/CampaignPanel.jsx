import { useState, useMemo } from 'react'
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

// ─── Templates email par segment (v2 — positionnement Seerius) ───────────────
const TEMPLATES = {
  banque_cantonale: `Objet : Partenaire sur les successions de PME — Seerius x [Nom banque]

Madame, Monsieur,

Vos équipes PME sont souvent les premières informées qu'un dirigeant envisage de transmettre ou céder son entreprise. C'est précisément là que Seerius intervient.

Nous sommes une société d'investissement spécialisée dans les PME suisses et européennes en succession familiale. Notre particularité : après chaque acquisition, nos équipes auditent les processus de l'entreprise, identifient les vrais leviers de productivité et les déploient — avec le support d'outils d'intelligence artificielle là où c'est pertinent. L'objectif est une amélioration mesurable de l'EBITDA, pas une promesse de disruption.

Ce serait un plaisir d'échanger 20 minutes sur comment nous pouvons collaborer sur ces dossiers.

[Prénom Nom] — Seerius`,

  banque_privee: `Objet : Dealflow PME suisses — Seerius x [Nom banque]

Madame, Monsieur,

Certains de vos clients entrepreneurs envisagent de céder leur entreprise. Avant qu'ils arrivent chez vous avec leur liquidité, il y a une phase que nous gérons : la préparation et la transaction.

Seerius est une société d'investissement dans les PME suisses et européennes en succession familiale. Ce qui nous distingue du capital-investissement traditionnel : nos équipes s'impliquent directement dans chaque participation après acquisition — audit des processus, identification des gains de productivité, déploiement d'outils IA là où ils créent de la valeur réelle. Pas du capital passif.

Un café pour voir comment nous pouvons nous référer mutuellement ?

[Prénom Nom] — Seerius`,

  banque_affaires: `Objet : Dossiers de cession PME — Seerius x [Nom banque]

Madame, Monsieur,

Seerius investit dans des PME suisses et européennes en succession familiale. Notre approche est opérationnelle : après acquisition, nos équipes travaillent directement avec le management pour auditer les processus, identifier les leviers de productivité et les concrétiser — avec des outils d'intelligence artificielle là où ils améliorent réellement l'EBITDA.

Nous cherchons des partenaires avec qui travailler dans la durée sur des mandats complémentaires. Disponible 20 minutes ?

[Prénom Nom] — Seerius`,

  avocat: `Objet : Dossiers de cession PME — Seerius x [Nom cabinet]

Maître,

Vous structurez les cessions. Nous les finançons et nous accompagnons les entreprises après l'acquisition. C'est une complémentarité naturelle.

Seerius investit dans des PME suisses et européennes en succession familiale. Après chaque acquisition, nos équipes travaillent directement avec le management : audit des processus, refonte des workflows, déploiement d'outils d'intelligence artificielle là où ils améliorent concrètement l'EBITDA. Une approche opérationnelle, pas seulement financière.

Nous cherchons des avocats M&A avec qui travailler dans la durée. Disponible 20 minutes ?

[Prénom Nom] — Seerius`,

  notaire: `Objet : Transmissions d'entreprises — Seerius x [Nom étude]

Maître,

Vous formalisez les transmissions. Certains de vos clients dirigeants s'interrogent sur leur succession bien avant d'en parler à leur banquier ou à leur avocat. Si c'est le cas, nous pouvons intervenir très en amont.

Seerius est une société d'investissement dans les PME suisses et européennes en succession familiale. Notre approche est opérationnelle : après acquisition, nos équipes auditent les processus de chaque entreprise, identifient les leviers de productivité et les concrétisent — avec le support de l'intelligence artificielle là où elle apporte une vraie valeur.

Un échange de 20 minutes pour se connaître ?

[Prénom Nom] — Seerius`,

  fiduciaire: `Objet : Vos clients cédants — Seerius x [Nom fiduciaire]

Madame, Monsieur,

Vous êtes souvent le premier confident d'un dirigeant qui pense à transmettre son entreprise. Vous voyez les comptes, vous connaissez la réalité de l'entreprise.

Seerius investit dans des PME suisses et européennes en succession familiale. Ce qui nous distingue : nous ne sommes pas des investisseurs passifs. Après chaque acquisition, nos équipes travaillent avec le management pour auditer les processus, identifier les gains de productivité réels et les déployer — avec des outils IA là où c'est justifié. L'objectif : une amélioration mesurable de l'EBITDA, documentée et publiée.

Si vous avez des clients qui réfléchissent à leur succession, nous serions un partenaire sérieux à leur présenter. 20 minutes pour se présenter ?

[Prénom Nom] — Seerius`,

  conseil_fiscal: `Objet : Cessions de PME — Seerius x [Cabinet fiscal]

Madame, Monsieur,

La réflexion fiscale précède souvent la décision de céder. Vos clients vous posent ces questions avant d'en parler ailleurs — c'est exactement à ce stade que nous pouvons intervenir ensemble.

Seerius investit dans des PME suisses et européennes en succession familiale. Notre rôle va au-delà du capital : après acquisition, nos équipes auditent les processus des entreprises, identifient les leviers de productivité et déploient des outils d'intelligence artificielle là où ils améliorent concrètement l'EBITDA. Votre expertise fiscale reste centrale dans la structuration de ces opérations.

Un échange de 20 minutes pour voir comment travailler ensemble ?

[Prénom Nom] — Seerius`,

  gestionnaire_fortune: `Objet : Opportunités PME suisses — Seerius x [Nom GFI]

Madame, Monsieur,

Certains de vos clients cherchent des placements dans l'économie réelle — des participations dans des PME suisses solides, hors des marchés cotés.

Seerius est une société d'investissement dans les PME suisses et européennes en succession familiale. Nous ne sommes pas des investisseurs passifs : après chaque acquisition, nos équipes s'impliquent opérationnellement pour auditer les processus, identifier les leviers de productivité et les déployer avec des outils IA là où c'est pertinent.

Seriez-vous disponible pour un échange ?

[Prénom Nom] — Seerius`,

  asset_manager: `Objet : Opportunités PME suisses et européennes — Seerius x [Nom AM]

Madame, Monsieur,

Seerius est une société d'investissement dans les PME suisses et européennes en succession familiale. Notre différence : après chaque acquisition, nos équipes travaillent directement avec le management — audit des processus, refonte des workflows, déploiement d'outils IA là où ils créent de la valeur réelle. Pas du capital passif.

Nous pourrions échanger sur des opportunités de co-investissement correspondant à vos stratégies. Un échange de 20 minutes ?

[Prénom Nom] — Seerius`,

  family_office: `Objet : Investissement direct PME — Seerius x [Family Office]

Madame, Monsieur,

Seerius investit dans des PME suisses et européennes en succession familiale — des entreprises solides, hors des marchés cotés, avec une vraie création de valeur opérationnelle.

Notre particularité : après chaque acquisition, nos équipes auditent les processus, identifient les vrais leviers de productivité et les déploient — avec des outils d'intelligence artificielle là où c'est pertinent. L'objectif est une amélioration mesurable de l'EBITDA, documentée et publiée.

Seriez-vous ouverts à un échange confidentiel ?

[Prénom Nom] — Seerius`,

  multi_family_office: `Objet : Co-investissement PME suisses — Seerius x [MFO]

Madame, Monsieur,

Seerius investit dans des PME suisses et européennes en succession familiale. Pour les familles que vous gérez, nous pouvons représenter une source d'accès à des opportunités dans l'économie réelle — avec une approche opérationnelle qui va au-delà du capital.

Après chaque acquisition, nos équipes s'impliquent directement : audit des processus, identification des gains de productivité, déploiement d'outils IA là où ils améliorent l'EBITDA. Une création de valeur mesurable et documentée.

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
