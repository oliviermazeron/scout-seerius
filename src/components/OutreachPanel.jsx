import { useState, useMemo } from 'react'
import {
  JURIDIQUE_SEGMENTS, OBJECTIVES, DEAL_CRITERIA_FIELDS, readTargets, writeTargets, readSender, writeSender,
  readSettings, writeSettings, readPipeline, setPipelineStatus, buildEmail, buildFollowUp,
} from '../services/outreach.js'
import { StatusSelect } from './ContactTable.jsx'
import './OutreachPanel.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fullName(c) {
  return [c?.firstName, c?.lastName].filter(Boolean).join(' ')
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, data }
}

// ─── Panneau d'édition d'une cible (destinataire + email) ────────────────────
function TargetEditor({ t, email, edited, hunter, pushState, followUp, onNavigate,
  onSearchDomain, onFindPerson, onChoose, onDraft, onPush }) {
  const [manual, setManual] = useState(() => ({
    firstName: t.contact?.firstName ?? '',
    lastName:  t.contact?.lastName ?? '',
    role:      t.contact?.role ?? '',
    email:     t.contact?.email ?? '',
  }))
  const [copied, setCopied] = useState(false)
  const domainSearch = hunter[t.id]
  const seg = JURIDIQUE_SEGMENTS[t.segment]

  function copy() {
    navigator.clipboard.writeText(`Objet : ${email.subject}\n\n${email.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="op-editor">
      {/* ── 1. Destinataire ── */}
      <div className="op-editor-col">
        <div className="op-editor-title">1 · Destinataire</div>

        {t.contact?.email ? (
          <div className="op-chosen">
            <strong>{fullName(t.contact) || t.contact.email}</strong>
            {t.contact.role && <span>{t.contact.role}</span>}
            <span className="op-chosen-email">{t.contact.email}</span>
          </div>
        ) : (
          <div className="op-hint">Choisissez un décideur ci-dessous : l'email sera personnalisé à son nom.</div>
        )}

        {t.decideurs?.length > 0 && (
          <div className="op-block">
            <div className="op-block-label">Décideurs LinkedIn</div>
            {t.decideurs.map((p) => {
              const k = `${t.id}|${fullName(p)}`
              const st = hunter[k]?.status
              return (
                <div key={k} className="op-person">
                  <div className="op-person-info">
                    <span className="op-person-name">{fullName(p)}</span>
                    {p.role && <span className="op-person-role">{p.role}</span>}
                  </div>
                  {st === 'loading' ? <span className="op-muted">Recherche…</span>
                    : st === 'notfound' ? <span className="op-muted">Email introuvable</span>
                    : st === 'error' ? <span className="op-error">Erreur Hunter</span>
                    : (
                      <button
                        className="op-btn-light"
                        onClick={() => onFindPerson(t, p)}
                        disabled={!t.domain}
                        title={t.domain ? `Chercher l'email de ${fullName(p)} sur ${t.domain} (Hunter)` : 'Domaine inconnu'}
                      >
                        ✉️ Trouver l'email
                      </button>
                    )}
                </div>
              )
            })}
          </div>
        )}

        <div className="op-block">
          <div className="op-block-label">Emails connus du domaine</div>
          {!t.domain ? (
            <div className="op-hint">
              Domaine inconnu. Trouvez-le via le bouton 🌐 dans le segment{' '}
              <button className="op-link" onClick={() => onNavigate(t.segment)}>{seg.label} →</button>
            </div>
          ) : !domainSearch ? (
            <button className="op-btn-light" onClick={() => onSearchDomain(t)}>🔍 Rechercher sur {t.domain}</button>
          ) : domainSearch.status === 'loading' ? (
            <span className="op-muted">Recherche Hunter…</span>
          ) : domainSearch.status === 'error' ? (
            <span className="op-error">Erreur Hunter</span>
          ) : domainSearch.emails.length === 0 ? (
            <span className="op-muted">Aucun email trouvé pour {t.domain}</span>
          ) : domainSearch.emails.map((e) => (
            <div key={e.email} className="op-person">
              <div className="op-person-info">
                <span className="op-person-name">{fullName(e) || e.email}</span>
                {e.position && <span className="op-person-role">{e.position}</span>}
                <span className="op-person-email">{e.email} · {e.confidence}%</span>
              </div>
              <button
                className="op-btn-light"
                disabled={t.contact?.email === e.email}
                onClick={() => onChoose(t, { firstName: e.firstName ?? '', lastName: e.lastName ?? '', role: e.position ?? '', email: e.email })}
              >
                {t.contact?.email === e.email ? '✓ Choisi' : 'Choisir'}
              </button>
            </div>
          ))}
        </div>

        <div className="op-block">
          <div className="op-block-label">Saisie manuelle</div>
          <div className="op-manual">
            <input placeholder="Prénom" value={manual.firstName} onChange={(e) => setManual({ ...manual, firstName: e.target.value })} />
            <input placeholder="Nom" value={manual.lastName} onChange={(e) => setManual({ ...manual, lastName: e.target.value })} />
            <input placeholder="Fonction" value={manual.role} onChange={(e) => setManual({ ...manual, role: e.target.value })} />
            <input placeholder="email@cabinet.ch" type="email" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value.trim() })} />
          </div>
          <button className="op-btn-light" disabled={!EMAIL_RE.test(manual.email)} onClick={() => onChoose(t, manual)}>
            Utiliser ce contact
          </button>
        </div>
      </div>

      {/* ── 2. Email ── */}
      <div className="op-editor-col">
        <div className="op-editor-title">2 · Email {edited && <span className="op-edited">modifié</span>}</div>
        <label className="op-field-label" htmlFor={`subject-${t.id}`}>Objet</label>
        <input
          id={`subject-${t.id}`}
          className="op-subject"
          value={email.subject}
          onChange={(e) => onDraft(t, { ...email, subject: e.target.value })}
        />
        <textarea
          className="op-body"
          value={email.body}
          rows={18}
          onChange={(e) => onDraft(t, { ...email, body: e.target.value })}
        />
        <div className="op-editor-actions">
          <button className="op-btn-light" onClick={copy}>{copied ? '✓ Copié' : '📋 Copier'}</button>
          {edited && <button className="op-btn-light" onClick={() => onDraft(t, null)}>↺ Revenir au modèle</button>}
          <span className="op-spacer" />
          <PushButton t={t} state={pushState} onPush={onPush} />
        </div>
        <div className="op-muted op-push-note">
          Crée le contact dans HubSpot + une tâche email à envoyer aujourd'hui
          {followUp ? ' + une relance à J+7' : ''}.
        </div>
      </div>
    </div>
  )
}

