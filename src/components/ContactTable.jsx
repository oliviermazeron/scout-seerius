import { useState, useCallback, useMemo } from 'react'
import './ContactTable.css'

// ─── Score de pertinence (0-5) ────────────────────────────────────────────────
function relevanceScore(c, domain, zefix) {
  let s = 0
  if (domain)                                      s++ // domaine connu
  if (zefix?.uid || c.uid)                         s++ // UID ZEFIX
  const lf = zefix?.legalForm ?? c.legalForm
  if (lf && lf !== '—')                            s++ // forme juridique
  if ((c.status ?? zefix?.status) === 'active')    s++ // statut actif
  if (zefix?.canton ?? c.canton)                   s++ // canton
  return s
}

function ScoreDots({ score }) {
  const colors = ['#e2e2de', '#e2e2de', '#e2e2de', '#e2e2de', '#e2e2de']
  for (let i = 0; i < score; i++) {
    colors[i] = score >= 4 ? '#1a6b45' : score >= 2 ? '#c9a266' : '#8b1a1a'
  }
  return (
    <span className="score-dots" title={`Score de complétude : ${score}/5`}>
      {colors.map((c, i) => (
        <span key={i} style={{ background: c }} className="score-dot" />
      ))}
    </span>
  )
}

// ─── Bouton lookup ZEFIX (enrichissement UID + forme jur.) ───────────────────
function ZefixLookupBtn({ company, onFound }) {
  const [status, setStatus] = useState('idle')

  async function handleLookup() {
    setStatus('loading')
    try {
      const res = await fetch('/api/zefix-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: company.name, canton: company.canton }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.found) { onFound(data); setStatus('done') }
      else setStatus('notfound')
    } catch { setStatus('error') }
  }

  if (status === 'done')     return null
  if (status === 'loading')  return <span className="enrich-status">🔍…</span>
  if (status === 'notfound') return <span className="badge badge--red" title="Introuvable dans ZEFIX">?</span>
  if (status === 'error')    return <span className="badge badge--red">!</span>
  return (
    <button className="btn-zefix-lookup" onClick={handleLookup} title="Vérifier dans ZEFIX">
      🔗 ZEFIX
    </button>
  )
}

// ─── Bouton recherche domaine via Brave Search ────────────────────────────────
function BraveSearchBtn({ company, onDomainFound }) {
  const [status, setStatus] = useState('idle')

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
      if (data.domain) { onDomainFound(data.domain); setStatus('done') }
      else setStatus('error')
    } catch { setStatus('error') }
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
function LinkedInRow({ domain, segment, companyName, preloaded }) {
  const [status, setStatus]       = useState(preloaded ? 'done' : 'idle')
  const [employees, setEmployees] = useState(preloaded ?? [])
  const [pushStates, setPushStates] = useState({})

  async function handleSearch() {
    if (!domain && !companyName) return
    setStatus('loading')
    try {
      const res = await fetch('/api/proxycurl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain ?? '', companyName }),
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

  if (status === 'idle')    return <button className="btn-enrich btn-linkedin" onClick={handleSearch}>🔗 LinkedIn</button>
  if (status === 'loading') return <span className="enrich-status">Recherche LinkedIn…</span>
  if (status === 'error')   return <span className="badge badge--red">Erreur NinjaPear</span>
  if (employees.length === 0) return (
    <span className="enrich-status">
      Aucun décideur{domain ? ` · ${domain}` : ''}{companyName ? ` · ${companyName}` : ''}
    </span>
  )

  return (
    <div className="contacts-list">
      <div className="contacts-list-header">
        {employees.length} décideur{employees.length > 1 ? 's' : ''} trouvé{employees.length > 1 ? 's' : ''}
      </div>
      {employees.map((e) => {
        const key = `${e.firstName}|${e.lastName}`
        const sourceBadge = e.source === 'brave' ? '🌐' : e.source === 'ninjapear-name' ? '🏢' : '🔗'
        const sourceTitle = e.source === 'brave' ? 'Via Brave Search' : e.source === 'ninjapear-name' ? 'Via nom (NinjaPear)' : 'Via domaine (NinjaPear)'
        return (
          <div key={key} className="contact-row">
            <div className="contact-info">
              <span className="contact-name">{e.firstName} {e.lastName}</span>
              {e.role && <span className="contact-pos">{e.role}</span>}
              {e.profileUrl
                ? <a href={e.profileUrl} target="_blank" rel="noreferrer" className="contact-email" title={sourceTitle}>{sourceBadge} LinkedIn</a>
                : <span className="contact-pos" title={sourceTitle}>{sourceBadge}</span>
              }
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
  const [status, setStatus] = useState('idle')
  const [contacts, setContacts] = useState([])
  const [pushStates, setPushStates] = useState({})

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
          _contact: {
            email:     contact.email,
            firstname: contact.firstName ?? '',
            lastname:  contact.lastName ?? '',
            jobtitle:  contact.position ?? '',
            company:   companyName,
          },
        }),
      })
      if (!res.ok) throw new Error()
      setPushStates((s) => ({ ...s, [contact.email]: 'done' }))
    } catch {
      setPushStates((s) => ({ ...s, [contact.email]: 'error' }))
    }
  }

  if (!domain) return <span className="no-domain">Domaine inconnu</span>
  if (status === 'idle')    return <button className="btn-enrich" onClick={handleEnrich}>🔍 Enrichir</button>
  if (status === 'loading') return <span className="enrich-status">Recherche…</span>
  if (status === 'error')   return <span className="badge badge--red">Erreur Hunter</span>
  if (contacts.length === 0) return <span className="enrich-status">Aucun email trouvé pour {domain}</span>

  return (
    <div className="contacts-list">
      <div className="contacts-list-header">
        {contacts.length} contact{contacts.length > 1 ? 's' : ''} sur {domain}
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
            {pushStates[c.email] === 'loading' ? '…' : pushStates[c.email] === 'done' ? '✓' : pushStates[c.email] === 'error' ? '!' : '→ HS'}
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
    } catch { setStatus('error') }
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
  const [selected, setSelected]     = useState(new Set())
  const [expanded, setExpanded]     = useState(new Set())
  const [pushingAll, setPushingAll] = useState(false)

  // Filtres internes
  const [filterName,      setFilterName]      = useState('')
  const [filterForm,      setFilterForm]      = useState('')
  const [filterStatus,    setFilterStatus]    = useState('')
  const [sortKey,         setSortKey]         = useState('score') // score | name

  // Persistance localStorage
  const [zefixData, setZefixData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`scout_zefix_${segment}`) ?? '{}') } catch { return {} }
  })
  const handleZefixFound = useCallback((uid, data) => {
    setZefixData((prev) => {
      const next = { ...prev, [uid]: data }
      try { localStorage.setItem(`scout_zefix_${segment}`, JSON.stringify(next)) } catch {}
      return next
    })
  }, [segment])

  const [foundDomains, setFoundDomains] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`scout_domains_${segment}`) ?? '{}') } catch { return {} }
  })
  const handleDomainFound = useCallback((uid, domain) => {
    setFoundDomains((prev) => {
      const next = { ...prev, [uid]: domain }
      try { localStorage.setItem(`scout_domains_${segment}`, JSON.stringify(next)) } catch {}
      return next
    })
  }, [segment])

  const [linkedinData, setLinkedinData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`scout_linkedin_${segment}`) ?? '{}') } catch { return {} }
  })
  const handleLinkedinFound = useCallback((uid, employees) => {
    setLinkedinData((prev) => {
      const next = { ...prev, [uid]: employees }
      try { localStorage.setItem(`scout_linkedin_${segment}`, JSON.stringify(next)) } catch {}
      return next
    })
  }, [segment])

  // ── Formes juridiques disponibles (pour le filtre) ────────────────────────
  const availableForms = useMemo(() => {
    const forms = new Set()
    companies.forEach((c) => {
      const lf = c.legalForm
      if (lf && lf !== '—') forms.add(lf)
    })
    return [...forms].sort()
  }, [companies])

  // ── Filtrage + tri ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = companies.map((c) => {
      const key    = c.uid || c.name
      const domain = foundDomains[key] ?? (c.website ? new URL(c.website).hostname.replace('www.', '') : null)
      const zefix  = zefixData[key] ?? {}
      return { ...c, _key: key, _domain: domain, _zefix: zefix, _score: relevanceScore(c, domain, zefix) }
    })

    if (filterName)   list = list.filter((c) => c.name.toLowerCase().includes(filterName.toLowerCase()))
    if (filterForm)   list = list.filter((c) => (c._zefix.legalForm ?? c.legalForm) === filterForm)
    if (filterStatus) list = list.filter((c) => c.status === filterStatus)

    if (sortKey === 'score') list = [...list].sort((a, b) => b._score - a._score)
    else list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr'))

    return list
  }, [companies, filterName, filterForm, filterStatus, sortKey, foundDomains, zefixData])

  function toggleSelect(uid) {
    setSelected((prev) => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((c) => c._key)))
  }

  function exportCSV() {
    const rows = [
      ['Score', 'Société', 'Forme', 'Canton', 'Ville', 'Domaine', 'Statut', 'UID', 'Extrait'],
      ...filtered.map((c) => [
        c._score,
        c.name,
        c._zefix.legalForm ?? c.legalForm ?? '',
        c._zefix.canton ?? c.canton ?? '',
        c.municipality ?? '',
        c._domain ?? '',
        c.status ?? '',
        c.uid ?? '',
        c.excerptUrl ?? '',
      ]),
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

  const [enriching, setEnriching] = useState(false)
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0, step: '' })

  async function enrichSelected() {
    const targets = filtered.filter((c) => selected.has(c._key))
    setEnriching(true)
    setEnrichProgress({ done: 0, total: targets.length, step: 'ZEFIX' })

    // Étape 1 : ZEFIX
    await Promise.allSettled(targets.map(async (c) => {
      if (!zefixData[c._key] && (c.legalForm === '—' || !c.legalForm)) {
        try {
          const r = await fetch('/api/zefix-lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: c.name, canton: c.canton }),
          })
          const d = await r.json()
          if (d.found) handleZefixFound(c._key, d)
        } catch {}
      }
    }))

    setEnrichProgress((p) => ({ ...p, step: 'Domaine' }))

    // Étape 2 : Brave Search (domaine)
    await Promise.allSettled(targets.map(async (c) => {
      if (!c._domain) {
        try {
          const r = await fetch('/api/brave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: c.name, canton: c.canton }),
          })
          const d = await r.json()
          if (d.domain) handleDomainFound(c._key, d.domain)
        } catch {}
      }
    }))

    setEnrichProgress((p) => ({ ...p, step: 'LinkedIn', done: 0 }))

    // Étape 3 : LinkedIn (NinjaPear) — séquentiel pour éviter de saturer l'API
    for (const c of targets) {
      if (!linkedinData[c._key]) {
        try {
          const currentDomain = foundDomains[c._key] ?? c._domain
          const r = await fetch('/api/proxycurl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: currentDomain ?? '', companyName: c.name }),
          })
          const d = await r.json()
          if (d.employees) handleLinkedinFound(c._key, d.employees)
        } catch {}
      }
      setEnrichProgress((p) => ({ ...p, done: p.done + 1 }))
    }

    setEnriching(false)
    setEnrichProgress({ done: 0, total: 0, step: '' })
  }

  async function pushSelected() {
    setPushingAll(true)
    const targets = filtered.filter((c) => selected.has(c._key))
    await Promise.allSettled(targets.map((c) =>
      fetch('/api/hubspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: c.name,
          domain: c._domain ?? undefined,
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
      {/* ── Barre export ── */}
      <div className="table-actions">
        <button className="btn-export-csv" onClick={exportCSV}>
          ⬇ Export CSV ({filtered.length})
        </button>
      </div>

      {/* ── Filtres internes ── */}
      <div className="table-filters">
        <input
          className="filter-input"
          placeholder="🔍 Filtrer par nom…"
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
        />
        {availableForms.length > 0 && (
          <select className="filter-select" value={filterForm} onChange={(e) => setFilterForm(e.target.value)}>
            <option value="">Toutes formes</option>
            {availableForms.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
        <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="active">Actif</option>
          <option value="radié">Radié</option>
        </select>
        <select className="filter-select" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          <option value="score">Tri : Score ↓</option>
          <option value="name">Tri : Nom A→Z</option>
        </select>
        {(filterName || filterForm || filterStatus) && (
          <button className="btn-clear-filters" onClick={() => { setFilterName(''); setFilterForm(''); setFilterStatus('') }}>
            ✕ Réinitialiser
          </button>
        )}
        <span className="filter-count">{filtered.length} / {companies.length}</span>
      </div>

      {/* ── Barre actions groupées ── */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
          <button className="btn-bulk-enrich" onClick={enrichSelected} disabled={enriching || pushingAll}>
            {enriching
              ? `⚡ ${enrichProgress.step} ${enrichProgress.done}/${enrichProgress.total}…`
              : `⚡ Enrichir (${selected.size})`}
          </button>
          <button className="btn-bulk-push" onClick={pushSelected} disabled={pushingAll || enriching}>
            {pushingAll ? 'Envoi…' : `→ HS (${selected.size})`}
          </button>
        </div>
      )}

      <table className="contact-table">
        <thead>
          <tr>
            <th><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
            <th>Score</th>
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
          {filtered.map((c) => {
            const { _key: key, _domain: domain, _zefix: zefix, _score: score } = c
            const legalForm  = zefix.legalForm ?? c.legalForm
            const canton     = zefix.canton ?? c.canton
            const excerptUrl = zefix.excerptUrl ?? c.excerptUrl
            const isExpanded = expanded.has(key)
            const preloadedLinkedin = linkedinData[key] ?? null

            return (
              <>
                <tr key={key} className={selected.has(key) ? 'row--selected' : ''}>
                  <td><input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(key)} /></td>
                  <td><ScoreDots score={score} /></td>
                  <td>
                    <span className="company-name">
                      {domain ? (
                        <a href={`https://${domain}`} target="_blank" rel="noreferrer">{c.name}</a>
                      ) : excerptUrl ? (
                        <a href={excerptUrl} target="_blank" rel="noreferrer">{c.name}</a>
                      ) : c.website ? (
                        <a href={c.website} target="_blank" rel="noreferrer">{c.name}</a>
                      ) : c.name}
                    </span>
                    {domain
                      ? <span className="domain-tag">{domain}</span>
                      : <BraveSearchBtn company={c} onDomainFound={(d) => handleDomainFound(key, d)} />
                    }
                  </td>
                  <td>
                    {legalForm === '—' || !legalForm
                      ? <ZefixLookupBtn company={{ ...c, canton }} onFound={(d) => handleZefixFound(key, d)} />
                      : legalForm}
                  </td>
                  <td>{canton ?? '—'}</td>
                  <td>
                    <span className={`badge ${c.status === 'active' ? 'badge--green' : 'badge--red'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn-expand ${expanded.has(`${key}:hunter`) ? 'btn-expand--open' : ''}`}
                      onClick={() => setExpanded((prev) => { const n = new Set(prev); const k2 = `${key}:hunter`; n.has(k2) ? n.delete(k2) : n.add(k2); return n })}
                    >
                      {expanded.has(`${key}:hunter`) ? '▲ Emails' : '▼ Emails'}
                    </button>
                  </td>
                  <td>
                    <button
                      className={`btn-expand ${expanded.has(`${key}:linkedin`) ? 'btn-expand--open' : ''}`}
                      onClick={() => setExpanded((prev) => { const n = new Set(prev); const k2 = `${key}:linkedin`; n.has(k2) ? n.delete(k2) : n.add(k2); return n })}
                    >
                      {preloadedLinkedin
                        ? (expanded.has(`${key}:linkedin`) ? '▲ LinkedIn' : `🔗 ${preloadedLinkedin.length} décideur${preloadedLinkedin.length !== 1 ? 's' : ''}`)
                        : (expanded.has(`${key}:linkedin`) ? '▲ LinkedIn' : '🔗 LinkedIn')}
                    </button>
                  </td>
                  <td><HubSpotButton company={c} segment={segment} /></td>
                </tr>
                {expanded.has(`${key}:hunter`) && (
                  <tr key={`${key}-enrich`} className="enrich-row">
                    <td colSpan={9}>
                      <EnrichRow domain={domain} segment={segment} companyName={c.name} />
                    </td>
                  </tr>
                )}
                {expanded.has(`${key}:linkedin`) && (
                  <tr key={`${key}-linkedin`} className="enrich-row">
                    <td colSpan={9}>
                      <LinkedInRow
                        domain={domain}
                        segment={segment}
                        companyName={c.name}
                        preloaded={preloadedLinkedin}
                      />
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
