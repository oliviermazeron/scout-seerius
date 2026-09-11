// ─── Liste fixe des banques cantonales suisses ────────────────────────────────
// Source : https://www.kantonalbank.ch / sites officiels de chaque banque
// 24 banques cantonales actives (GL et SO sont privées depuis longtemps)
// Pour chaque banque : nom officiel, canton, site web, UID ZEFIX

export const BANQUES_CANTONALES = [
  { name: 'Aargauische Kantonalbank',          canton: 'AG', website: 'https://www.akb.ch',     uid: 'CHE-105.904.984' },
  { name: 'Appenzell Ausserrhoder Kantonalbank',canton: 'AR', website: 'https://www.arkb.ch',    uid: 'CHE-105.963.235' },
  { name: 'Appenzell Innerrhoder Kantonalbank', canton: 'AI', website: 'https://www.aikb.ch',    uid: 'CHE-105.963.376' },
  { name: 'Basellandschaftliche Kantonalbank',  canton: 'BL', website: 'https://www.blkb.ch',    uid: 'CHE-105.906.178' },
  { name: 'Basler Kantonalbank',                canton: 'BS', website: 'https://www.bkb.ch',     uid: 'CHE-105.906.289' },
  { name: 'Banque Cantonale de Fribourg',       canton: 'FR', website: 'https://www.bcf.ch',     uid: 'CHE-105.907.401' },
  { name: 'Banque Cantonale de Genève',         canton: 'GE', website: 'https://www.bcge.ch',    uid: 'CHE-105.907.623' },
  { name: 'Glarner Kantonalbank',               canton: 'GL', website: 'https://www.glkb.ch',    uid: 'CHE-105.905.094' },
  { name: 'Graubündner Kantonalbank',           canton: 'GR', website: 'https://www.gkb.ch',     uid: 'CHE-105.905.205' },
  { name: 'Banque Cantonale du Jura',           canton: 'JU', website: 'https://www.bcj.ch',     uid: 'CHE-105.932.421' },
  { name: 'Luzerner Kantonalbank',              canton: 'LU', website: 'https://www.lukb.ch',    uid: 'CHE-105.905.427' },
  { name: 'Banque Cantonale de Neuchâtel',      canton: 'NE', website: 'https://www.bcn.ch',     uid: 'CHE-105.909.636' },
  { name: 'Nidwaldner Kantonalbank',            canton: 'NW', website: 'https://www.nkb.ch',     uid: 'CHE-105.905.649' },
  { name: 'Obwaldner Kantonalbank',             canton: 'OW', website: 'https://www.owkb.ch',    uid: 'CHE-105.905.760' },
  { name: 'St. Galler Kantonalbank',            canton: 'SG', website: 'https://www.sgkb.ch',    uid: 'CHE-105.906.399' },
  { name: 'Schaffhauser Kantonalbank',          canton: 'SH', website: 'https://www.shkb.ch',    uid: 'CHE-105.906.510' },
  { name: 'Schwyzer Kantonalbank',              canton: 'SZ', website: 'https://www.szkb.ch',    uid: 'CHE-105.906.621' },
  { name: 'Solothurner Kantonalbank',           canton: 'SO', website: 'https://www.sokb.ch',    uid: 'CHE-105.906.732' },
  { name: 'Thurgauer Kantonalbank',             canton: 'TG', website: 'https://www.tkb.ch',     uid: 'CHE-105.906.843' },
  { name: 'Banca dello Stato del Cantone Ticino',canton:'TI', website: 'https://www.bancastato.ch', uid: 'CHE-105.906.954' },
  { name: 'Urner Kantonalbank',                 canton: 'UR', website: 'https://www.urkb.ch',    uid: 'CHE-105.907.065' },
  { name: 'Banque Cantonale Vaudoise',          canton: 'VD', website: 'https://www.bcv.ch',     uid: 'CHE-105.910.184' },
  { name: 'Walliser Kantonalbank / Banque Cantonale du Valais', canton: 'VS', website: 'https://www.bcvs.ch', uid: 'CHE-105.910.295' },
  { name: 'Zuger Kantonalbank',                 canton: 'ZG', website: 'https://www.zugerkb.ch', uid: 'CHE-105.907.287' },
  { name: 'Zürcher Kantonalbank',               canton: 'ZH', website: 'https://www.zkb.ch',     uid: 'CHE-105.907.398' },
  { name: 'Bernische Kantonalbank / Banque Cantonale Bernoise', canton: 'BE', website: 'https://www.bekb.ch', uid: 'CHE-105.906.067' },
].map((b) => ({
  ...b,
  legalForm: 'Établissement cantonal',
  legalFormId: null,
  municipality: null,
  shabDate: '',
  excerptUrl: b.website,
  status: 'active',
  contacts: [],
}))

// Filtre optionnel par canton
export function getBanquesCantonales({ cantons = [] } = {}) {
  if (cantons.length === 0) return BANQUES_CANTONALES
  return BANQUES_CANTONALES.filter((b) => cantons.includes(b.canton))
}
