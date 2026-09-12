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

// ─── Templates email par segment ─────────────────────────────────────────────
const TEMPLATES = {
  fiduciaire: `Objet : Collaboration M&A — Seerius x [Nom fiduciaire]

Madame, Monsieur,

En tant que fiduciaire, vous êtes souvent le premier à accompagner vos clients dans des moments clés — notamment lorsqu'un dirigeant envisage une transmission ou une cession.

Seerius est une boutique M&A suisse spécialisée dans l'accompagnement des PME lors de cessions, acquisitions et levées de fonds. Nous intervenons en amont de la transaction et travaillons en étroite collaboration avec les conseils de nos clients.

Nous serions ravis d'explorer comment nous pouvons nous référer mutuellement des opportunités au bénéfice de vos clients.

Seriez-vous disponible pour un échange de 20 minutes ?

Cordialement,
[Votre nom] — Seerius`,

  avocat: `Objet : Partenariat M&A — Seerius x [Nom cabinet]

Madame, Monsieur,

Votre cabinet intervient régulièrement dans des opérations de cession et d'acquisition d'entreprises en Suisse. Seerius accompagne les cédants et acquéreurs en amont : valorisation, structuration, identification de contreparties.

Nous cherchons à nouer des relations avec des avocats spécialisés M&A / corporate pour échanger sur des opportunités communes.

Seriez-vous disponible pour un café ou un appel de 20 minutes ?

Cordialement,
[Votre nom] — Seerius`,

  notaire: `Objet : Collaboration transmissions — Seerius x [Nom étude]

Madame, Monsieur,

Les transmissions d'entreprises passent souvent par votre étude pour leur formalisation. Seerius intervient en amont pour préparer et structurer ces transactions.

Nous serions heureux d'explorer une collaboration sur des dossiers communs, pour le bénéfice de vos clients.

Seriez-vous disponible pour un échange de 20 minutes ?

Cordialement,
[Votre nom] — Seerius`,

  banque_privee: `Objet : Opportunités post-cession — Seerius x [Nom banque]

Madame, Monsieur,

Vos clients entrepreneurs qui cèdent leur entreprise cherchent souvent, dans un second temps, un accompagnement patrimonial. Seerius les accompagne dans la phase de cession et peut vous les présenter au moment opportun.

À l'inverse, certains de vos clients patrimoniaux recherchent des opportunités d'investissement dans des PME suisses. Nous pouvons vous tenir informés de nos mandats actifs.

Un échange serait-il possible ?

Cordialement,
[Votre nom] — Seerius`,

  banque_affaires: `Objet : Co-advisory M&A — Seerius x [Nom banque]

Madame, Monsieur,

Seerius est une boutique M&A dédiée aux PME suisses (cessions, acquisitions, levées de fonds). Nous cherchons à collaborer avec des banques d'affaires sur des mandats complémentaires — que ce soit en co-advisory ou en référencement réciproque.

Seriez-vous disponible pour un échange de 20 minutes ?

Cordialement,
[Votre nom] — Seerius`,

  gestionnaire_fortune: `Objet : Opportunités PME suisses — Seerius x [Nom GFI]

Madame, Monsieur,

Certains de vos clients investisseurs recherchent des placements alternatifs dans l'économie réelle — notamment des participations dans des PME suisses rentables.

Seerius gère des mandats de cession de PME suisses et peut vous présenter des opportunités d'investissement correspondant à vos critères.

Seriez-vous disponible pour un échange ?

Cordialement,
[Votre nom] — Seerius`,

  asset_manager: `Objet : Opportunités PME — Seerius x [Nom AM]

Madame, Monsieur,

Seerius accompagne des PME suisses dans leurs opérations de cession et de levée de fonds. Nous pourrions vous présenter des opportunités correspondant à vos stratégies d'investissement.

Un échange de 20 minutes serait-il possible ?

Cordialement,
[Votre nom] — Seerius`,

  family_office: `Objet : Opportunités d'investissement direct — Seerius x [Family Office]

Madame, Monsieur,

Vous gérez des investissements pour compte propre ou pour des familles d'entrepreneurs. Seerius peut vous proposer des opportunités d'investissement direct dans des PME suisses de qualité, en amont ou en parallèle de leur cession.

Seriez-vous ouverts à un échange confidentiel ?

Cordialement,
[Votre nom] — Seerius`,

  multi_family_office: `Objet : Co-investissement PME suisses — Seerius x [MFO]

Madame, Monsieur,

Dans le cadre de vos mandats multi-familles, vous êtes régulièrement sollicités pour des opportunités d'investissement alternatif. Seerius gère des mandats de cession de PME suisses rentables et peut vous en présenter en exclusivité.

Seriez-vous disponible pour un échange ?

Cordialement,
[Votre nom] — Seerius`,

  fiduciaire_default: `Objet : Collaboration M&A — Seerius

Madame, Monsieur,

Seerius accompagne des entrepreneurs suisses dans leurs projets de transmission et d'acquisition. Nous serions ravis d'explorer une collaboration pour le bénéfice de vos clients.

Cordialement,
[Votre nom] — Seerius`,

  conseil_fiscal: `Objet : Collaboration transmissions — Seerius x [Cabinet fiscal]

Madame, Monsieur,

Les transmissions d'entreprises ont souvent des enjeux fiscaux significatifs pour vos clients. Seerius intervient en amont pour structurer et préparer ces transactions, en coordination avec les conseils fiscaux.

Nous serions heureux d'explorer une collaboration sur des dossiers communs.

Seriez-vous disponible pour un échange de 20 minutes ?

Cordialement,
[Votre nom] — Seerius`,
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