function PushButton({ t, state, onPush }) {
  if (state === 'loading') return <button className="op-btn-hs" disabled>Envoi…</button>
  const label = t.hubspot ? '↻ Recréer dans HubSpot' : '→ Créer dans HubSpot'
  return (
    <>
      {state && state !== 'done' && <span className="op-error" title={state}>⚠️ {state}</span>}
      <button
        className="op-btn-hs"
        disabled={!t.contact?.email}
        title={t.contact?.email ? '' : "Choisissez d'abord un destinataire avec email"}
        onClick={() => onPush(t)}
      >
        {label}
      </button>
    </>
  )
}

// ─── Page campagne ────────────────────────────────────────────────────────────
export default function OutreachPanel({ onNavigate }) {
  const [targets, setTargets]           = useState(readTargets)
  const [pipeline, setPipeline]         = useState(readPipeline)
  const [sender, setSender]             = useState(readSender)
  const [settings, setSettings]         = useState(readSettings)
  const [segFilter, setSegFilter]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected]         = useState(new Set())
  const [openId, setOpenId]             = useState(null)
  const [followUp, setFollowUp]         = useState(true)
  const [hunter, setHunter]             = useState({}) // id | id|nom → { status, emails }
  const [push, setPush]                 = useState({}) // id → 'loading' | 'done' | message d'erreur
  const [bulk, setBulk]                 = useState(null) // { done, total, ok, running }

  const all = Object.values(targets)
  const list = useMemo(() => Object.values(targets)
    .filter((t) => !segFilter || t.segment === segFilter)
    .filter((t) => {
      if (!statusFilter) return true
      if (statusFilter === 'todo') return !pipeline[t.id]
      return pipeline[t.id] === statusFilter
    })
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)),
  [targets, pipeline, segFilter, statusFilter])

  const stats = [
    { label: 'Cabinets ciblés', value: all.length },
    { label: 'Avec destinataire', value: all.filter((t) => t.contact?.email).length },
    { label: 'Dans HubSpot', value: all.filter((t) => t.hubspot).length },
    { label: 'RDV', value: all.filter((t) => pipeline[t.id] === 'RDV').length },
    { label: 'Partenaires', value: all.filter((t) => pipeline[t.id] === 'Partenaire').length },
  ]

  const selectedReady = list.filter((t) => selected.has(t.id) && t.contact?.email)

  // ── Mutations ───────────────────────────────────────────────────────────────
  function updateTarget(id, patch) {
    setTargets((prev) => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } }
      writeTargets(next)
      return next
    })
  }

  function removeTarget(id) {
    setTargets((prev) => {
      const next = { ...prev }
      delete next[id]
      writeTargets(next)
      return next
    })
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  function updateSender(field, value) {
    setSender((prev) => {
      const next = { ...prev, [field]: value }
      writeSender(next)
      return next
    })
  }

  function updateSettings(update) {
    setSettings((prev) => {
      const next = update(prev)
      writeSettings(next)
      return next
    })
  }
  const setObjective = (objective) => updateSettings((s) => ({ ...s, objective }))
  const setCriterion = (field, value) => updateSettings((s) => ({ ...s, criteria: { ...s.criteria, [field]: value } }))

  const changeStatus = (id, statut) => setPipeline(setPipelineStatus(id, statut))
  const chooseContact = (t, contact) => updateTarget(t.id, { contact, draft: null })
  // Un brouillon modifié n'est valable que pour l'objectif avec lequel il a été rédigé
  const isEdited = (t) => t.draft?.objective === settings.objective
  const setDraft = (t, draft) => updateTarget(t.id, { draft: draft && { ...draft, objective: settings.objective } })
  const emailFor = (t) => (isEdited(t) ? t.draft : buildEmail(t, t.contact, sender, settings))

  function toggleSelect(id) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected(selected.size === list.length ? new Set() : new Set(list.map((t) => t.id)))
  }

  // ── Hunter ──────────────────────────────────────────────────────────────────
  async function searchDomain(t) {
    setHunter((h) => ({ ...h, [t.id]: { status: 'loading', emails: [] } }))
    try {
      const { ok, data } = await postJSON('/api/hunter', { domain: t.domain, limit: 10 })
      if (!ok) throw new Error(data.error)
      setHunter((h) => ({ ...h, [t.id]: { status: 'done', emails: data.emails ?? [] } }))
    } catch {
      setHunter((h) => ({ ...h, [t.id]: { status: 'error', emails: [] } }))
    }
  }

  async function findPerson(t, person) {
    const k = `${t.id}|${fullName(person)}`
    setHunter((h) => ({ ...h, [k]: { status: 'loading' } }))
    try {
      const { data } = await postJSON('/api/hunter', {
        domain: t.domain, first_name: person.firstName, last_name: person.lastName,
      })
      if (!data.email) {
        setHunter((h) => ({ ...h, [k]: { status: data.error ? 'error' : 'notfound' } }))
        return
      }
      setHunter((h) => ({ ...h, [k]: { status: 'done' } }))
      chooseContact(t, {
        firstName: person.firstName ?? '', lastName: person.lastName ?? '', role: person.role ?? '', email: data.email,
      })
    } catch {
      setHunter((h) => ({ ...h, [k]: { status: 'error' } }))
    }
  }

  // ── HubSpot : contact + tâche email + relance ───────────────────────────────
  async function pushOne(t) {
    const c = t.contact
    if (!c?.email) return false
    setPush((p) => ({ ...p, [t.id]: 'loading' }))
    try {
      const hs = await postJSON('/api/hubspot', {
        name: t.name,
        domain: t.domain ?? undefined,
        canton: t.canton ?? '',
        uid: t.uid ?? '',
        segment: t.segment,
        _contact: { email: c.email, firstname: c.firstName ?? '', lastname: c.lastName ?? '', jobtitle: c.role ?? '', company: t.name },
      })
      const contactId = hs.data.contact?.id
      const companyId = hs.data.company?.id
      if (!hs.ok || !contactId) throw new Error(hs.data.error ?? 'Contact HubSpot non créé')

      const who = fullName(c) || c.email
      const email = emailFor(t)
      const objective = OBJECTIVES[settings.objective].label
      const tasks = [{
        companyName: t.name, contactName: who, companyId, contactId, dueInDays: 0,
        subject: `✉️ ${objective} · ${JURIDIQUE_SEGMENTS[t.segment].short} — ${who} · ${t.name}`,
        template: `Objet : ${email.subject}\n\n${email.body}`,
      }]
      if (followUp) {
        const f = buildFollowUp(t, c, sender, email.subject, settings)
        tasks.push({
          companyName: t.name, contactName: who, companyId, contactId, dueInDays: 7,
          subject: `🔁 Relance J+7 · ${objective} — ${who} · ${t.name}`,
          template: `Objet : ${f.subject}\n\n${f.body}`,
        })
      }
      const tr = await postJSON('/api/hubspot-tasks', { tasks })
      if (!tr.ok || tr.data.created < tasks.length) {
        throw new Error(tr.data.error ?? `${tasks.length - (tr.data.created ?? 0)} tâche(s) non créée(s)`)
      }

      updateTarget(t.id, { hubspot: { pushedAt: Date.now(), contactId, companyId, followUp, objective: settings.objective } })
      if (!readPipeline()[t.id]) changeStatus(t.id, 'Contacté')
      setPush((p) => ({ ...p, [t.id]: 'done' }))
      return true
    } catch (err) {
      setPush((p) => ({ ...p, [t.id]: err.message || 'Erreur HubSpot' }))
      return false
    }
  }

  async function pushSelected() {
    const ready = selectedReady
    setBulk({ done: 0, total: ready.length, ok: 0, running: true })
    for (const t of ready) {
      const ok = await pushOne(t)
      setBulk((b) => ({ ...b, done: b.done + 1, ok: b.ok + (ok ? 1 : 0) }))
    }
    setBulk((b) => ({ ...b, running: false }))
    setSelected(new Set())
  }

  // ── Rendu ───────────────────────────────────────────────────────────────────
  return (
    <div className="op-panel">
      <div className="op-header">
        <h2>✉️ Campagne email — Juridique &amp; Fiscal</h2>
        <p className="op-sub">
          Sollicitez les avocats, notaires, fiduciaires et conseils fiscaux pour obtenir des dossiers de PME suisses à reprendre,
          ou pour présenter Seerius — avec une proposition de visio ou de rendez-vous.
          Chaque email est personnalisé, puis créé dans HubSpot comme tâche à envoyer depuis votre boîte connectée.
        </p>
      </div>

      <ol className="op-steps">
        <li><strong>Ajouter des cabinets</strong><span>Dans un segment, sélectionnez des lignes → « ✉️ Campagne »</span></li>
        <li><strong>Choisir le destinataire</strong><span>Décideur LinkedIn, email Hunter ou saisie</span></li>
        <li><strong>Relire l'email</strong><span>Proposition de visio ou de rendez-vous</span></li>
        <li><strong>Créer dans HubSpot</strong><span>Tâches → file d'attente → Envoyer</span></li>
      </ol>

      <div className="op-stats">
        {stats.map((s) => (
          <div key={s.label} className="op-stat">
            <span className="op-stat-value">{s.value}</span>
            <span className="op-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="op-sender">
        <div className="op-block-label">Votre signature</div>
        <div className="op-sender-fields">
          <input placeholder="Prénom Nom" value={sender.name} onChange={(e) => updateSender('name', e.target.value)} />
          <input placeholder="Fonction (ex. Associé)" value={sender.title} onChange={(e) => updateSender('title', e.target.value)} />
          <input placeholder="Téléphone" value={sender.phone} onChange={(e) => updateSender('phone', e.target.value)} />
        </div>
        {!sender.name && <div className="op-warn">Renseignez votre nom : il remplace « [Prénom Nom] » dans tous les emails.</div>}
      </div>

      <div className="op-sender">
        <div className="op-block-label">Objectif de la campagne</div>
        <div className="op-objectives">
          {Object.entries(OBJECTIVES).map(([id, o]) => (
            <button
              key={id}
              className={`op-objective ${settings.objective === id ? 'op-objective--on' : ''}`}
              onClick={() => setObjective(id)}
            >
              <strong>{o.label}</strong>
              <span>{o.desc}</span>
            </button>
          ))}
        </div>
        {settings.objective === 'dealflow' && (
          <>
            <div className="op-criteria">
              {DEAL_CRITERIA_FIELDS.map((f) => (
                <label key={f.id} className="op-criterion">
                  <span>{f.label}</span>
                  <input value={settings.criteria[f.id]} onChange={(e) => setCriterion(f.id, e.target.value)} />
                </label>
              ))}
            </div>
            <div className="op-warn">
              Ces critères d'acquisition figurent dans chaque email deal flow : validez-les avant de créer les tâches. Ils sont partagés avec l'équipe.
            </div>
          </>
        )}
      </div>

      {all.length === 0 ? (
        <div className="op-empty">
          <p>Aucun cabinet dans la campagne pour l'instant.</p>
          <p className="op-muted">Ouvrez un segment, lancez la recherche, sélectionnez des cabinets (idéalement après « ⚡ Trouver les décideurs ») puis cliquez « ✉️ Campagne ».</p>
          <div className="op-empty-links">
            {Object.entries(JURIDIQUE_SEGMENTS).map(([id, s]) => (
              <button key={id} className="op-btn-light" onClick={() => onNavigate(id)}>{s.icon} {s.label} →</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="op-table-card">
          <div className="op-toolbar">
            <div className="op-chips">
              <button className={`op-chip ${!segFilter ? 'op-chip--on' : ''}`} onClick={() => setSegFilter('')}>Tous ({all.length})</button>
              {Object.entries(JURIDIQUE_SEGMENTS).map(([id, s]) => {
                const n = all.filter((t) => t.segment === id).length
                return n > 0 && (
                  <button key={id} className={`op-chip ${segFilter === id ? 'op-chip--on' : ''}`} onClick={() => setSegFilter(id)}>
                    {s.icon} {s.label} ({n})
                  </button>
                )
              })}
            </div>
            <select className="op-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Tous statuts</option>
              <option value="todo">À contacter</option>
              <option value="Contacté">Contacté</option>
              <option value="RDV">RDV</option>
              <option value="Partenaire">Partenaire</option>
            </select>
            <label className="op-check">
              <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />
              Relance J+7
            </label>
          </div>

          {selected.size > 0 && (
            <div className="op-bulk">
              <span>{selected.size} sélectionné{selected.size > 1 ? 's' : ''} · {selectedReady.length} avec destinataire</span>
              <button className="op-btn-hs" disabled={!selectedReady.length || bulk?.running} onClick={pushSelected}>
                {bulk?.running ? `Envoi ${bulk.done}/${bulk.total}…` : `→ Créer dans HubSpot (${selectedReady.length})`}
              </button>
            </div>
          )}
          {bulk && !bulk.running && (
            <div className="op-bulk-result">
              ✓ {bulk.ok} cabinet{bulk.ok !== 1 ? 's' : ''} créé{bulk.ok !== 1 ? 's' : ''} dans HubSpot
              {bulk.total - bulk.ok > 0 ? ` · ${bulk.total - bulk.ok} erreur(s)` : ''}
              {' '}— ouvrez HubSpot → Tâches → « Démarrer la file » pour envoyer.
              <button className="op-link" onClick={() => setBulk(null)}>Fermer</button>
            </div>
          )}

          <div className="op-table-scroll">
            <table className="op-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={list.length > 0 && selected.size === list.length} onChange={toggleAll} /></th>
                  <th>Cabinet</th>
                  <th>Destinataire</th>
                  <th>Relation</th>
                  <th>HubSpot</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const seg = JURIDIQUE_SEGMENTS[t.segment]
                  const isOpen = openId === t.id
                  return [
                    <tr key={t.id} className={selected.has(t.id) ? 'op-row--selected' : ''}>
                      <td><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} /></td>
                      <td>
                        <div className="op-co-name">{t.name}</div>
                        <div className="op-co-meta">
                          <span className="op-seg-badge">{seg.icon} {seg.short}</span>
                          {[t.municipality, t.canton].filter(Boolean).join(' · ')}
                          {t.domain && <span className="op-domain">{t.domain}</span>}
                        </div>
                      </td>
                      <td>
                        {t.contact?.email ? (
                          <div className="op-contact-cell">
                            <span className="op-person-name">{fullName(t.contact) || '—'}</span>
                            <span className="op-person-email">{t.contact.email}</span>
                          </div>
                        ) : (
                          <span className="op-muted">
                            À définir{t.decideurs?.length ? ` · ${t.decideurs.length} décideur${t.decideurs.length > 1 ? 's' : ''} LinkedIn` : ''}
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusSelect value={pipeline[t.id] ?? null} onChange={(v) => changeStatus(t.id, v)} />
                      </td>
                      <td>
                        {push[t.id] === 'loading' ? <span className="op-muted">Envoi…</span>
                          : t.hubspot ? (
                            <span className="badge badge--green" title={t.hubspot.followUp ? 'Tâche email + relance J+7' : 'Tâche email'}>
                              ✓ {new Date(t.hubspot.pushedAt).toLocaleDateString('fr-CH')}
                            </span>
                          ) : push[t.id] ? <span className="op-error" title={push[t.id]}>⚠️ Erreur</span>
                          : <span className="op-muted">—</span>}
                      </td>
                      <td className="op-row-actions">
                        <button className={`op-btn-prepare ${isOpen ? 'op-btn-prepare--open' : ''}`} onClick={() => setOpenId(isOpen ? null : t.id)}>
                          {isOpen ? '▲ Fermer' : t.contact?.email ? '✏️ Relire' : '✏️ Préparer'}
                        </button>
                        <button className="op-btn-remove" onClick={() => removeTarget(t.id)} title="Retirer de la campagne">✕</button>
                      </td>
                    </tr>,
                    isOpen && (
                      <tr key={`${t.id}-editor`} className="op-editor-row">
                        <td colSpan={6}>
                          <TargetEditor
                            key={`${t.id}-${t.contact?.email ?? ''}`}
                            t={t}
                            email={emailFor(t)}
                            edited={isEdited(t)}
                            hunter={hunter}
                            pushState={push[t.id]}
                            followUp={followUp}
                            onNavigate={onNavigate}
                            onSearchDomain={searchDomain}
                            onFindPerson={findPerson}
                            onChoose={chooseContact}
                            onDraft={setDraft}
                            onPush={pushOne}
                          />
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
