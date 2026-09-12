// ─── Service FINMA GFI ────────────────────────────────────────────────────────
// Filtre le registre local FINMA des gestionnaires de fortune (1508 entités).
import { FINMA_GFI } from './finmaGfi.js'

export function searchFinmaGFI({ cantons = [], limit = 50, trusteeOnly = false }) {
  let results = FINMA_GFI

  // Filtre GFI / Trustee
  if (trusteeOnly) {
    results = results.filter((c) => c.isTrustee)
  }

  // Filtre canton
  if (cantons.length > 0) {
    results = results.filter((c) => c.canton && cantons.includes(c.canton))
  }

  // Trier par nom
  results = [...results].sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return results.slice(0, limit)
}
