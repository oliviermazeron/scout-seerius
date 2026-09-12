import { useState, useEffect } from 'react'
import './App.css'
import SegmentPanel from './components/SegmentPanel.jsx'
import SynthesisPanel from './components/SynthesisPanel.jsx'
import DealPanel from './components/DealPanel.jsx'
import CampaignPanel from './components/CampaignPanel.jsx'

const SEGMENTS = [
  {
    id: 'banque_cantonale',
    label: 'Banques cantonales',
    icon: '🏦',
    source: 'static',
    group: 'banques',
    description: 'Équipes PME, Corporate Finance et Transmission des banques cantonales suisses',
  },
  {
    id: 'banque_privee',
    label: 'Banques privées',
    icon: '🔐',
    source: 'finma',
    group: 'banques',
    description: 'Banques privées et régionales licenciées FINMA — catégorie 4 (62 entités)',
  },
  {
    id: 'banque_affaires',
    label: "Banques d'affaires",
    icon: '💼',
    source: 'finma',
    group: 'banques',
    description: "Banques et maisons de titres licenciées FINMA — catégorie 5 (170 entités)",
  },
  {
    id: 'gestionnaire_fortune',
    label: 'Gestionnaires de fortune',
    icon: '📈',
    source: 'finma',
    group: 'gestion',
    description: 'Gestionnaires de fortune et trustees licenciés FINMA — registre officiel (1 508 entités)',
  },
  {
    id: 'asset_manager',
    label: 'Asset Managers',
    icon: '🏗️',
    source: 'finma',
    group: 'gestion',
    description: 'Directions de fonds, gestionnaires de fortune collective et représentants licenciés FINMA (431 entités)',
  },
  {
    id: 'family_office',
    label: 'Family Offices',
    icon: '🏛️',
    source: 'brave',
    group: 'gestion',
    description: 'Single et multi family offices suisses — source Brave Search',
  },
  {
    id: 'multi_family_office',
    label: 'Multi Family Offices',
    icon: '🌐',
    source: 'brave',
    group: 'gestion',
    description: 'Multi family offices (MFO) suisses gérant plusieurs familles — source Brave Search',
  },
  {
    id: 'avocat',
    label: 'Avocats',
    icon: '⚖️',
    source: 'zefix',
    group: 'juridique',
    description: "Cabinets d'avocats suisses spécialisés M&A / corporate (code NOGA 6910)",
  },
  {
    id: 'notaire',
    label: 'Notaires',
    icon: '📜',
    source: 'zefix',
    group: 'juridique',
    description: 'Offices et études notariales suisses — registre ZEFIX',
  },
  {
    id: 'fiduciaire',
    label: 'Fiduciaires',
    icon: '📊',
    source: 'zefix',
    group: 'juridique',
    description: 'Fiduciaires et cabinets comptables suisses (code NOGA 6920)',
  },
  {
    id: 'conseil_fiscal',
    label: 'Conseils fiscaux',
    icon: '🧾',
    source: 'zefix',
    group: 'juridique',
    description: 'Cabinets de conseil fiscal et tax advisory suisses — registre ZEFIX',
  },
]

const GROUPS = [
  { id: 'banques',   label: '🏦 Banques',             desc: 'Cantonales · Privées · D\'affaires' },
  { id: 'gestion',   label: '💼 Gestion de patrimoine', desc: 'GFI · Asset Managers · Family Offices' },
  { id: 'juridique', label: '⚖️ Juridique & Fiscal',   desc: 'Avocats · Notaires · Fiduciaires · Conseils' },
]

const SYNTHESIS_ID = '__synthesis__'
const DEALS_ID     = '__deals__'
const CAMPAIGN_ID  = '__campaign__'

const NOTICE_KEY = 'scout_notice_dismissed'

