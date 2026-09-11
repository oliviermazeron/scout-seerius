// ─── ZEFIX REST API — adapté pour SCOUT ──────────────────────────────────────
// Source  : https://www.zefix.admin.ch/ZefixREST/api/v1
// Objectif: identifier fiduciaires et cabinets d'avocats via code NOGA
//
// Codes NOGA utilisés :
//   6920 → Comptabilité, tenue de livres, audit, conseil fiscal (fiduciaires)
//   6910 → Activités juridiques (avocats, notaires, conseillers juridiques)
//
// NB : L'API ZEFIX REST ne filtre pas directement par NOGA dans /firm/search.
//      La stratégie est : recherche par mots-clés sectoriels + filtrage post-query
//      sur le nom de la société (mots indicateurs de l'activité).

const BASE = import.meta.env.DEV ? '/zefix' : '/api/zefix';

// ─── Formes juridiques (identiques à SwissDealScout) ─────────────────────────
export const LEGAL_FORMS = {
  1: 'EI',
  2: 'SNC',
  3: 'SA',
  4: 'Sàrl',
  5: 'Coopérative',
  6: 'Association',
  7: 'Fondation',
  9: 'Succursale',
  10: 'SCm',
};

// Formes acceptées pour les intermédiaires (on inclut aussi EI et SNC pour les petits cabinets)
const INTERMEDIARY_FORMS = [1, 2, 3, 4];

// ─── Mots-clés indicateurs par segment ───────────────────────────────────────
export const SEGMENT_KEYWORDS = {
  fiduciaire: [
    'fiduciaire', 'fiducia', 'treuhand', 'comptable', 'audit', 'révision',
    'expertise comptable', 'conseil fiscal', 'tax', 'steuer',
  ],
  avocat: [
    'avocat', 'avocats', 'notaire', 'étude', 'cabinet juridique',
    'rechtsanwalt', 'rechtsanwälte', 'anwaltskanzlei', 'advokat',
    'law', 'legal', 'juridique',
  ],
  banque_cantonale: [
    'banque cantonale', 'kantonalbank', 'bcv', 'bcge', 'bcn', 'bcf',
    'bcvs', 'gkb', 'zkb', 'akb', 'lukb', 'sgkb', 'blkb', 'bkb',
  ],
  banque_affaires: [
    'banque', 'bank', 'finance', 'capital', 'partners', 'advisory',
    'm&a', 'corporate finance', 'investissement', 'investment',
    'private equity', 'boutique',
  ],
};

// ─── Détection du canton via l'URL d'extrait cantonal ────────────────────────
const CANTON_PATTERNS = {
  VD: ['vd.ch', 'prestations.vd'],
  GE: ['ge.ch', 'geneve.ch', 'rcge.ch'],
  NE: ['ne.ch', 'rcnet.ne'],
  FR: ['fr.ch', 'fribourg'],
  VS: ['vs.ch', 'valais'],
  JU: ['ju.ch', 'jura'],
  ZH: ['zh.ch', 'handelsregister.zh'],
  BE: ['be.ch', 'berncity'],
  BS: ['bs.ch', 'basel-stadt'],
  BL: ['bl.ch', 'baselland'],
  AG: ['ag.ch', 'aargau'],
  SG: ['sg.ch', 'st.gallen'],
  LU: ['lu.ch', 'luzern'],
  ZG: ['zg.ch', 'zug'],
  SO: ['so.ch', 'solothurn'],
  SH: ['sh.ch', 'schaffhausen'],
  TG: ['tg.ch', 'thurgau'],
  GR: ['gr.ch', 'graubuenden'],
  TI: ['ti.ch', 'ticino'],
  UR: ['ur.ch'],
  SZ: ['sz.ch', 'schwyz'],
  OW: ['ow.ch', 'obwalden'],
  NW: ['nw.ch', 'nidwalden'],
  GL: ['gl.ch', 'glarus'],
  AR: ['ar.ch', 'appenzell'],
  AI: ['ai.ch'],
};

function detectCanton(excerptUrl = '') {
  if (!excerptUrl) return null;
  const url = excerptUrl.toLowerCase();
  for (const [canton, patterns] of Object.entries(CANTON_PATTERNS)) {
    if (patterns.some((p) => url.includes(p))) return canton;
  }
  return null;
}

// ─── Normalisation d'une entrée ZEFIX ────────────────────────────────────────
function normalizeCompany(c) {
  return {
    name: c.name ?? '',
    uid: c.uidFormatted ?? c.uid ?? '',
    legalFormId: c.legalFormId,
    legalForm: LEGAL_FORMS[c.legalFormId] ?? String(c.legalFormId),
    municipality: c.legalSeat ?? '',
    canton: detectCanton(c.cantonalExcerptWeb),
    shabDate: c.shabDate ?? '',
    excerptUrl: c.cantonalExcerptWeb ?? '',
    status: c.status === 'EXISTIEREND' ? 'active' : 'radié',
    website: null,     // à enrichir via scraping
    contacts: [],      // à enrichir via Proxycurl
  };
}

// ─── Core fetch ──────────────────────────────────────────────────────────────
async function post(path, body) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`ZEFIX ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data?.error) throw new Error(data.error.message || data.error.code);
    return data;
  } catch (err) {
    clearTimeout(tid);
    throw err;
  }
}

// ─── Recherche d'intermédiaires par segment et canton ────────────────────────
// segment : 'fiduciaire' | 'avocat' | 'banque_cantonale' | 'banque_affaires'
// cantons : ['VD', 'GE', ...] — filtre optionnel

export async function searchIntermediaries({ segment, cantons = [], limit = 30 }) {
  const keywords = SEGMENT_KEYWORDS[segment] ?? [];
  if (!keywords.length) throw new Error(`Segment inconnu : ${segment}`);

  let allCompanies = [];

  // On lance une recherche ZEFIX par mot-clé pour chaque terme du segment
  for (const kw of keywords) {
    try {
      const data = await post('/firm/search.json', {
        name: kw,
        maxEntries: 50,
        activeOnly: true,
      });
      allCompanies.push(...(data.list ?? []).map(normalizeCompany));
    } catch {
      // On continue si un mot-clé échoue
    }
  }

  // Dédoublonner par UID
  const seen = new Set();
  let companies = allCompanies.filter((c) => {
    if (seen.has(c.uid)) return false;
    seen.add(c.uid);
    return true;
  });

  // Filtrer sur les formes juridiques pertinentes
  companies = companies.filter((c) => INTERMEDIARY_FORMS.includes(c.legalFormId));

  // Filtrer par canton si spécifié
  if (cantons.length > 0) {
    companies = companies.filter((c) => c.canton && cantons.includes(c.canton));
  }

  // Trier par nom
  companies.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return companies.slice(0, limit);
}
