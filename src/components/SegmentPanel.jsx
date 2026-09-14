import { useState, useRef } from 'react'
import { searchIntermediaries, LEGAL_FORMS } from '../services/zefixService.js'
import { searchByBrave } from '../services/braveSegmentService.js'
import { getBanquesCantonales } from '../services/banquesCantonales.js'
import { searchFinmaGFI } from '../services/finmaService.js'
import ContactTable from './ContactTable.jsx'
import CantonPicker from './CantonPicker.jsx'
import './SegmentPanel.css'

// Badge source
const SOURCE_BADGE = {
  static: null,
  zefix:  { label: 'ZEFIX',        color: '#1a3a5c' },
  brave:  { label: 'Brave Search', color: '#8B4F1A' },
  finma:  { label: 'FINMA',        color: '#8B1A1A' },
}

// ─── Recherche directe ZEFIX par nom ─────────────────────────────────────────
function ZefixDirectSearch({ onAdd }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/zefix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/firm/search.json', name: query.trim(), maxEntries: 10, activeOnly: true }),
      })
      const data = await res.json()
      setResults(data.list ?? [])
    } catch { setResults([]) }
    finally { setLoading(false) }
  }

  function addCompany(c) {
    const canton = detectCantonFromUrl(c.cantonalExcerptWeb ?? '')
    onAdd({
      name: c.name,
      uid: c.uidFormatted ?? c.uid ?? '',
      legalFormId: c.legalFormId,
      legalForm: LEGAL_FORMS[c.legalFormId] ?? '—',
      municipality: c.legalSeat ?? '',
      canton,
      excerptUrl: c.cantonalExcerptWeb ?? '',
      status: c.status === 'EXISTIEREND' ? 'active' : 'radié',
      website: null,
      contacts: [],
    })
    setResults([])
    setQuery('')
    inputRef.current?.focus()
  }

  return (
    <div className="direct-search">
      <form className="direct-search-form" onSubmit={handleSearch}>
        <input
          ref={inputRef}
          className="direct-search-input"
          placeholder="🔍 Ajouter une société par nom (ex: GVA Tax)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn-direct-search" type="submit" disabled={loading}>
          {loading ? '…' : 'Rechercher'}
        </button>
      </form>
      {results.length > 0 && (
        <div className="direct-results">
          {results.map((c) => {
            const canton = detectCantonFromUrl(c.cantonalExcerptWeb ?? '')
            return (
              <div key={c.uid} className="direct-result-row">
                <div className="direct-result-info">
                  <span className="direct-result-name">{c.name}</span>
                  <span className="direct-result-meta">
                    {LEGAL_FORMS[c.legalFormId] ?? '—'} · {c.legalSeat ?? '—'} {canton ? `(${canton})` : ''}
                  </span>
                </div>
                <button className="btn-add-direct" onClick={() => addCompany(c)}>+ Ajouter</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const CANTON_URL_PATTERNS = {
  VD: ['vd.ch'], GE: ['ge.ch', 'rcge.ch'], NE: ['ne.ch'], FR: ['fr.ch'],
  VS: ['vs.ch'], ZH: ['zh.ch'], BE: ['be.ch'], BS: ['bs.ch'], BL: ['bl.ch'],
  AG: ['ag.ch'], SG: ['sg.ch'], LU: ['lu.ch'], ZG: ['zg.ch'], SO: ['so.ch'],
  TI: ['ti.ch'], GR: ['gr.ch'], SH: ['sh.ch'], TG: ['tg.ch'], SZ: ['sz.ch'],
  JU: ['ju.ch'], UR: ['ur.ch'], OW: ['ow.ch'], NW: ['nw.ch'], GL: ['gl.ch'],
  AR: ['ar.ch'], AI: ['ai.ch'],
}
function detectCantonFromUrl(url) {
  const u = url.toLowerCase()
  for (const [c, patterns] of Object.entries(CANTON_URL_PATTERNS)) {
    if (patterns.some((p) => u.includes(p))) return c
  }
  return null
}

export default function SegmentPanel({ segment, onNavigate }) {
  const [cantons, setCantons] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)

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
      } else if (segment.source === 'finma') {
        data = searchFinmaGFI({ cantons, segment: segment.id })
      } else {
        data = await searchIntermediaries({ segment: segment.id, cantons, limit: 500 })
      }
      setResults(data)
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function addManual(company) {
    setResults((prev) => {
      const exists = prev.some((c) => (c.uid || c.name) === (company.uid || company.name))
      if (exists) return prev
      return [company, ...prev]
    })
    if (!searched) setSearched(true)
  }

  // Reset quand on change d'onglet
  if (!searched && results.length > 0) setResults([])

  const badge = SOURCE_BADGE[segment.source]
  const btnLabel = segment.source === 'static'
    ? '🏦 Afficher les banques cantonales'
    : segment.source === 'brave'
    ? '🌐 Lancer la recherche'
    : segment.source === 'finma'
    ? '📋 Charger le registre FINMA'
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
        <CantonPicker value={cantons} onChange={setCantons} />
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

      <ZefixDirectSearch onAdd={addManual} />

      {results.length > 0 && (
        <ContactTable companies={results} segment={segment.id} onNavigate={onNavigate} />
      )}

      {searched && !loading && results.length === 0 && !error && (
        <div className="empty">Aucun résultat pour cette combinaison segment / canton.</div>
      )}
    </div>
  )
}