export default function App() {
  const [activeSegment, setActiveSegment]   = useState(SYNTHESIS_ID)
  const [openGroups, setOpenGroups]         = useState({})
  const [noticeDismissed, setNoticeDismissed] = useState(
    () => localStorage.getItem(NOTICE_KEY) === '1'
  )
  const [showGuide, setShowGuide] = useState(false)

  const segment    = SEGMENTS.find((s) => s.id === activeSegment)
  const isSynthesis = activeSegment === SYNTHESIS_ID
  const isDeals     = activeSegment === DEALS_ID
  const isCampaign  = activeSegment === CAMPAIGN_ID
  const isSegment   = !!segment

  function navigate(id) {
    setActiveSegment(id)
    // auto-open the group containing this segment
    const seg = SEGMENTS.find(s => s.id === id)
    if (seg) setOpenGroups(prev => ({ ...prev, [seg.group]: true }))
  }

  function toggleGroup(gid) {
    setOpenGroups(prev => ({ ...prev, [gid]: !prev[gid] }))
  }

  function dismissNotice() {
    setNoticeDismissed(true)
    localStorage.setItem(NOTICE_KEY, '1')
  }

  function restoreNotice() {
    setNoticeDismissed(false)
    localStorage.removeItem(NOTICE_KEY)
  }

  // current group label for breadcrumb
  const activeGroup = segment ? GROUPS.find(g => g.id === segment.group) : null

  return (
    <div className="app">

      {/* ══ HEADER ══ */}
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <img src="/seerius-logo.svg" alt="Seerius" className="header-logo-img" />
            <div className="header-divider" />
            <div className="header-product">
              <span className="product-name">SCOUT</span>
              <span className="product-tag">Swiss Financial Intelligence Platform</span>
            </div>
          </div>
          <div className="header-right">
            <p className="header-tagline">600 000 entités indexées · 26 cantons</p>
            {!noticeDismissed ? (
              <button className="btn-notice-hide" onClick={dismissNotice} title="Masquer la notice">
                Masquer la notice
              </button>
            ) : (
              <button className="btn-notice-restore" onClick={restoreNotice} title="Réafficher la notice">
                ℹ️ À propos
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ══ NOTICE ══ */}
      {!noticeDismissed && (
        <div className="scout-notice">
          <div className="notice-content">
            <div className="notice-col notice-col--desc">
              <p>
                <strong>600 000 entités indexées en temps réel.</strong> Identifiez les décideurs
                dans les banques, family offices et cabinets juridiques, et synchronisez-les
                directement dans <strong>HubSpot</strong>.
              </p>
            </div>
            <div className="notice-sep" />
            <div className="notice-col">
              <div className="notice-section-label">Sources de données</div>
              <ul className="notice-sources">
                <li><span className="ndot" />ZEFIX · Registre du commerce CH · 600 000+ sociétés</li>
                <li><span className="ndot" />FINMA · Registres officiels · GFI, banques, asset managers</li>
                <li><span className="ndot" />LinkedIn · Décideurs et dirigeants</li>
                <li><span className="ndot" />Brave Search · Détection de domaines web</li>
              </ul>
            </div>
            <div className="notice-sep" />
            <div className="notice-col">
              <div className="notice-section-label">Workflow</div>
              <ol className="notice-steps">
                <li><div><strong>Choisir un segment</strong><span>Banques, GFI, Juridique…</span></div></li>
                <li><div><strong>Trouver les décideurs</strong><span>Enrichissement LinkedIn</span></div></li>
                <li><div><strong>Contacter &amp; HubSpot</strong><span>Push CRM + tâches</span></div></li>
              </ol>
            </div>
          </div>
          <div className="notice-footer">
            <div className="notice-stats">
              <span><strong>11</strong> segments</span>
              <span className="nstat-sep" />
              <span><strong>600 000+</strong> entités indexées</span>
              <span className="nstat-sep" />
              <span><strong>26</strong> cantons couverts</span>
            </div>
            <div className="notice-actions">
              <button className="btn-guide" onClick={() => setShowGuide(true)}>Comment ça marche →</button>
              <button className="btn-notice-close" onClick={dismissNotice}>Ne plus afficher ×</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ LAYOUT PRINCIPAL ══ */}
      <div className="layout">

        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          {/* Back to home */}
          {!isSynthesis && (
            <button className="btn-back-home" onClick={() => setActiveSegment(SYNTHESIS_ID)}>
              ← Accueil
            </button>
          )}

          {/* Onglets spéciaux */}
          <div className="sidebar-special">
            <button
              className={`sidebar-special-btn ${isSynthesis ? 'active' : ''}`}
              onClick={() => setActiveSegment(SYNTHESIS_ID)}
            >
              <span>📊</span> Synthèse
            </button>
            <button
              className={`sidebar-special-btn ${isDeals ? 'active' : ''}`}
              onClick={() => setActiveSegment(DEALS_ID)}
            >
              <span>🤝</span> Deals
            </button>
            <button
              className={`sidebar-special-btn ${isCampaign ? 'active' : ''}`}
              onClick={() => setActiveSegment(CAMPAIGN_ID)}
            >
              <span>📣</span> Campagnes
            </button>
          </div>

          <div className="sidebar-divider" />

          {/* Groupes accordéon */}
          {GROUPS.map(g => {
            const segs = SEGMENTS.filter(s => s.group === g.id)
            const isOpen = openGroups[g.id]
            const hasActive = segs.some(s => s.id === activeSegment)
            return (
              <div key={g.id} className={`sidebar-group ${hasActive ? 'sidebar-group--active' : ''}`}>
                <button
                  className={`sidebar-group-header ${isOpen || hasActive ? 'open' : ''}`}
                  onClick={() => toggleGroup(g.id)}
                >
                  <span className="sidebar-group-label">{g.label}</span>
                  <span className="sidebar-group-chevron">{isOpen || hasActive ? '▾' : '▸'}</span>
                </button>
                <div className="sidebar-group-desc">{g.desc}</div>
                {(isOpen || hasActive) && (
                  <div className="sidebar-items">
                    {segs.map(s => (
                      <button
                        key={s.id}
                        className={`sidebar-item ${activeSegment === s.id ? 'active' : ''}`}
                        onClick={() => navigate(s.id)}
                      >
                        <span className="sidebar-item-icon">{s.icon}</span>
                        <span className="sidebar-item-label">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </aside>

        {/* ── MAIN ── */}
        <main className="main">
          {/* Breadcrumb */}
          {isSegment && (
            <div className="breadcrumb">
              <button className="breadcrumb-home" onClick={() => setActiveSegment(SYNTHESIS_ID)}>Accueil</button>
              <span className="breadcrumb-sep">›</span>
              {activeGroup && <span className="breadcrumb-group">{activeGroup.label}</span>}
              <span className="breadcrumb-sep">›</span>
              <span className="breadcrumb-current">{segment.icon} {segment.label}</span>
            </div>
          )}

          {isSynthesis && <SynthesisPanel onNavigate={navigate} />}
          {isDeals     && <DealPanel      onNavigate={navigate} />}
          {isCampaign  && <CampaignPanel  onNavigate={navigate} />}
          {isSegment   && <SegmentPanel   segment={segment} />}
        </main>
      </div>

      {/* ══ MODAL GUIDE ══ */}
      {showGuide && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowGuide(false)}>
          <div className="modal">
            <div className="modal-head">
              <h2>Guide rapide — SCOUT</h2>
              <button className="btn-modal-close" onClick={() => setShowGuide(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="guide-step">
                <div className="guide-num">1</div>
                <div>
                  <h3>Choisir un segment métier</h3>
                  <p>Sélectionnez un type de prospect dans la barre latérale : Banques privées, GFI, Family Offices, Avocats… Chaque segment charge automatiquement les sociétés suisses correspondantes depuis ZEFIX et les registres FINMA.</p>
                </div>
              </div>
              <div className="guide-step">
                <div className="guide-num">2</div>
                <div>
                  <h3>Trouver les décideurs</h3>
                  <p>Sélectionnez des sociétés et cliquez "Trouver les décideurs". L'outil identifie les CEO, CFO et directeurs via LinkedIn et trouve leurs coordonnées email. Le score de pertinence (5 points) vous aide à prioriser.</p>
                </div>
              </div>
              <div className="guide-step">
                <div className="guide-num">3</div>
                <div>
                  <h3>Pousser vers HubSpot</h3>
                  <p>Les contacts qualifiés (score ≥ 4/5) sont envoyés directement dans votre CRM HubSpot avec des tâches d'email pré-rédigées, prêtes à envoyer.</p>
                </div>
              </div>
              <div className="guide-tip">
                💡 Utilisez la <strong>Synthèse</strong> pour suivre votre avancement global sur tous les segments, et les <strong>Campagnes</strong> pour piloter votre pipeline relationnel.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
