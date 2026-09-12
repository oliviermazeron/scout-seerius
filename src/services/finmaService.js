// ─── Service FINMA — tous segments ───────────────────────────────────────────
import { FINMA_GFI }              from './finmaGfi.js'
import { FINMA_BANQUES_PRIVEES }  from './finmaBanquesPrivees.js'
import { FINMA_BANQUES_AFFAIRES } from './finmaBanquesAffaires.js'
import { FINMA_ASSET_MANAGERS }   from './finmaAssetManagers.js'

const FINMA_SOURCES = {
  gestionnaire_fortune: FINMA_GFI,
  banque_privee:        FINMA_BANQUES_PRIVEES,
  banque_affaires:      FINMA_BANQUES_AFFAIRES,
  asset_manager:        FINMA_ASSET_MANAGERS,
}

export function searchFinma({ segment, cantons = [], limit = 2000 }) {
  const source = FINMA_SOURCES[segment]
  if (!source) throw new Error(`Segment FINMA inconnu : ${segment}`)

  let results = source

  // Filtre canton
  if (cantons.length > 0) {
    results = results.filter((c) => c.canton && cantons.includes(c.canton))
  }

  // Trier par nom
  results = [...results].sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return results.slice(0, limit)
}

// Alias utilisé dans SegmentPanel (passe segment en option)
export function searchFinmaGFI({ cantons = [], limit = 2000, segment = 'gestionnaire_fortune' }) {
  return searchFinma({ segment, cantons, limit })
}
