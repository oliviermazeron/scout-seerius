import { useState, useCallback } from 'react'
import './ContactTable.css'

// ─── Bouton recherche domaine via Brave Search ────────────────────────────────
function BraveSearchBtn({ company, onDomainFound }) {
  const [status, setStatus] = useState('idle') // idle | loading | done | error

  async function handleSearch() {
    setStatus('loading')
    try {
      const res = await fetch('/api/brave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: company.name, canton: company.canton }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.domain) {
        onDomainFound(data.domain)
        setStatus('done')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done')    return null
  if (status === 'loading') return <span className="enrich-status">🔍…</span>
  if (status === 'error')   return <span className="badge badge--red" title="Introuvable">?</span>
  return (
    <button className="btn-brave" onClick={handleSearch} title="Trouver le site web via Brave Search">
      🌐
    </button>
  )
}

// ─── Ligne enrichissement LinkedIn (NinjaPear) ────────────────────────────────
function LinkedInRow({ domain, segment, companyName }) {
  const [status, setStatus]   = useState('idle') // idle | loading | done | error
  const [employees, setEmployees] = useState([])
  const [pushStates, setPushStates] = useState({})

  async function handleSearch() {
    if (!domain) return
    setStatus('loading')
    try {
      const res = await fetch('/api/proxycurl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setEmployees(data.employees ?? [])
      setStatus('done')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  async function pushEmployee(emp) {
    const emailKey = `${emp.firstName}|${emp.lastName}`
    setPushStates((s) => ({ ...s, [emailKey]: 'loading' }))
    try {
      const res = await fetch('/api/hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName,
          domain,
          segment,
          _contact: {
            firstname: emp.firstName ?? '',
            lastname:  emp.lastName ?? '',
            jobtitle:  emp.role ?? '',
            company:   companyName,
          },
        }),
      })
      if (!res.ok) throw new Error()
      setPushStates((s) => ({ ...s, [emailKey]: 'done' }))
    } catch {
      setPushStates((s) => ({ ...s, [emailKey]: 'error' }))
    }
  }

  if (!domain) return <span className="no-domain">Domaine inconnu</span>
  if (status === 'idle')    return <button className="btn-enrich btn-linkedin" onClick={handleSearch}>🔗 LinkedIn</button>
  if (status === 'loading') return <span className="enrich-status">Recherche LinkedIn…</span>
  if (status === 'error')   return <span className="badge badge--red">Erreur NinjaPear</span>
  if (employees.length === 0) return <span className="enrich-status">Aucun décideur trouvé pour {domain}</span>

  return (
    <div className="contacts-list">
      <div className="contacts-list-header">
        {employees.length} décideur{employees.length > 1 ? 's' : ''} trouvé{employees.length > 1 ? 's' : ''} via LinkedIn
      </div>
      {employees.map((e) => {
        const key = `${e.firstName}|${e.lastName}`
        return (
          <div key={key} className="contact-row">
            <div className="contact-info">
              <span className="contact-name">{e.firstName} {e.lastName}</span>
              {e.role && <span className="contact-pos">{e.role}</span>}
              {e.profileUrl && (
                <a href={e.profileUrl} target="_blank" rel="noreferrer" className="contact-email">
                  🔗 LinkedIn
                </a>
              )}
            </div>
            <button
              className={`btn-push-contact ${pushStates[key] === 'done' ? 'btn-push-contact--done' : ''}`}
              onClick={() => pushEmployee(e)}
              disabled={!!pushStates[key]}
            >
              {pushStates[key] === 'loading' ? '…' : pushStates[key] === 'done' ? '✓' : pushStates[key] === 'error' ? '!' : '→ HS'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Ligne d'enrichissement Hunter.io ────────────────────────────────────────
function EnrichRow({ domain, segment, companyName }) {
  const [status, setStatus] = useState('idle')  // idle | loading | done | error
  const [contacts, setContacts] = useState([])
  const [pushStates, setPushStates] = useState({}) // email → 'idle'|'loading'|'done'|'error'

  async function handleEnrich() {
    setStatus('loading')
    try {
      const res = await fetch('/api/hunter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, limit: 10 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setContacts(data.emails ?? [])
      setStatus('done')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  async function pushContact(contact) {
    setPushStates((s) => ({ ...s, [contact.email]: 'loading' }))
    try {
      const res = await fetch('/api/hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName,
          domain,
          segment,
          // On pousse aussi le contact individuellement (en tant que Contact HubSpot)
          _contact: {
            email: contact.email,
            firstname: contact.firstName ?? '',
            lastname: contact.lastName ?? '',
            jobtitle: contact.position ?? '',
            company: companyName,
          },
        }),
      })
      if (!res.ok) throw new Error()
      setPushStates((s) => ({ ...s, [contact.email]: 'done' }))
    } catch {
      setPushStates((s) => ({ ...s, [contact.email]: 'error' }))
    }
  }

  if (!domain) return (
    <span className="no-domain">Domaine inconnu</span>
  )

  if (status === 'idle') return (
    <button className="btn-enrich" onClick={handleEnrich}>
      🔍 Enrichir
    </button>
  )

  if (status === 'loading') return <span className="enrich-status">Recherche…</span>
  if (status === 'error')   return <span className="badge badge--red">Erreur Hunter</span>

  if (contacts.length === 0) return (
    <span className="enrich-status">Aucun email trouvé pour {domain}</span>
  )

  return (
    <div className="contacts-list">
      <div className="contacts-list-header">
        {contacts.length} contact{contacts.length > 1 ? 's' : ''} trouvé{contacts.length > 1 ? 's' : ''} sur {domain}
      </div>
      {contacts.map((c) => (
        <div key={c.email} className="contact-row">
          <div className="contact-info">
            <span className="contact-name">{c.firstName} {c.lastName}</span>
            {c.position && <span className="contact-pos">{c.position}</span>}
            <a href={`mailto:${c.email}`} className="contact-email">{c.email}</a>
            <span className="contact-conf">{c.confidence}%</span>
          </div>
          <button
            className={`btn-push-contact ${pushStates[c.email] === 'done' ? 'btn-push-contact--done' : ''}`}
            onClick={() => pushContact(c)}
            disabled={!!pushStates[c.email]}
          >
            {pushStates[c.email] === 'loading' ? '…'
              : pushStates[c.email] === 'done' ? '✓'
              : pushStates[c.email] === 'error' ? '!'
              : '→ HS'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Bouton "Push Company HubSpot" ───────────────────────────────────────────
function HubSpotButton({ company, segment }) {
  const [status, setStatus] = useState('idle')

  async function handlePush() {
    setStatus('loading')
    try {
      const res = await fetch('/api/hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: company.name,
          domain: company.website ? new URL(company.website).hostname.replace('www.', '') : undefined,
          canton: company.canton ?? '',
          uid: company.uid ?? '',
          segment,
        }),
      })
      if (!res.ok) throw new Error()
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done')  return <span className="badge badge--green">✓ Poussé</span>
  if (status === 'error') return <span className="badge badge--red">Erreur</span>
  return (
    <button className="btn-hubspot" onClick={handlePush} disabled={status === 'loading'}>
      {status === 'loading' ? '…' : 'HS →'}
    </button>
  )
}

// ─── Tableau principal ────────────────────────────────────────────────────────
export default function ContactTable({ companies, segment }) {
  const [selected, setSelected]   = useState(new Set())
  const [expanded, setExpanded]   = useState(new Set())
  const [pushingAll, setPushingAll] = useState(false)
  // Domaines trouvés via Brave — persistés en localStorage par segment
  const [foundDomains, setFoundDomains] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`scout_domains_${segment}`) ?? '{}')
    } catch { return {} }
  })

  const handleDomainFound = useCallback((uid, domain) => {
    setFoundDomains((prev) => {
      const next = { ...prev, [uid]: domain }
      try { localStorage.setItem(`scout_domains_${segment}`, JSON.stringify(next)) } catch {}
      return next
    })
  }, [segment])

  function toggleSelect(uid) {
    setSelected((prev) => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function toggleExpand(uid) {
    setExpanded((prev) => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function toggleAll() {
    setSelected(selected.size === companies.length ? new Set() : new Set(companies.map((c) => c.uid || c.name)))
  }

  function exportCSV() {
    const rows = [
      ['Société', 'Forme', 'Canton', 'Ville', 'Domaine', 'Statut', 'UID', 'Extrait'],
      ...companies.map((c) => {
        const domain = foundDomains[c.uid || c.name] ?? (c.website ? new URL(c.website).hostname.replace('www.', '') : '')
        return [
          c.name,
          c.legalForm ?? '',
          c.canton ?? '',
          c.municipality ?? '',
          domain,
          c.status ?? '',
          c.uid ?? '',
          c.excerptUrl ?? '',
        ]
      }),
    ]
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scout-${segment}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function pushSelected() {
    setPushingAll(true)
    const targets = companies.filter((c) => selected.has(c.uid || c.name))
    await Promise.allSettled(targets.map((c) =>
      fetch('/api/hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: c.name,
          domain: c.website ? new URL(c.website).hostname.replace('www.', '') : undefined,
          canton: c.canton ?? '',
          uid: c.uid ?? '',
          segment,
        }),
      })
    ))
    setPushingAll(false)
    setSelected(new Set())
  }

  return (
    <div className="table-wrapper">
      <div className="table-actions">
        <button className="btn-export-csv" onClick={exportCSV}>
          ⬇ Export CSV ({companies.length})
        </button>
      </div>
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
          <button className="btn-bulk-push" onClick={pushSelected} disabled={pushingAll}>
            {pushingAll ? 'Envoi…' : `Push ${selected.size} vers HubSpot`}
          </button>
        </div>
      )}

      <table className="contact-table">
        <thead>
          <tr>
            <th><input type="checkbox" checked={selected.size === companies.length && companies.length > 0} onChange={toggleAll} /></th>
            <th>Société</th>
            <th>Forme</th>
            <th>Canton</th>
            <th>Statut</th>
            <th>Emails (Hunter)</th>
            <th>Décideurs (LinkedIn)</th>
            <th>Company →HS</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => {
            const key = c.uid || c.name
            const domain = foundDomains[key]
              ?? (c.website ? new URL(c.website).hostname.replace('www.', '') : null)
            const isExpanded = expanded.has(key)

            return (
              <>
                <tr key={key} className={selected.has(key) ? 'row--selected' : ''}>
                  <td><input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(key)} /></td>
                  <td>
                    <span className="company-name">
                      {domain ? (
                        <a href={`https://${domain}`} target="_blank" rel="noreferrer">{c.name}</a>
                      ) : c.website ? (
                        <a href={c.website} target="_blank" rel="noreferrer">{c.name}</a>
                      ) : c.excerptUrl ? (
                        <a href={c.excerptUrl} target="_blank" rel="noreferrer">{c.name}</a>
                      ) : c.name}
                    </span>
                    {domain
                      ? <span className="domain-tag">{domain}</span>
                      : <BraveSearchBtn company={c} onDomainFound={(d) => handleDomainFound(key, d)} />
                    }
                  </td>
                  <td>{c.legalForm}</td>
                  <td>{c.canton ?? '—'}</td>
                  <td>
                    <span className={`badge ${c.status === 'active' ? 'badge--green' : 'badge--red'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn-expand ${isExpanded === 'hunter' ? 'btn-expand--open' : ''}`}
                      onClick={() => setExpanded((prev) => { const n = new Set(prev); const k2 = `${key}:hunter`; n.has(k2) ? n.delete(k2) : n.add(k2); return n })}
                      title="Emails via Hunter.io"
                    >
                      {expanded.has(`${key}:hunter`) ? '▲ Emails' : '▼ Emails'}
                    </button>
                  </td>
                  <td>
                    <button
                      className={`btn-expand ${expanded.has(`${key}:linkedin`) ? 'btn-expand--open' : ''}`}
                      onClick={() => setExpanded((prev) => { const n = new Set(prev); const k2 = `${key}:linkedin`; n.has(k2) ? n.delete(k2) : n.add(k2); return n })}
                      title="Décideurs via LinkedIn"
                    >
                      {expanded.has(`${key}:linkedin`) ? '▲ LinkedIn' : '🔗 LinkedIn'}
                    </button>
                  </td>
                  <td><HubSpotButton company={c} segment={segment} /></td>
                </tr>
                {expanded.has(`${key}:hunter`) && (
                  <tr key={`${key}-enrich`} className="enrich-row">
                    <td colSpan={8}>
                      <EnrichRow key={`${key}-enrich`} domain={domain} segment={segment} companyName={c.name} />
                    </td>
                  </tr>
                )}
                {expanded.has(`${key}:linkedin`) && (
                  <tr key={`${key}-linkedin`} className="enrich-row">
                    <td colSpan={8}>
                      <LinkedInRow key={`${key}-linkedin`} domain={domain} segment={segment} companyName={c.name} />
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
