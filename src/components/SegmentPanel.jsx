import { useState } from 'react'
import { searchIntermediaries } from '../services/zefixService.js'
import { searchByBrave } from '../services/braveSegmentService.js'
import { getBanquesCantonales } from '../services/banquesCantonales.js'
import ContactTable from './ContactTable.jsx'
import './SegmentPanel.css'

const ALL_CANTONS = [
  'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR',
  'JU','LU','NE','NW','OW','SG','SH','SO','SZ','TG',
  'TI','UR','VD','VS','ZG','ZH',
]

// Badge source
const SOURCE_BADGE = {
  static: null,
  zefix:  { label: 'ZEFIX',        color: '#1a3a5c' },
  brave:  { label: 'Brave Search', color: '#8B4F1A' },
}

export default function SegmentPanel({ segment }) {
  const [cantons, setCantons] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)

  function toggleCanton(c) {
    setCantons((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    )
  }

  async function handleSearch() {
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      let data
      if (segment.source === 'static') {
        data = getBanquesCantonales({ cantons })
      } else if (segment.source === 'brave') {
        data = await searchByBrave({ category: segment.id, cantons })
      } else {
        data = await searchIntermediaries({ segment: segment.id, cantons, limit: 50 })
      }
      setResults(data)
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Reset quand on change d'onglet
  if (!searched && results.length > 0) setResults([])

  const badge = SOURCE_BADGE[segment.source]
  const btnLabel = segment.source === 'static'
    ? '🏦 Afficher les banques cantonales'
    : segment.source === 'brave'
    ? '🌐 Lancer la recherche'
    : '🔍 Lancer la recherche'

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            {segment.icon} {segment.label}
            {badge && (
              <span className="source-badge" style={{ background: badge.color }}>
                {badge.label}
              </span>
            )}
          </h2>
          <p className="panel-desc">{segment.description}</p>
        </div>
      </div>

      {/* Filtre cantons */}
      <div className="filters">
        <span className="filter-label">Filtrer par canton :</span>
        <div className="canton-grid">
          {ALL_CANTONS.map((c) => (
            <button
              key={c}
              className={`canton-btn ${cantons.includes(c) ? 'canton-btn--on' : ''}`}
              onClick={() => toggleCanton(c)}
            >
              {c}
            </button>
          ))}
        </div>
        {cantons.length > 0 && (
          <button className="btn-clear" onClick={() => setCantons([])}>
            Effacer la sélection ({cantons.length})
          </button>
        )}
      </div>

      <div className="search-bar">
        <button className="btn-search" onClick={handleSearch} disabled={loading}>
          {loading ? 'Chargement…' : btnLabel}
        </button>
        {searched && !loading && (
          <span className="result-count">
            {results.length} résultat{results.length !== 1 ? 's' : ''}
            {cantons.length > 0 ? ` · cantons : ${cantons.join(', ')}` : ' · tous cantons'}
          </span>
        )}
      </div>

      {error && <div className="error-box">⚠️ {error}</div>}

      {results.length > 0 && (
        <ContactTable companies={results} segment={segment.id} />
      )}

      {searched && !loading && results.length === 0 && !error && (
        <div className="empty">Aucun résultat pour cette combinaison segment / canton.</div>
      )}
    </div>
  )
}
