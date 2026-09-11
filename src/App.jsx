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
    description: 'Boutiques M&A et banques d\'affaires suisses spécialisées en transactions PME',
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
    description: 'Cabinets d\'avocats suisses spécialisés M&A / corporate (code NOGA 6910)',
  },
]

export default function App() {
  const [activeSegment, setActiveSegment] = useState(SEGMENTS[0].id)

  const segment = SEGMENTS.find((s) => s.id === activeSegment)

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-name">SCOUT</span>
            <span className="logo-by">by Seerius</span>
          </div>
          <p className="header-desc">Sourcing de contacts intermédiaires financiers et juridiques suisses</p>
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
