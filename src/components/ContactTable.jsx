import { useState } from 'react'
import './ContactTable.css'

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

  function toggleSelect(uid) {
    setSelected((prev) => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function toggleExpand(uid) {
    setExpanded((prev) => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function toggleAll() {
    setSelected(selected.size === companies.length ? new Set() : new Set(companies.map((c) => c.uid || c.name)))
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
            <th>Enrichir (Hunter)</th>
            <th>Company →HS</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => {
            const key = c.uid || c.name
            const domain = c.website
              ? new URL(c.website).hostname.replace('www.', '')
              : null
            const isExpanded = expanded.has(key)

            return (
              <>
                <tr key={key} className={selected.has(key) ? 'row--selected' : ''}>
                  <td><input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(key)} /></td>
                  <td>
                    <span className="company-name">
                      {c.website ? (
                        <a href={c.website} target="_blank" rel="noreferrer">{c.name}</a>
                      ) : c.excerptUrl ? (
                        <a href={c.excerptUrl} target="_blank" rel="noreferrer">{c.name}</a>
                      ) : c.name}
                    </span>
                    {domain && <span className="domain-tag">{domain}</span>}
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
                      className={`btn-expand ${isExpanded ? 'btn-expand--open' : ''}`}
                      onClick={() => toggleExpand(key)}
                      title={isExpanded ? 'Masquer' : 'Voir les contacts'}
                    >
                      {isExpanded ? '▲ Masquer' : '▼ Contacts'}
                    </button>
                  </td>
                  <td><HubSpotButton company={c} segment={segment} /></td>
                </tr>
                {isExpanded && (
                  <tr key={`${key}-enrich`} className="enrich-row">
                    <td colSpan={7}>
                      <EnrichRow key={`${key}-enrich`} domain={domain} segment={segment} companyName={c.name} />
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
