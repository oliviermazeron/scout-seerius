# SCOUT — Swiss Financial Intelligence Platform

Sourcing d'intermédiaires financiers et juridiques suisses (banques, gestion de
patrimoine, avocats, notaires, fiduciaires, conseils fiscaux) pour Seerius, avec
synchronisation HubSpot et campagnes email.

Production : https://scout-seerius.vercel.app

## Stack

- Front : React 19 + Vite (`src/`)
- API : fonctions serverless Vercel (`api/`), helpers partagés dans `api/_lib/`
- Stockage partagé : Upstash Redis (intégration Vercel)
- Envoi d'emails : Gmail API (OAuth, compte olivier@seerius.ch)
- CRM : HubSpot, portail SEERIUS (ID 147633255, hébergement EU1, hôte API `api.hubapi.com`)

## Développement

```bash
npm install
node api-dev-server.mjs   # API locale sur :3001 (lit .env.local)
npm run dev               # front Vite, proxie /api vers :3001
npm test                  # tests (Gmail, HubSpot et Redis simulés)
```

## Campagne email Juridique & Fiscal

1. Dans un segment, sélectionner des cabinets → « ✉️ Campagne ».
2. Page « ✉️ Campagne email » : choisir le destinataire, relire l'email.
3. « ✉️ Envoyer » : envoi depuis Gmail, journalisation dans HubSpot, relance J+7
   automatique sans réponse. « 📋 Tâche HubSpot » : tâche pour un envoi manuel.

Garde-fous, dans l'ordre : code d'accès → créneau (lun–ven, 8 h–18 h, heure
suisse) → module communications actif → pas de doublon → pas de désinscription en
attente → statut d'abonnement HubSpot (fail-closed) → plafond journalier (20) →
envoi → journalisation.

La tâche Vercel Cron `/api/outreach/followups` (lun–ven, 07:00 UTC) détecte les
réponses, les rejets et les « stop », envoie les relances dues et reprend les
journalisations et désinscriptions en échec.

### Emails et tâches incomplets

Un gabarit incomplet est une erreur, pas un email à envoyer
(`src/services/emailGuard.js`, appliqué dans l'interface, `/api/hubspot-tasks` et
`/api/outreach/send`) : placeholder `[…]`, token `{{…}}` / `${…}`, critère sans
valeur, énumération trouée, `undefined`/`null`, objet ou texte vide. La
génération échoue aussi si le nom du signataire, la société ou un critère
d'acquisition (objectif Deal flow) manque. Les tâches HubSpot exigent en outre une
société associée, le contact dès qu'un nom est indiqué, et un propriétaire.

## Deux identifiants HubSpot, strictement séparés

| Variable | Identité HubSpot | Portées | Usage autorisé | Client |
|---|---|---|---|---|
| `HUBSPOT_SCOUT_KEY` (ou `HUBSPOT_TOKEN`, nom historique) | Clé de service « SCOUT » | `crm.objects.contacts.read/write`, `crm.objects.companies.read/write`, `sales-email-read`, `crm.objects.owners.read` | Contacts et sociétés (sourcing) ; création de l'objet email et association au contact ; tâches assignées (propriétaire lu via l'API owners) | `api/_lib/hubspot-scout.js` |
| `HUBSPOT_COMMS_TOKEN` | Application privée héritée « SCOUT COMMS » | `crm.objects.contacts.read`, `sales-email-read`, `communication_preferences.read_write` | Lecture du statut d'abonnement (type « Prospection Seerius — intermédiaires » + désinscription totale) ; enregistrement des désinscriptions | `api/_lib/hubspot-comms.js` |

Règles :

- Aucune écriture de contact, société ou email avec le token COMMS ; aucun appel
  de préférences de communication avec la clé SCOUT. Les routes n'appellent que
  ces deux clients ; `api/_lib/hubspot-http.js` (reprise sur 429 et 5xx) n'est
  utilisé que par eux.
- Les portées `crm.objects.emails.*` n'existent pas dans HubSpot : l'objet email
  est gouverné par les portées contacts + `sales-email-read`.
- Type d'abonnement visé : « Prospection Seerius — intermédiaires » (français).
  Son ID est lu via l'API des définitions et mis en cache en mémoire ; s'il est
  introuvable, inactif ou en double, l'envoi échoue explicitement (aucun repli
  sur « One to One » ou « Marketing Information », hors périmètre SCOUT).
- HubSpot est la référence du consentement. Le registre Redis des désinscriptions
  ne sert qu'à bloquer l'envoi tant qu'une désinscription reçue n'a pas pu être
  enregistrée dans HubSpot, et à la réessayer.
- Ne pas activer la journalisation automatique des emails sortants de
  l'intégration Gmail native de HubSpot (double journalisation).
- Désinscriptions écrites dans HubSpot : lien de désinscription (page de
  confirmation) et réponse « stop » détectée par la tâche quotidienne.

## Mode test : `HUBSPOT_DRY_RUN`

- Absente ou toute valeur autre que `false` → mode test : aucun envoi Gmail,
  aucune écriture HubSpot, aucun appel HubSpot ; le contenu est journalisé
  (`[SCOUT dry-run]`) et l'interface affiche « 🧪 Simulé ».
- `HUBSPOT_DRY_RUN=false` en Production uniquement, pour activer les envois réels.
- Sans `HUBSPOT_COMMS_TOKEN`, le module communications est désactivé : l'app et le
  sourcing fonctionnent, l'envoi réel est refusé.

## Variables d'environnement (Vercel)

Tous les secrets en **Production uniquement**, marqués **Sensitive**. Preview et
Development : aucun token HubSpot ni Google, `HUBSPOT_DRY_RUN=true`.

| Variable | Rôle |
|---|---|
| `HUBSPOT_SCOUT_KEY` / `HUBSPOT_TOKEN` | Clé de service HubSpot « SCOUT » |
| `HUBSPOT_COMMS_TOKEN` | Token de l'application privée « SCOUT COMMS » |
| `HUBSPOT_DRY_RUN` | `false` pour les envois réels (Production) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Client OAuth « SCOUT Web » (projet Google Cloud `scout-seerius`, type Interne) |
| `PUBLIC_URL` | `https://scout-seerius.vercel.app` (liens de désinscription, retour OAuth `/api/gmail/callback`) |
| `SCOUT_ACCESS_CODE` | Code demandé dans l'interface pour les actions Gmail |
| `OUTREACH_SECRET` | Signature des liens de désinscription |
| `CRON_SECRET` | Authentifie la tâche Vercel Cron |
| `OUTREACH_DAILY_CAP` | Plafond d'envois par jour (défaut 20) |
| `HUBSPOT_TASK_OWNER_EMAIL` | Propriétaire des tâches HubSpot (défaut olivier@seerius.ch) ; introuvable → aucune tâche créée |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (injectées par l'intégration) |
| `BRAVE_API_KEY`, `HUNTER_API_KEY`, `NINJAPEAR_API_KEY` | Enrichissement (sourcing) |

Portées Gmail demandées : `gmail.send` (envois et relances) et `gmail.readonly`
(détection des réponses, « stop » et rejets). L'autorisation Gmail est conservée
côté serveur dans Redis (`secret:gmail`), jamais exposée par `/api/store`.
