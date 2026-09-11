import { useState } from 'react'
import { searchIntermediaries } from '../services/zefixService.js'
import { getBanquesCantonales } from '../services/banquesCantonales.js'
import ContactTable from './ContactTable.jsx'
import './SegmentPanel.css'

const ALL_CANTONS = [
  'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR',
  'JU','LU','NE','NW','OW','SG','SH','SO','SZ','TG',
  'TI','UR','VD','VS','ZG','ZH',
]

export default function SegmentPanel({ segment }) {
  const [cantons, setCantons] = useState([])   // [] = tous
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
      if (segment.id === 'banque_cantonale') {
        // Liste fixe — pas besoin de ZEFIX (les banques cantonales sont connues)
        data = getBanquesCantonales({ cantons })
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

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            {segment.icon} {segment.label}
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
          {loading
            ? 'Chargement…'
            : segment.id === 'banque_cantonale'
            ? '🏦 Afficher les banques cantonales'
            : '🔍 Lancer la recherche ZEFIX'}
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
