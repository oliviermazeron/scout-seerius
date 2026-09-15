import { useState, useMemo, useEffect } from 'react'
import {
  JURIDIQUE_SEGMENTS, OBJECTIVES, DEAL_CRITERIA_FIELDS, readTargets, writeTargets, readSender, writeSender,
  readSettings, writeSettings, readPipeline, setPipelineStatus, buildEmail, buildFollowUp,
} from '../services/outreach.js'
import { secureFetch, getAccessCode, setAccessCode } from '../services/access.js'
import { StatusSelect } from './ContactTable.jsx'
import './OutreachPanel.css'

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SENDS_KEY = 'scout_outreach_sends' // registre des envois (écrit par le serveur)

function fullName(c) {
  return [c?.firstName, c?.lastName].filter(Boolean).join(' ')
}

const fmtDate = (ts) => new Date(ts).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })

function readSends() {
  try { return JSON.parse(localStorage.getItem(SENDS_KEY)) ?? {} } catch { return {} }
}
function writeSends(sends) {
  try { localStorage.setItem(SENDS_KEY, JSON.stringify(sends)) } catch {}
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

// Retour de la connexion Google (/?gmail=connected|error&reason=…)
function readGmailReturn() {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('gmail')) return null
  return params.get('gmail') === 'connected'
    ? { ok: true, text: 'Gmail connecté.' }
    : { ok: false, text: `Connexion Gmail échouée : ${params.get('reason') ?? 'erreur inconnue'}` }
}

// ─── Statut d'envoi ───────────────────────────────────────────────────────────
function SendBadge({ record }) {
  const labels = {
    sent:        `✉️ Envoyé ${fmtDate(record.sentAt)}${record.followUp ? ` · relance ${fmtDate(record.followUp.dueAt)}` : ''}`,
    followed_up: `🔁 Relancé ${fmtDate(record.followUpSentAt)}`,
    replied:     `💬 Répondu${record.repliedAt ? ` ${fmtDate(record.repliedAt)}` : ''}`,
    optout:      '⛔ Désinscrit',
    bounced:     '⚠️ Adresse rejetée',
  }
  const tone = { replied: 'op-send--good', optout: 'op-send--bad', bounced: 'op-send--bad' }[record.status] ?? ''
  const logIssues = Object.values(record.hubspotLogs ?? {}).filter((l) => ['failed', 'uncertain'].includes(l.state))
  const title = [
    record.subject,
    ...logIssues.map((l) => `HubSpot (${l.kind === 'followup' ? 'relance' : 'email'}) : ${l.state === 'uncertain' ? 'à vérifier sur la fiche' : 'nouvel essai automatique'} — ${l.error}`),
  ].join('\n')
  return (
    <span className={`op-send ${tone}`} title={title}>
      {labels[record.status] ?? record.status}{logIssues.length ? ' · ⚠️ HubSpot' : ''}
    </span>
  )
}

