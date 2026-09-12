import './SynthesisPanel.css'

// Totaux de base connus (statique / FINMA)
const BASE_COUNTS = {
  banque_cantonale:      26,
  banque_privee:         62,
  banque_affaires:       170,
  gestionnaire_fortune:  1508,
  asset_manager:         431,
  fiduciaire:            null, // dynamique ZEFIX
  avocat:                null,
  family_office:         null,
  multi_family_office:   null,
}

const SEGMENT_LABELS = {
  banque_cantonale:      { label: 'Banques cantonales',       icon: '🏦' },
  banque_privee:         { label: 'Banques privées',          icon: '🔐' },
  banque_affaires:       { label: "Banques d'affaires",       icon: '💼' },
  fiduciaire:            { label: 'Fiduciaires',              icon: '📊' },
  avocat:                { label: 'Avocats',                  icon: '⚖️' },
  gestionnaire_fortune:  { label: 'Gestionnaires de fortune', icon: '📈' },
  asset_manager:         { label: 'Asset Managers',           icon: '🏗️' },
  family_office:         { label: 'Family Offices',           icon: '🏛️' },
  multi_family_office:   { label: 'Multi Family Offices',     icon: '🌐' },
}

function readLS(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') } catch { return {} }
}

function StatBar({ value, max, color }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="stat-bar-wrap" title={`${value} / ${max ?? '?'} (${pct}%)`}>
      <div className="stat-bar-bg">
        <div className="stat-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="stat-bar-label">{value}{max ? ` / ${max}` : ''}</span>
    </div>
  )
}

export default function SynthesisPanel({ onNavigate }) {
  const segments = Object.keys(SEGMENT_LABELS)

  const rows = segments.map((id) => {
    const domains   = readLS(`scout_domains_${id}`)
    const zefix     = readLS(`scout_zefix_${id}`)
    const linkedin  = readLS(`scout_linkedin_${id}`)

    const domainsCount  = Object.keys(domains).length
    const zefixCount    = Object.keys(zefix).length
    const linkedinCount = Object.values(linkedin).reduce((acc, emps) => acc + (emps?.length ?? 0), 0)
    const linkedinCos   = Object.values(linkedin).filter((e) => e?.length > 0).length
    const base          = BASE_COUNTS[id]

    return { id, domainsCount, zefixCount, linkedinCount, linkedinCos, base }
  })

  const totals = {
    domains:  rows.reduce((a, r) => a + r.domainsCount, 0),
    zefix:    rows.reduce((a, r) => a + r.zefixCount, 0),
    linkedin: rows.reduce((a, r) => a + r.linkedinCount, 0),
    cos:      rows.reduce((a, r) => a + r.linkedinCos, 0),
  }

  return (
    <div className="synthesis">
      <div className="synthesis-header">
        <h2>Vue d'ensemble</h2>
        <p className="synthesis-sub">Données enrichies en cache — par segment</p>
      </div>

      {/* ── KPIs globaux ── */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-value">{totals.domains}</span>
          <span className="kpi-label">Domaines trouvés</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{totals.zefix}</span>
          <span className="kpi-label">Matchs ZEFIX</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{totals.cos}</span>
          <span className="kpi-label">Sociétés avec décideurs</span>
        </div>
        <div className="kpi-card kpi-card--gold">
          <span className="kpi-value">{totals.linkedin}</span>
          <span className="kpi-label">Décideurs LinkedIn trouvés</span>
        </div>
      </div>

      {/* ── Tableau par segment ── */}
      <div className="synthesis-table-wrap">
        <table className="synthesis-table">
          <thead>
            <tr>
              <th>Segment</th>
              <th>Base</th>
              <th>Domaines enrichis</th>
              <th>Matchs ZEFIX</th>
              <th>Décideurs LinkedIn</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const { icon, label } = SEGMENT_LABELS[r.id]
              const hasData = r.domainsCount > 0 || r.zefixCount > 0 || r.linkedinCount > 0
              return (
                <tr key={r.id} className={hasData ? '' : 'row--empty'}>
                  <td>
                    <span className="seg-icon">{icon}</span>
                    <span className="seg-label">{label}</span>
                  </td>
                  <td className="cell-center">
                    {r.base != null ? <span className="base-count">{r.base}</span> : <span className="text-muted">—</span>}
                  </td>
                  <td>
                    {r.domainsCount > 0
                      ? <StatBar value={r.domainsCount} max={r.base} color="#c9a266" />
                      : <span className="text-muted">—</span>}
                  </td>
                  <td>
                    {r.zefixCount > 0
                      ? <StatBar value={r.zefixCount} max={r.base} color="#1a3a5c" />
                      : <span className="text-muted">—</span>}
                  </td>
                  <td>
                    {r.linkedinCount > 0
                      ? <span className="linkedin-count">🔗 {r.linkedinCount} ({r.linkedinCos} sociétés)</span>
                      : <span className="text-muted">—</span>}
                  </td>
                  <td>
                    <button className="btn-goto" onClick={() => onNavigate(r.id)}>
                      Ouvrir →
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totals.domains === 0 && totals.linkedin === 0 && (
        <div className="synthesis-empty">
          Aucune donnée enrichie pour l'instant. Lance une recherche dans un segment et enrichis des sociétés pour voir apparaître les stats ici.
        </div>
      )}
    </div>
  )
}
