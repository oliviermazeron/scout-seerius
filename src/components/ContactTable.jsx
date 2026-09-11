import { useState } from 'react'
import './ContactTable.css'

// ─── Bouton "Push HubSpot" pour un seul contact ──────────────────────────────
function HubSpotButton({ company, segment }) {
  const [status, setStatus] = useState('idle') // idle | loading | done | error

  async function handlePush() {
    setStatus('loading')
    try {
      const res = await fetch('/api/hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: company.name,
          canton: company.canton ?? '',
          uid: company.uid ?? '',
          segment,
          // domain sera enrichi via Hunter.io plus tard
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') return <span className="badge badge--green">✓ Poussé</span>
  if (status === 'error') return <span className="badge badge--red">Erreur</span>

  return (
    <button
      className="btn-hubspot"
      onClick={handlePush}
      disabled={status === 'loading'}
    >
      {status === 'loading' ? '…' : 'HubSpot →'}
    </button>
  )
}

// ─── Tableau principal ────────────────────────────────────────────────────────
export default function ContactTable({ companies, segment }) {
  const [selected, setSelected] = useState(new Set())
  const [pushingAll, setPushingAll] = useState(false)

  function toggleSelect(uid) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === companies.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(companies.map((c) => c.uid)))
    }
  }

  async function pushSelected() {
    setPushingAll(true)
    const targets = companies.filter((c) => selected.has(c.uid))
    await Promise.allSettled(
      targets.map((c) =>
        fetch('/api/hubspot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: c.name,
            canton: c.canton ?? '',
            uid: c.uid ?? '',
            segment,
          }),
        })
      )
    )
    setPushingAll(false)
    setSelected(new Set())
  }

  return (
    <div className="table-wrapper">
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
          <button
            className="btn-bulk-push"
            onClick={pushSelected}
            disabled={pushingAll}
          >
            {pushingAll ? 'Envoi…' : `Push ${selected.size} vers HubSpot`}
          </button>
        </div>
      )}

      <table className="contact-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={selected.size === companies.length && companies.length > 0}
                onChange={toggleAll}
              />
            </th>
            <th>Société</th>
            <th>Forme</th>
            <th>Siège</th>
            <th>Canton</th>
            <th>Statut</th>
            <th>UID</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c.uid} className={selected.has(c.uid) ? 'row--selected' : ''}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.has(c.uid)}
                  onChange={() => toggleSelect(c.uid)}
                />
              </td>
              <td>
                <span className="company-name">
                  {c.excerptUrl ? (
                    <a href={c.excerptUrl} target="_blank" rel="noreferrer">
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}
                </span>
              </td>
              <td>{c.legalForm}</td>
              <td>{c.municipality}</td>
              <td>{c.canton ?? '—'}</td>
              <td>
                <span className={`badge ${c.status === 'active' ? 'badge--green' : 'badge--red'}`}>
                  {c.status}
                </span>
              </td>
              <td className="uid">{c.uid}</td>
              <td>
                <HubSpotButton company={c} segment={segment} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
