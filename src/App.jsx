import { useState } from 'react'
import './App.css'
import SegmentPanel from './components/SegmentPanel.jsx'

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
    source: 'zefix',
    description: 'Banques privées et établissements de private banking actifs en Suisse',
  },
  {
    id: 'banque_affaires',
    label: "Banques d'affaires",
    icon: '💼',
    source: 'zefix',
    description: "Boutiques M&A et banques d'affaires suisses spécialisées en transactions PME",
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
    source: 'zefix',
    description: 'Gérants de fortune indépendants (GFI) et gérants de patrimoine suisses licenciés FINMA',
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
]

export default function App() {
  const [activeSegment, setActiveSegment] = useState(SEGMENTS[0].id)

  const segment = SEGMENTS.find((s) => s.id === activeSegment)

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
        <SegmentPanel segment={segment} />
      </main>
    </div>
  )
}
