import { useState } from 'react'
import './App.css'
import SegmentPanel from './components/SegmentPanel.jsx'
import SynthesisPanel from './components/SynthesisPanel.jsx'
import DealPanel from './components/DealPanel.jsx'
import CampaignPanel from './components/CampaignPanel.jsx'

// source: 'zefix' | 'static' | 'brave'
const SEGMENTS = [
  {
    id: 'banque_cantonale',
    label: 'Banques cantonales',
    icon: '🏦',
    source: 'static',
    description: 'Équipes PME, Corporate Finance et Transmission des banques cantonales suisses',
  },
  {
    id: 'banque_privee',
    label: 'Banques privées',
    icon: '🔐',
    source: 'finma',
    description: 'Banques privées et régionales licenciées FINMA — catégorie 4 (62 entités)',
  },
  {
    id: 'banque_affaires',
    label: "Banques d'affaires",
    icon: '💼',
    source: 'finma',
    description: "Banques et maisons de titres licenciées FINMA — catégorie 5 (170 entités)",
  },
  {
    id: 'fiduciaire',
    label: 'Fiduciaires',
    icon: '📊',
    source: 'zefix',
    description: 'Fiduciaires et cabinets comptables suisses (code NOGA 6920)',
  },
  {
    id: 'avocat',
    label: 'Avocats',
    icon: '⚖️',
    source: 'zefix',
    description: "Cabinets d'avocats suisses spécialisés M&A / corporate (code NOGA 6910)",
  },
  {
    id: 'gestionnaire_fortune',
    label: 'Gestionnaires de fortune',
    icon: '📈',
    source: 'finma',
    description: 'Gestionnaires de fortune et trustees licenciés FINMA — registre officiel (1 508 entités)',
  },
  {
    id: 'asset_manager',
    label: 'Asset Managers',
    icon: '🏗️',
    source: 'finma',
    description: 'Directions de fonds, gestionnaires de fortune collective et représentants licenciés FINMA (431 entités)',
  },
  {
    id: 'family_office',
    label: 'Family Offices',
    icon: '🏛️',
    source: 'brave',
    description: 'Single et multi family offices suisses — source Brave Search (noms souvent opaques dans ZEFIX)',
  },
  {
    id: 'multi_family_office',
    label: 'Multi Family Offices',
    icon: '🌐',
    source: 'brave',
    description: 'Multi family offices (MFO) suisses gérant plusieurs familles — source Brave Search',
  },
  {
    id: 'notaire',
    label: 'Notaires',
    icon: '📜',
    source: 'zefix',
    description: 'Offices et études notariales suisses — registre ZEFIX (mots-clés notaire, notariat, notar)',
  },
  {
    id: 'conseil_fiscal',
    label: 'Conseils fiscaux',
    icon: '🧾',
    source: 'zefix',
    description: 'Cabinets de conseil fiscal et tax advisory suisses — registre ZEFIX',
  },
]

const SYNTHESIS_ID = '__synthesis__'
const DEALS_ID     = '__deals__'
const CAMPAIGN_ID  = '__campaign__'

export default function App() {
  const [activeSegment, setActiveSegment] = useState(SYNTHESIS_ID)

  const segment    = SEGMENTS.find((s) => s.id === activeSegment)
  const isSynthesis = activeSegment === SYNTHESIS_ID
  const isDeals     = activeSegment === DEALS_ID
  const isCampaign  = activeSegment === CAMPAIGN_ID

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <img src="/seerius-logo.svg" alt="Seerius" className="header-logo-img" />
            <div className="header-divider" />
            <div className="header-product">
              <span className="product-name">SCOUT</span>
              <span className="product-tag">Swiss Contact & Opportunity Unlock Tool</span>
            </div>
          </div>
          <p className="header-tagline">
            Your Swiss deal network. Mapped and activated.
          </p>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab tab--synthesis ${isSynthesis ? 'tab--active' : ''}`}
          onClick={() => setActiveSegment(SYNTHESIS_ID)}
        >
          <span>📊</span>
          <span>Synthèse</span>
        </button>
        <button
          className={`tab tab--synthesis ${isDeals ? 'tab--active' : ''}`}
          onClick={() => setActiveSegment(DEALS_ID)}
        >
          <span>🤝</span>
          <span>Deals</span>
        </button>
        <button
          className={`tab tab--synthesis ${isCampaign ? 'tab--active' : ''}`}
          onClick={() => setActiveSegment(CAMPAIGN_ID)}
        >
          <span>📣</span>
          <span>Campagnes</span>
        </button>
        <div className="tabs-divider" />
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            className={`tab ${activeSegment === s.id ? 'tab--active' : ''}`}
            onClick={() => setActiveSegment(s.id)}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      <main className="main">
        {isSynthesis  && <SynthesisPanel onNavigate={(id) => setActiveSegment(id)} />}
        {isDeals      && <DealPanel      onNavigate={(id) => setActiveSegment(id)} />}
        {isCampaign   && <CampaignPanel  onNavigate={(id) => setActiveSegment(id)} />}
        {segment      && <SegmentPanel   segment={segment} />}
      </main>
    </div>
  )
}
