import { useState, useMemo } from 'react'
import './DealPanel.css'

// ─── Constantes ───────────────────────────────────────────────────────────────
const DEAL_TYPES = [
  // M&A
  { id: 'cession',       label: 'Cession',          icon: '📤', desc: 'Cédant cherche repreneur / acheteur',       group: 'M&A' },
  { id: 'acquisition',   label: 'Acquisition',       icon: '📥', desc: 'Acquéreur cherche une cible',              group: 'M&A' },
  { id: 'levee',         label: 'Levée de fonds',    icon: '🚀', desc: 'Entreprise cherche des investisseurs',      group: 'M&A' },
  // Private Markets
  { id: 'secondaire_pe', label: 'Secondaire PE',     icon: '🔄', desc: 'Parts de fonds PE à céder ou acquérir',    group: 'Private Markets' },
  { id: 'co_invest',     label: 'Co-investissement', icon: '🤝', desc: 'Opportunité de co-invest dans une société', group: 'Private Markets' },
  { id: 'dette_privee',  label: 'Dette privée',      icon: '📜', desc: 'Financement alternatif / private debt',    group: 'Private Markets' },
  { id: 'real_assets',   label: 'Real Assets',       icon: '🏢', desc: 'Infrastructure, immobilier, actifs réels', group: 'Private Markets' },
]

const DEAL_GROUPS = ['M&A', 'Private Markets']

const SECTEURS = [
  'Industrie & manufacturing', 'Tech & SaaS', 'Santé & medtech',
  'Immobilier & construction', 'Services aux entreprises', 'Commerce & retail',
  'Agroalimentaire', 'Finance & assurance', 'Énergie & cleantech', 'Autre',
]

// Segments pertinents par type de deal — ordre = priorité
const MATCH_BY_TYPE = {
  cession:       ['fiduciaire', 'avocat', 'notaire', 'conseil_fiscal', 'banque_privee', 'gestionnaire_fortune', 'banque_affaires', 'asset_manager', 'family_office'],
  acquisition:   ['banque_affaires', 'avocat', 'fiduciaire', 'conseil_fiscal', 'family_office', 'multi_family_office', 'asset_manager'],
  levee:         ['banque_affaires', 'asset_manager', 'family_office', 'multi_family_office', 'banque_privee'],
  secondaire_pe: ['banque_privee', 'family_office', 'multi_family_office', 'gestionnaire_fortune', 'asset_manager', 'banque_affaires'],
  co_invest:     ['family_office', 'multi_family_office', 'banque_privee', 'gestionnaire_fortune', 'asset_manager'],
  dette_privee:  ['asset_manager', 'banque_privee', 'gestionnaire_fortune', 'family_office', 'multi_family_office', 'banque_affaires'],
  real_assets:   ['banque_privee', 'family_office', 'multi_family_office', 'gestionnaire_fortune', 'asset_manager'],
}

const SEGMENT_LABELS = {
  banque_cantonale:     { label: 'Banques cantonales',       icon: '🏦' },
  banque_privee:        { label: 'Banques privées',          icon: '🔐' },
  banque_affaires:      { label: "Banques d'affaires",       icon: '💼' },
  fiduciaire:           { label: 'Fiduciaires',              icon: '📊' },
  avocat:               { label: 'Avocats',                  icon: '⚖️' },
  gestionnaire_fortune: { label: 'Gestionnaires de fortune', icon: '📈' },
  asset_manager:        { label: 'Asset Managers',           icon: '🏗️' },
  family_office:        { label: 'Family Offices',           icon: '🏛️' },
  multi_family_office:  { label: 'Multi Family Offices',     icon: '🌐' },
  notaire:              { label: 'Notaires',                 icon: '📜' },
  conseil_fiscal:       { label: 'Conseils fiscaux',         icon: '🧾' },
}

// Score de pertinence d'un segment pour un deal (0-3)
function segmentScore(segId, deal) {
  const priority = MATCH_BY_TYPE[deal.type] ?? []
  const idx = priority.indexOf(segId)
  if (idx === -1) return 0
  if (idx <= 1)   return 3 // top 2
  if (idx <= 4)   return 2
  return 1
}