// ─── Connexion Gmail ──────────────────────────────────────────────────────────
function GmailCard({ gmail, notice, checking, checkResult, onUnlock, onConnect, onDisconnect, onCheck, onRetry }) {
  const [code, setCode] = useState('')

  return (
    <div className="op-sender op-gmail">
      <div className="op-block-label">Envoi automatique depuis Gmail</div>
      {notice && <div className={notice.ok ? 'op-ok' : 'op-warn'}>{notice.text}</div>}
      {gmail.dryRun && (
        <div className="op-test">
          🧪 Mode test actif : « Envoyer » simule l'envoi. Aucun email ne part et rien n'est écrit dans HubSpot.
        </div>
      )}
      {gmail.commsEnabled === false && (
        <div className="op-warn">
          Module communications désactivé (HUBSPOT_COMMS_TOKEN absent) : l'envoi réel reste bloqué tant que les
          désinscriptions ne peuvent pas être vérifiées dans HubSpot.
        </div>
      )}

      {gmail.state === 'loading' && <span className="op-muted">Vérification de la connexion Gmail…</span>}

      {gmail.state === 'locked' && (
        <form className="op-gmail-row" onSubmit={(e) => { e.preventDefault(); onUnlock(code) }}>
          <span className="op-muted">Saisissez le code d'accès SCOUT pour activer l'envoi depuis Gmail.</span>
          <input type="password" placeholder="Code d'accès" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="op-btn-light" type="submit" disabled={!code}>Déverrouiller</button>
          {gmail.error && <span className="op-error">{gmail.error}</span>}
        </form>
      )}

      {gmail.state === 'unconfigured' && (
        <span className="op-muted">Envoi Gmail pas encore configuré : les identifiants Google doivent être ajoutés sur Vercel.</span>
      )}

      {gmail.state === 'error' && (
        <div className="op-gmail-row">
          <span className="op-error">{gmail.error}</span>
          <button className="op-btn-light" onClick={onRetry}>Réessayer</button>
        </div>
      )}

      {gmail.state === 'disconnected' && (
        <div className="op-gmail-row">
          <span className="op-muted">Gmail n'est pas connecté : les emails ne peuvent pas partir automatiquement.</span>
          <button className="op-btn-send" onClick={onConnect}>Connecter Gmail</button>
        </div>
      )}

      {gmail.state === 'connected' && (
        <>
          <div className="op-gmail-row">
            <span className="op-ok-inline">✓ Envoi depuis <strong>{gmail.email}</strong></span>
            <span className="op-muted">{gmail.quota?.used ?? 0} / {gmail.quota?.cap ?? '—'} emails aujourd'hui</span>
            {!gmail.windowOpen && <span className="op-muted">· hors créneau ({gmail.window})</span>}
            <span className="op-spacer" />
            <button className="op-btn-light" onClick={onCheck} disabled={checking}>
              {checking ? 'Vérification…' : '↻ Vérifier réponses et relances'}
            </button>
            <button className="op-link" onClick={onDisconnect}>Déconnecter</button>
          </div>
          {checkResult && (
            <div className="op-muted">
              {checkResult.error
                ? <span className="op-error">{checkResult.error}</span>
                : `${checkResult.checked} suivis · ${checkResult.replied} réponse(s) · ${checkResult.followedUp} relance(s) envoyée(s)` +
                  `${checkResult.optedOut ? ` · ${checkResult.optedOut} désinscription(s)` : ''}` +
                  `${checkResult.bounced ? ` · ${checkResult.bounced} adresse(s) rejetée(s)` : ''}` +
                  `${checkResult.errors?.length ? ` · ${checkResult.errors.length} erreur(s)` : ''}`}
            </div>
          )}
          <div className="op-muted">
            Relances et détection des réponses automatiques chaque matin de semaine. Envois {gmail.window}.
          </div>
        </>
      )}
    </div>
  )
}

// ─── Panneau d'édition d'une cible (destinataire + email) ────────────────────
function TargetEditor({ t, email, edited, hunter, record, sendState, pushState, followUp, gmailReady, onNavigate,
  onSearchDomain, onFindPerson, onChoose, onDraft, onSend, onPush }) {
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
          <SendButton t={t} record={record} state={sendState} gmailReady={gmailReady} onSend={onSend} />
        </div>
        <div className="op-muted op-push-note">
          <strong>✉️ Envoyer</strong> : part immédiatement depuis Gmail et s'enregistre dans HubSpot
          {followUp ? ', relance automatique à J+7 sans réponse' : ''}. Une ligne de désinscription est ajoutée en bas de l'email.
          <br />
          <strong>📋 Tâche HubSpot</strong> : crée le contact et une tâche pour envoyer vous-même
          {followUp ? ' (+ tâche de relance à J+7)' : ''}.
        </div>
      </div>
    </div>
  )
}

function SendButton({ t, record, state, gmailReady, onSend }) {
  if (record) return <SendBadge record={record} />
  if (state === 'loading') return <button className="op-btn-send" disabled>Envoi…</button>
  return (
    <>
      {state === 'dry' && <span className="op-send" title="Mode test : rien n'est parti">🧪 Simulé</span>}
      {state && !['done', 'dry'].includes(state) && <span className="op-error" title={state}>⚠️ {state}</span>}
      <button
        className="op-btn-send"
        disabled={!t.contact?.email || !gmailReady}
        title={!gmailReady ? 'Connectez Gmail en haut de la page' : t.contact?.email ? '' : "Choisissez d'abord un destinataire avec email"}
        onClick={() => onSend(t)}
      >
        ✉️ Envoyer
      </button>
    </>
  )
}

