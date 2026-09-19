#!/usr/bin/env node
// ─── Rattrapage rétroactif : consigne dans HubSpot les emails SCOUT déjà envoyés ──
// Usage : node scripts/backfill-hubspot.js [--dry-run]
//
// Prérequis : copier .env.local dans l'environnement d'exécution ou exporter les
// variables manuellement :
//   export $(grep -v '^#' .env.local | xargs) && node scripts/backfill-hubspot.js
//
// Ce script ne rejoue pas les ouvertures (inrécupérables), uniquement la
// consignation de l'email envoyé (hs_email_direction = EMAIL) pour les
// enregistrements Redis dont l'état est 'queued', 'failed' ou absent.

import 'dotenv/config'
import { hgetallJSON, hsetJSON } from '../api/_lib/redis.js'
import { logEmail } from '../api/_lib/hubspot-scout.js'
import { buildHtmlBody, withUnsubscribe, SENDS_KEY } from '../api/_lib/outreach.js'
import { DEFAULT_AUDIENCE } from '../api/_lib/hubspot-comms.js'

const DRY_RUN = process.argv.includes('--dry-run')
const ORIGIN  = process.env.PUBLIC_URL || 'https://scout-seerius.vercel.app'

async function main() {
  const sends = await hgetallJSON(SENDS_KEY)
  const entries = Object.values(sends)
  console.log(`${entries.length} enregistrement(s) trouvé(s) dans Redis`)

  let backfilled = 0, skipped = 0, errors = 0

  for (const record of entries) {
    const logs = record.hubspotLogs ?? {}
    for (const [gmailId, entry] of Object.entries(logs)) {
      if (['logged', 'uncertain'].includes(entry.state)) { skipped++; continue }

      const aud = record.audience ?? DEFAULT_AUDIENCE
      const fullText = withUnsubscribe(entry.body, ORIGIN, record.email, aud)
      const fullHtml = buildHtmlBody(entry.body, ORIGIN, record.email, aud, { sentAt: entry.timestamp })

      if (DRY_RUN) {
        console.log(`[DRY-RUN] serait consigné : ${record.email} / ${gmailId} (état: ${entry.state})`)
        backfilled++
        continue
      }

      try {
        const r = await logEmail({
          contactId: record.contactId,
          companyId: record.companyId ?? null,
          subject:   entry.subject,
          text:      fullText,
          html:      fullHtml,
          from:      record.from,
          to:        record.email,
          timestamp: entry.timestamp,
        })
        if (r.ok) {
          logs[gmailId] = { ...entry, state: 'logged', hubspotId: r.id }
          await hsetJSON(SENDS_KEY, record.email, { ...record, hubspotLogs: logs })
          console.log(`✓ ${record.email} / ${gmailId} → HubSpot ${r.id}`)
          backfilled++
        } else {
          console.error(`✗ ${record.email} / ${gmailId} : ${r.error}`)
          errors++
        }
      } catch (err) {
        console.error(`✗ ${record.email} / ${gmailId} : ${err.message}`)
        errors++
      }
    }
  }

  console.log(`\nRésultat : ${backfilled} consigné(s), ${skipped} déjà logué(s), ${errors} erreur(s)`)
}

main().catch((err) => { console.error(err); process.exit(1) })
