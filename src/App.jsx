import { useState } from 'react'
import './App.css'
import SegmentPanel from './components/SegmentPanel.jsx'

const SEGMENTS = [
  {
    id: 'banque_cantonale',
    label: 'Banques cantonales',
    icon: '🏦',
    description: 'Équipes PME, Corporate Finance et Transmission des banques cantonales suisses',
  },
  {
    id: 'banque_affaires',
    label: "Banques d'affaires",
    icon: '💼',
    description: "Boutiques M&A et banques d'affaires suisses spécialisées en transactions PME",
  },
  {
    id: 'fiduciaire',
    label: 'Fiduciaires',
    icon: '📊',
    description: 'Fiduciaires et cabinets comptables suisses (code NOGA 6920)',
  },
  {
    id: 'avocat',
    label: 'Avocats',
    icon: '⚖️',
    description: "Cabinets d'avocats suisses spécialisés M&A / corporate (code NOGA 6910)",
  },
]

// ─── Logo Seerius SVG ─────────────────────────────────────────────────────────
function SeeriusLogo({ size = 28 }) {
  return (
    <svg width={size * 3.6} height={size} viewBox="0 0 130 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Lettres SEERIUS en style rounded */}
      <text
        x="0" y="26"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontWeight="700"
        fontSize="28"
        letterSpacing="2"
        fill="white"
      >SEERIUS</text>
      {/* Étoile 4 branches au-dessus du S final */}
      <g transform="translate(105, 3)">
        <path d="M4 0 L5 3.5 L8.5 4 L5 4.5 L4 8 L3 4.5 L-0.5 4 L3 3.5 Z" fill="#c9a266"/>
      </g>
    </svg>
  )
}

export default function App() {
  const [activeSegment, setActiveSegment] = useState(SEGMENTS[0].id)

  const segment = SEGMENTS.find((s) => s.id === activeSegment)

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <div className="header-logo">
              <SeeriusLogo size={24} />
            </div>
            <div className="header-divider" />
            <div className="header-product">
              <span className="product-name">SCOUT</span>
              <span className="product-tag">Intelligence Réseau</span>
            </div>
          </div>
          <p className="header-tagline">
            Sourcez vos intermédiaires suisses — banques, fiduciaires, avocats, family offices
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