function PushButton({ t, state, onPush }) {
  if (state === 'loading') return <button className="op-btn-hs" disabled>Création…</button>
  return (
    <>
      {state && state !== 'done' && <span className="op-error" title={state}>⚠️ {state}</span>}
      <button
        className="op-btn-hs"
        disabled={!t.contact?.email}
        title={t.contact?.email ? 'Crée le contact et une tâche email dans HubSpot, pour un envoi manuel' : "Choisissez d'abord un destinataire avec email"}
        onClick={() => onPush(t)}
      >
        {t.hubspot ? '↻ Tâche HubSpot' : '📋 Tâche HubSpot'}
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
  const [sends, setSends]               = useState(readSends)
  const [segFilter, setSegFilter]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected]         = useState(new Set())
  const [openId, setOpenId]             = useState(null)
  const [followUp, setFollowUp]         = useState(true)
  const [hunter, setHunter]             = useState({}) // id | id|nom → { status, emails }
  const [push, setPush]                 = useState({}) // id → 'loading' | 'done' | message d'erreur
  const [send, setSend]                 = useState({}) // id → 'loading' | 'done' | message d'erreur
  const [bulk, setBulk]                 = useState(null) // { kind, done, total, ok, running, stopped }
  const [gmail, setGmail]               = useState({ state: 'loading' })
  const [gmailNotice]                   = useState(readGmailReturn)
  const [checking, setChecking]         = useState(false)
  const [checkResult, setCheckResult]   = useState(null)

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

  const recordFor = (t) => (t.contact?.email ? sends[t.contact.email.trim().toLowerCase()] ?? null : null)
  // Mode test : simulation possible sans Gmail ; mode réel : Gmail connecté + module communications actif
  const gmailReady = gmail.dryRun
    ? ['connected', 'disconnected', 'unconfigured'].includes(gmail.state)
    : gmail.state === 'connected' && gmail.commsEnabled !== false

  const stats = [
    { label: 'Cabinets ciblés', value: all.length },
    { label: 'Avec destinataire', value: all.filter((t) => t.contact?.email).length },
    { label: 'Emails envoyés', value: all.filter((t) => recordFor(t)).length },
    { label: 'Réponses', value: all.filter((t) => recordFor(t)?.status === 'replied').length },
    { label: 'RDV', value: all.filter((t) => pipeline[t.id] === 'RDV').length },
    { label: 'Partenaires', value: all.filter((t) => pipeline[t.id] === 'Partenaire').length },
  ]

  const selectedReady = list.filter((t) => selected.has(t.id) && t.contact?.email)
  const selectedToSend = selectedReady.filter((t) => !recordFor(t))

  // ── Gmail ───────────────────────────────────────────────────────────────────
  async function loadGmail() {
    const { ok, status, data } = await secureFetch('/api/gmail/status')
    if (status === 401) return setGmail({ state: 'locked', error: getAccessCode() ? "Code d'accès incorrect" : null })
    if (!ok) return setGmail({ state: 'error', error: data.error ?? `Erreur ${status}` })
    const flags = { dryRun: data.dryRun, commsEnabled: data.commsEnabled, window: data.window, windowOpen: data.windowOpen }
    if (!data.configured) return setGmail({ state: 'unconfigured', ...flags })
    setGmail({
      state: data.connected ? 'connected' : 'disconnected',
      email: data.email, quota: data.quota, ...flags,
    })
  }

  useEffect(() => {
    loadGmail()
    if (gmailNotice) window.history.replaceState(null, '', window.location.pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function unlock(code) {
    setAccessCode(code.trim())
    setGmail({ state: 'loading' })
    loadGmail()
  }

  async function connectGmail() {
    const { ok, data } = await secureFetch('/api/gmail/auth-url', { method: 'POST' })
    if (ok && data.url) window.location.href = data.url
    else setGmail((g) => ({ ...g, state: 'error', error: data.error ?? 'Connexion impossible' }))
  }

  async function disconnectGmail() {
    if (!window.confirm('Déconnecter Gmail ? Les relances automatiques seront suspendues.')) return
    await secureFetch('/api/gmail/status', { method: 'DELETE' })
    loadGmail()
  }

  function mergeSends(next) {
    setSends(next)
    writeSends(next)
  }

  async function checkReplies() {
    setChecking(true)
    setCheckResult(null)
    const { ok, data } = await secureFetch('/api/outreach/followups', { method: 'POST' })
    if (ok && data.sends) mergeSends(data.sends)
    setCheckResult(ok ? data : { error: data.error ?? 'Vérification impossible' })
    setChecking(false)
    loadGmail()
  }

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

  // ── Envoi Gmail (automatique) ───────────────────────────────────────────────
  // Retourne { ok, stop } — stop = inutile de continuer un envoi groupé
  async function sendOne(t, ask = true) {
    const c = t.contact
    if (!c?.email || recordFor(t)) return { ok: false }
    const email = emailFor(t)
    if (email.body.includes('[Prénom Nom]')) {
      setSend((s) => ({ ...s, [t.id]: 'Renseignez votre signature' }))
      return { ok: false, stop: true }
    }
    const who = `${fullName(c) || c.email} <${c.email}>`
    const intro = gmail.dryRun ? '[MODE TEST — rien ne partira] Simuler' : 'Envoyer maintenant'
    if (ask && !window.confirm(`${intro} l'email à ${who} — ${t.name} ?\n\nDepuis ${gmail.email ?? 'Gmail'}${followUp ? ', avec relance automatique à J+7 sans réponse' : ''}.`)) {
      return { ok: false }
    }

    setSend((s) => ({ ...s, [t.id]: 'loading' }))
    const { ok, status, data } = await secureFetch('/api/outreach/send', {
      method: 'POST',
      body: {
        target: { id: t.id, name: t.name, domain: t.domain, canton: t.canton, uid: t.uid, segment: t.segment },
        contact: c,
        email,
        followUp: followUp ? buildFollowUp(t, c, sender, email.subject, settings) : null,
        senderName: sender.name,
        objective: settings.objective,
      },
    })

    if (!ok) {
      if (data.record) mergeSends({ ...sends, [data.record.email]: data.record })
      setSend((s) => ({ ...s, [t.id]: data.error ?? `Erreur ${status}` }))
      if (status === 401) setGmail({ state: 'locked', error: "Code d'accès incorrect" })
      if (data.code === 'GMAIL_DISCONNECTED') loadGmail()
      return { ok: false, stop: [401, 423, 429, 503].includes(status) || data.code === 'GMAIL_DISCONNECTED' }
    }

    if (data.dryRun) {
      setSend((s) => ({ ...s, [t.id]: 'dry' }))
      return { ok: true }
    }

    setSends((prev) => {
      const next = { ...prev, [data.record.email]: data.record }
      writeSends(next)
      return next
    })
    if (data.quota) setGmail((g) => ({ ...g, quota: data.quota }))
    if (!readPipeline()[t.id]) changeStatus(t.id, 'Contacté')
    setSend((s) => ({ ...s, [t.id]: 'done' }))
    return { ok: true }
  }

  async function sendSelected() {
    const ready = selectedToSend
    if (!ready.length) return
    const verb = gmail.dryRun ? '[MODE TEST — rien ne partira] Simuler' : 'Envoyer'
    if (!window.confirm(`${verb} ${ready.length} email${ready.length > 1 ? 's' : ''} maintenant depuis ${gmail.email ?? 'Gmail'} ?`)) return
    setBulk({ kind: 'send', done: 0, total: ready.length, ok: 0, running: true })
    for (const t of ready) {
      const result = await sendOne(t, false)
      setBulk((b) => ({ ...b, done: b.done + 1, ok: b.ok + (result.ok ? 1 : 0), stopped: !!result.stop }))
      if (result.stop) break
    }
    setBulk((b) => ({ ...b, running: false }))
    setSelected(new Set())
  }

  // ── HubSpot : contact + tâche email + relance (envoi manuel) ────────────────
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
    setBulk({ kind: 'tasks', done: 0, total: ready.length, ok: 0, running: true })
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
          Les emails partent depuis votre boîte Gmail et sont enregistrés dans HubSpot ; les relances sont automatiques.
        </p>
      </div>

      <ol className="op-steps">
        <li><strong>Ajouter des cabinets</strong><span>Dans un segment, sélectionnez des lignes → « ✉️ Campagne »</span></li>
        <li><strong>Choisir le destinataire</strong><span>Décideur LinkedIn, email Hunter ou saisie</span></li>
        <li><strong>Relire l'email</strong><span>Proposition de visio ou de rendez-vous</span></li>
        <li><strong>Envoyer</strong><span>Gmail + HubSpot, relance J+7 automatique sans réponse</span></li>
      </ol>

      <div className="op-stats">
        {stats.map((s) => (
          <div key={s.label} className="op-stat">
            <span className="op-stat-value">{s.value}</span>
            <span className="op-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      <GmailCard
        gmail={gmail}
        notice={gmailNotice}
        checking={checking}
        checkResult={checkResult}
        onUnlock={unlock}
        onConnect={connectGmail}
        onDisconnect={disconnectGmail}
        onCheck={checkReplies}
        onRetry={() => { setGmail({ state: 'loading' }); loadGmail() }}
      />

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
              Ces critères d'acquisition figurent dans chaque email deal flow : validez-les avant d'envoyer. Ils sont partagés avec l'équipe.
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
              <button
                className="op-btn-send"
                disabled={!selectedToSend.length || !gmailReady || bulk?.running}
                title={gmailReady ? '' : 'Connectez Gmail en haut de la page'}
                onClick={sendSelected}
              >
                {bulk?.running && bulk.kind === 'send' ? `Envoi ${bulk.done}/${bulk.total}…` : `✉️ Envoyer (${selectedToSend.length})`}
              </button>
              <button className="op-btn-hs" disabled={!selectedReady.length || bulk?.running} onClick={pushSelected}>
                {bulk?.running && bulk.kind === 'tasks' ? `Création ${bulk.done}/${bulk.total}…` : `📋 Tâches HubSpot (${selectedReady.length})`}
              </button>
            </div>
          )}
          {bulk && !bulk.running && (
            <div className="op-bulk-result">
              {bulk.kind === 'send'
                ? `✓ ${bulk.ok} email${bulk.ok !== 1 ? 's' : ''} ${gmail.dryRun ? 'simulé' : 'envoyé'}${bulk.ok !== 1 ? 's' : ''}` +
                  `${gmail.dryRun ? ' (mode test, rien n\'est parti)' : ''}` +
                  `${bulk.total - bulk.ok > 0 ? ` · ${bulk.total - bulk.ok} non envoyé(s)` : ''}` +
                  `${bulk.stopped ? ' — envoi interrompu, voir le message sur la ligne concernée' : ''}`
                : `✓ ${bulk.ok} cabinet${bulk.ok !== 1 ? 's' : ''} créé${bulk.ok !== 1 ? 's' : ''} dans HubSpot` +
                  `${bulk.total - bulk.ok > 0 ? ` · ${bulk.total - bulk.ok} erreur(s)` : ''} — HubSpot → Tâches → « Démarrer la file » pour envoyer.`}
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
                  <th>Envoi</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const seg = JURIDIQUE_SEGMENTS[t.segment]
                  const isOpen = openId === t.id
                  const record = recordFor(t)
                  const sendState = send[t.id]
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
                        {record ? <SendBadge record={record} />
                          : sendState === 'loading' ? <span className="op-muted">Envoi…</span>
                          : sendState === 'dry' ? <span className="op-send" title="Mode test : rien n'est parti">🧪 Simulé</span>
                          : sendState && sendState !== 'done' ? <span className="op-error" title={sendState}>⚠️ {sendState}</span>
                          : push[t.id] === 'loading' ? <span className="op-muted">Création…</span>
                          : t.hubspot ? (
                            <span className="badge badge--green" title={t.hubspot.followUp ? 'Tâche email + relance J+7' : 'Tâche email'}>
                              📋 Tâche {new Date(t.hubspot.pushedAt).toLocaleDateString('fr-CH')}
                            </span>
                          ) : push[t.id] && push[t.id] !== 'done' ? <span className="op-error" title={push[t.id]}>⚠️ Erreur</span>
                          : <span className="op-muted">—</span>}
                      </td>
                      <td className="op-row-actions">
                        {t.contact?.email && !record && gmailReady && (
                          <button className="op-btn-send op-btn-send--sm" disabled={sendState === 'loading'} onClick={() => sendOne(t)}>
                            ✉️ Envoyer
                          </button>
                        )}
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
                            record={record}
                            sendState={sendState}
                            pushState={push[t.id]}
                            followUp={followUp}
                            gmailReady={gmailReady}
                            onNavigate={onNavigate}
                            onSearchDomain={searchDomain}
                            onFindPerson={findPerson}
                            onChoose={chooseContact}
                            onDraft={setDraft}
                            onSend={sendOne}
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