function newDeal() {
  return {
    id: Date.now().toString(),
    name: '',
    type: 'cession',
    secteur: '',
    cantons: [],
    caMin: '',
    caMax: '',
    ebitdaMin: '',
    ebitdaMax: '',
    note: '',
    status: 'actif',
    created: new Date().toISOString().slice(0, 10),
  }
}

function readDeals() {
  try { return JSON.parse(localStorage.getItem('scout_deals') ?? '[]') } catch { return [] }
}
function saveDeals(deals) {
  try { localStorage.setItem('scout_deals', JSON.stringify(deals)) } catch {}
}

const ALL_CANTONS = [
  'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR',
  'JU','LU','NE','NW','OW','SG','SH','SO','SZ','TG',
  'TI','UR','VD','VS','ZG','ZH',
]

// ─── Formulaire de création / édition ────────────────────────────────────────
function DealForm({ initial, onSave, onCancel }) {
  const [deal, setDeal] = useState(initial ?? newDeal())

  function set(key, val) { setDeal((d) => ({ ...d, [key]: val })) }
  function toggleCanton(c) {
    setDeal((d) => ({
      ...d,
      cantons: d.cantons.includes(c) ? d.cantons.filter((x) => x !== c) : [...d.cantons, c],
    }))
  }

  function handleSave() {
    if (!deal.name.trim()) return
    onSave(deal)
  }

  return (
    <div className="deal-form">
      <div className="deal-form-row">
        <label>Nom du deal *</label>
        <input
          className="deal-input"
          placeholder="ex: Projet Alpin, Mandat GE-2024…"
          value={deal.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <div className="deal-form-row">
        <label>Type</label>
        {DEAL_GROUPS.map((group) => (
          <div key={group} className="type-group">
            <div className="type-group-label">{group}</div>
            <div className="type-grid">
              {DEAL_TYPES.filter((t) => t.group === group).map((t) => (
                <button
                  key={t.id}
                  className={`type-btn ${deal.type === t.id ? 'type-btn--on' : ''}`}
                  onClick={() => set('type', t.id)}
                >
                  <span className="type-icon">{t.icon}</span>
                  <span className="type-label">{t.label}</span>
                  <span className="type-desc">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="deal-form-row">
        <label>Secteur</label>
        <select className="deal-select" value={deal.secteur} onChange={(e) => set('secteur', e.target.value)}>
          <option value="">— Choisir —</option>
          {SECTEURS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="deal-form-row">
        <label>Cantons concernés</label>
        <div className="canton-grid-sm">
          {ALL_CANTONS.map((c) => (
            <button
              key={c}
              className={`canton-btn-sm ${deal.cantons.includes(c) ? 'canton-btn-sm--on' : ''}`}
              onClick={() => toggleCanton(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="deal-form-row deal-form-row--inline">
        <div>
          <label>CA (M CHF)</label>
          <div className="range-inputs">
            <input className="deal-input-sm" placeholder="Min" type="number" value={deal.caMin} onChange={(e) => set('caMin', e.target.value)} />
            <span>–</span>
            <input className="deal-input-sm" placeholder="Max" type="number" value={deal.caMax} onChange={(e) => set('caMax', e.target.value)} />
          </div>
        </div>
        <div>
          <label>EBITDA (M CHF)</label>
          <div className="range-inputs">
            <input className="deal-input-sm" placeholder="Min" type="number" value={deal.ebitdaMin} onChange={(e) => set('ebitdaMin', e.target.value)} />
            <span>–</span>
            <input className="deal-input-sm" placeholder="Max" type="number" value={deal.ebitdaMax} onChange={(e) => set('ebitdaMax', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="deal-form-row">
        <label>Note / Description (anonymisée)</label>
        <textarea
          className="deal-textarea"
          rows={3}
          placeholder="PME industrielle genevoise, rentable, cherche repreneur industriel ou financier…"
          value={deal.note}
          onChange={(e) => set('note', e.target.value)}
        />
      </div>

      <div className="deal-form-actions">
        <button className="btn-save-deal" onClick={handleSave} disabled={!deal.name.trim()}>
          💾 Enregistrer
        </button>
        <button className="btn-cancel-deal" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  )
}

// ─── Vue matching d'un deal ───────────────────────────────────────────────────
function DealMatch({ deal, onNavigate }) {
  const segments = Object.keys(SEGMENT_LABELS)
  const matches = useMemo(() => {
    return segments
      .map((id) => ({ id, score: segmentScore(id, deal), ...SEGMENT_LABELS[id] }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
  }, [deal])

  function teaserEmail(seg) {
    const typeInfo  = DEAL_TYPES.find((t) => t.id === deal.type)
    const typeLabel = typeInfo?.label ?? deal.type
    const cantons   = deal.cantons.length ? deal.cantons.join(', ') : 'Suisse'
    const ca        = deal.caMin || deal.caMax ? `${deal.caMin ? deal.caMin + 'M' : ''}${deal.caMax ? '–' + deal.caMax + 'M' : ''} MCHF` : ''
    const ebitda    = deal.ebitdaMin || deal.ebitdaMax ? `EBITDA ${deal.ebitdaMin ? deal.ebitdaMin + 'M' : ''}${deal.ebitdaMax ? '–' + deal.ebitdaMax + 'M' : ''} MCHF` : ''
    const sizes     = [ca, ebitda].filter(Boolean).join(' · ')

    // Intros et cibles adaptées par type
    const intros = {
      cession:       `Seerius dispose d'un mandat de cession dans le secteur ${deal.secteur || 'non divulgué'}, localisé en ${cantons}.`,
      acquisition:   `Seerius accompagne un acquéreur cherchant une cible dans le secteur ${deal.secteur || 'non divulgué'}, en ${cantons}.`,
      levee:         `Seerius accompagne une levée de fonds dans le secteur ${deal.secteur || 'non divulgué'}, en ${cantons}.`,
      secondaire_pe: `Seerius propose une opportunité de secondaire en private equity — parts de fonds ou position directe dans une société, en ${cantons}.`,
      co_invest:     `Seerius propose une opportunité de co-investissement dans une société en ${cantons}. Ticket d'entrée accessible, aux côtés d'un investisseur de référence.`,
      dette_privee:  `Seerius structure une opération de dette privée / financement alternatif en ${cantons}, dans le secteur ${deal.secteur || 'non divulgué'}.`,
      real_assets:   `Seerius propose une opportunité en real assets (${deal.secteur || 'infrastructure / immobilier'}) en ${cantons}.`,
    }
    const cibles = {
      cession:       'repreneurs ou investisseurs potentiels',
      acquisition:   'cibles potentielles à céder',
      levee:         'investisseurs souhaitant participer',
      secondaire_pe: 'investisseurs en private equity secondaire',
      co_invest:     'co-investisseurs potentiels',
      dette_privee:  'prêteurs alternatifs ou investisseurs en dette',
      real_assets:   'investisseurs en actifs réels',
    }

    return `Objet : Opportunité confidentielle — ${typeLabel}${deal.secteur ? ' · ' + deal.secteur : ''}

Madame, Monsieur,

${intros[deal.type] ?? intros.cession}
${sizes ? '\nCaractéristiques indicatives : ' + sizes + '.\n' : ''}
${deal.note ? '"' + deal.note + '"\n\n' : ''}En tant que ${seg.label.toLowerCase()}, vous pourriez être en contact avec des ${cibles[deal.type] ?? 'contreparties'} correspondant à ce profil.

Seriez-vous disponible pour un échange confidentiel de 20 minutes ?

Cordialement,
[Votre nom] — Seerius`
  }

  const [copied, setCopied] = useState(null)
  function copyTeaser(seg) {
    navigator.clipboard.writeText(teaserEmail(seg))
    setCopied(seg.id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="deal-match">
      <div className="match-header">
        <span className="match-title">Intermédiaires recommandés</span>
        {deal.cantons.length > 0 && (
          <span className="match-cantons">📍 {deal.cantons.join(', ')}</span>
        )}
      </div>
      <div className="match-list">
        {matches.map((seg) => (
          <div key={seg.id} className={`match-row match-row--${seg.score}`}>
            <div className="match-seg">
              <span className="match-icon">{seg.icon}</span>
              <span className="match-label">{seg.label}</span>
              <div className="match-stars">
                {[1,2,3].map((i) => (
                  <span key={i} className={`match-star ${i <= seg.score ? 'match-star--on' : ''}`}>★</span>
                ))}
              </div>
            </div>
            <div className="match-actions">
              <button className="btn-match-copy" onClick={() => copyTeaser(seg)} title="Copier le teaser email">
                {copied === seg.id ? '✓ Copié' : '📋 Teaser'}
              </button>
              <button className="btn-match-go" onClick={() => onNavigate(seg.id)}>
                Ouvrir →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Carte deal ───────────────────────────────────────────────────────────────
function DealCard({ deal, onEdit, onDelete, onNavigate }) {
  const [open, setOpen] = useState(false)
  const typeInfo = DEAL_TYPES.find((t) => t.id === deal.type)

  return (
    <div className={`deal-card deal-card--${deal.status}`}>
      <div className="deal-card-header" onClick={() => setOpen((v) => !v)}>
        <div className="deal-card-left">
          <span className="deal-type-icon">{typeInfo?.icon}</span>
          <div>
            <div className="deal-card-name">{deal.name}</div>
            <div className="deal-card-meta">
              {typeInfo?.label}
              {deal.secteur ? ` · ${deal.secteur}` : ''}
              {deal.cantons.length ? ` · ${deal.cantons.join(', ')}` : ''}
              {(deal.caMin || deal.caMax) ? ` · CA ${deal.caMin || '?'}–${deal.caMax || '?'} M CHF` : ''}
            </div>
          </div>
        </div>
        <div className="deal-card-right">
          <span className={`deal-status deal-status--${deal.status}`}>{deal.status}</span>
          <button className="btn-deal-edit" onClick={(e) => { e.stopPropagation(); onEdit(deal) }}>✏️</button>
          <button className="btn-deal-delete" onClick={(e) => { e.stopPropagation(); onDelete(deal.id) }}>✕</button>
          <span className="deal-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="deal-card-body">
          {deal.note && <p className="deal-note">"{deal.note}"</p>}
          <DealMatch deal={deal} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}

// ─── Panel principal Deals ────────────────────────────────────────────────────
export default function DealPanel({ onNavigate }) {
  const [deals, setDeals] = useState(readDeals)
  const [mode, setMode]   = useState('list') // list | create | edit
  const [editing, setEditing] = useState(null)

  function handleSave(deal) {
    setDeals((prev) => {
      const exists = prev.find((d) => d.id === deal.id)
      const next = exists
        ? prev.map((d) => d.id === deal.id ? deal : d)
        : [deal, ...prev]
      saveDeals(next)
      return next
    })
    setMode('list')
    setEditing(null)
  }

  function handleDelete(id) {
    if (!confirm('Supprimer ce deal ?')) return
    setDeals((prev) => { const next = prev.filter((d) => d.id !== id); saveDeals(next); return next })
  }

  function handleEdit(deal) {
    setEditing(deal)
    setMode('edit')
  }

  return (
    <div className="deal-panel">
      <div className="deal-panel-header">
        <div>
          <h2>Deals</h2>
          <p className="deal-panel-sub">Créez vos mandats et identifiez les bons intermédiaires à contacter.</p>
        </div>
        {mode === 'list' && (
          <button className="btn-new-deal" onClick={() => setMode('create')}>
            + Nouveau deal
          </button>
        )}
      </div>

      {(mode === 'create' || mode === 'edit') && (
        <DealForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => { setMode('list'); setEditing(null) }}
        />
      )}

      {mode === 'list' && deals.length === 0 && (
        <div className="deal-empty">
          Aucun deal enregistré. Créez votre premier mandat pour identifier les intermédiaires à contacter.
        </div>
      )}

      {mode === 'list' && deals.map((deal) => (
        <DealCard
          key={deal.id}
          deal={deal}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}
