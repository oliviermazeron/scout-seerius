// ─── Configuration serveur et garde-fous ─────────────────────────────────────
// Vérifiée au chargement de chaque route d'envoi (démarrage à froid de la
// fonction Vercel) et à chaque appel. Aucun secret n'est journalisé.
//
// HUBSPOT_DRY_RUN : mode test ACTIVÉ sauf valeur explicite « false ».
//   Actif → aucun envoi Gmail ni écriture HubSpot : le contenu est journalisé.
//   Choix délibéré : un déploiement Preview public ne doit jamais écrire dans le
//   CRM de production ni envoyer d'email.
// HUBSPOT_COMMS_TOKEN absent → module communications désactivé : aucun envoi
//   réel possible, puisque les désinscriptions ne peuvent pas être vérifiées.

export function isDryRun() {
  return String(process.env.HUBSPOT_DRY_RUN ?? 'true').trim().toLowerCase() !== 'false'
}

export function configStatus() {
  return {
    dryRun: isDryRun(),
    scoutKey: !!(process.env.HUBSPOT_SCOUT_KEY || process.env.HUBSPOT_TOKEN),
    commsEnabled: !!process.env.HUBSPOT_COMMS_TOKEN,
    gmail: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    redis: !!((process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
      || (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)),
    accessCode: !!process.env.SCOUT_ACCESS_CODE,
    outreachSecret: !!process.env.OUTREACH_SECRET,
  }
}

let reported = false

// Journalise une fois par instance l'état des modules sensibles
export function reportConfig() {
  if (reported) return
  reported = true
  const s = configStatus()
  if (s.dryRun) {
    console.info('[SCOUT] Mode test actif (HUBSPOT_DRY_RUN ≠ "false") : aucun envoi Gmail ni écriture HubSpot.')
  }
  if (!s.commsEnabled) {
    console.warn('[SCOUT] Module communications désactivé : HUBSPOT_COMMS_TOKEN absent. '
      + 'Envoi réel impossible (vérification des désinscriptions indisponible). Le sourcing reste fonctionnel.')
  }
  if (!s.scoutKey) console.warn('[SCOUT] Clé HubSpot SCOUT absente (HUBSPOT_SCOUT_KEY / HUBSPOT_TOKEN).')
}

export function logDryRun(action, payload) {
  console.info(`[SCOUT dry-run] ${action} ${JSON.stringify(payload)}`)
}
