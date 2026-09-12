// ─── Recherche de sociétés via Brave Search ───────────────────────────────────
// Pour les segments où ZEFIX est inefficace (family office, MFO).

export async function searchByBrave({ category, cantons = [] }) {
  const res = await fetch('/api/brave-segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, cantons }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data.companies ?? []
}
