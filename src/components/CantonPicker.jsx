import { useState } from 'react'
import './CantonPicker.css'

// Cantons bilingues rattachés à leur région majoritaire : FR et VS en Romandie, BE en Suisse alémanique
export const REGIONS = [
  { id: 'romandie',   label: 'Romandie',          cantons: ['GE', 'VD', 'NE', 'JU', 'FR', 'VS'] },
  { id: 'alemanique', label: 'Suisse alémanique', cantons: ['AG', 'AI', 'AR', 'BE', 'BL', 'BS', 'GL', 'GR', 'LU', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG', 'UR', 'ZG', 'ZH'] },
  { id: 'tessin',     label: 'Tessin',            cantons: ['TI'] },
]

// value : cantons sélectionnés ([] = tous) · onChange(cantons)
export default function CantonPicker({ value, onChange }) {
  const [open, setOpen] = useState({})

  function toggleRegion(region) {
    const all = region.cantons.every((c) => value.includes(c))
    onChange(all
      ? value.filter((c) => !region.cantons.includes(c))
      : [...new Set([...value, ...region.cantons])])
  }

  function toggleCanton(c) {
    onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c])
  }

  return (
    <div className="cp">
      <button
        className={`cp-all ${value.length === 0 ? 'cp-all--on' : ''}`}
        onClick={() => onChange([])}
      >
        Cantons — tous
      </button>

      {REGIONS.map((region) => {
        const selected = region.cantons.filter((c) => value.includes(c)).length
        const all = selected === region.cantons.length
        const isOpen = open[region.id]
        return (
          <div key={region.id} className={`cp-region ${selected ? 'cp-region--active' : ''}`}>
            <div className="cp-region-row">
              <label className="cp-region-label">
                <input
                  type="checkbox"
                  checked={all}
                  ref={(el) => { if (el) el.indeterminate = selected > 0 && !all }}
                  onChange={() => toggleRegion(region)}
                />
                {region.label}
                <span className="cp-count">
                  {selected ? `${selected}/${region.cantons.length}` : region.cantons.length}
                </span>
              </label>
              <button
                className="cp-detail"
                onClick={() => setOpen((o) => ({ ...o, [region.id]: !o[region.id] }))}
                aria-expanded={!!isOpen}
              >
                {isOpen ? '▲ masquer' : '▼ détail'}
              </button>
            </div>
            {isOpen && (
              <div className="canton-grid cp-cantons">
                {region.cantons.map((c) => (
                  <button
                    key={c}
                    className={`canton-btn ${value.includes(c) ? 'canton-btn--on' : ''}`}
                    onClick={() => toggleCanton(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
