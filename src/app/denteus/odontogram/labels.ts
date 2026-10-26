// Display names for the engine's coded values, EN/FR. Codes themselves are stored; these are only labels.
// shortcut: unlisted codes fall back to a readable form of the code, in any language.
import type { Lang } from '../../core/i18n/i18n.service';

const L: Record<string, [string, string]> = {
  none: ['None', 'Aucun'], normal: ['Normal', 'Normal'],
  'tooth-base': ['Permanent tooth', 'Dent permanente'], milktooth: ['Deciduous tooth', 'Dent temporaire'], implant: ['Implant', 'Implant'],
  'tooth-under-gum': ['Under the gum', 'Sous la gencive'], 'no-tooth-after-extraction': ['Extraction socket', 'Alvéole d’extraction'],
  natural: ['Natural crown', 'Couronne naturelle'], radix: ['Root remnant', 'Racine résiduelle'], broken: ['Broken crown', 'Couronne fracturée'], crownprep: ['Prepared for crown', 'Préparée pour couronne'],
  crown: ['Crown', 'Couronne'], bridge: ['Bridge', 'Bridge'], inlay: ['Inlay', 'Inlay'], onlay: ['Onlay', 'Onlay'], veneer: ['Veneer', 'Facette'],
  emax: ['E.max', 'E.max'], gold: ['Gold', 'Or'], gradia: ['Gradia', 'Gradia'], zircon: ['Zirconia', 'Zircone'], metal: ['Metal', 'Métal'],
  'metal-ceramic': ['Metal-ceramic', 'Métallo-céramique'], telescope: ['Telescope', 'Télescopique'], temporary: ['Temporary', 'Provisoire'],
  amalgam: ['Amalgam', 'Amalgame'], composite: ['Composite', 'Composite'], gic: ['Glass ionomer', 'Verre ionomère'],
  'healing-abutment': ['Healing abutment', 'Pilier de cicatrisation'], locator: ['Locator', 'Locator'], 'locator-denture': ['Locator denture', 'Prothèse sur locators'],
  bar: ['Bar', 'Barre'], 'bar-denture': ['Bar denture', 'Prothèse sur barre'], 'removable-partial': ['Removable partial denture', 'Prothèse partielle amovible'], 'removable-full': ['Complete denture', 'Prothèse complète'],
  'endo-medical-filling': ['Medicated dressing', 'Pansement médicamenteux'], 'endo-filling': ['Root filling', 'Obturation canalaire'], 'endo-filling-incomplete': ['Incomplete root filling', 'Obturation incomplète'],
  'endo-glass-pin': ['Root filling + glass pin', 'Obturation + tenon fibré'], 'endo-metal-pin': ['Root filling + metal post', 'Obturation + tenon métallique'],
  'reversible-pulpitis': ['Reversible pulpitis', 'Pulpite réversible'], 'irreversible-pulpitis': ['Irreversible pulpitis', 'Pulpite irréversible'], necrosis: ['Pulp necrosis', 'Nécrose pulpaire'],
  'symptomatic-apical-periodontitis': ['Symptomatic apical periodontitis', 'Parodontite apicale symptomatique'], 'asymptomatic-apical-periodontitis': ['Asymptomatic apical periodontitis', 'Parodontite apicale asymptomatique'],
  'acute-apical-abscess': ['Acute apical abscess', 'Abcès apical aigu'], 'chronic-apical-abscess': ['Chronic apical abscess', 'Abcès apical chronique'], 'condensing-osteitis': ['Condensing osteitis', 'Ostéite condensante'],
  granuloma: ['Granuloma', 'Granulome'], cyst: ['Cyst', 'Kyste'], abscess: ['Abscess', 'Abcès'],
  m1: ['Grade 1', 'Grade 1'], m2: ['Grade 2', 'Grade 2'], m3: ['Grade 3', 'Grade 3'],
  internal: ['Internal resorption', 'Résorption interne'], 'external-cervical': ['External cervical resorption', 'Résorption cervicale externe'],
  attrition: ['Attrition', 'Attrition'], erosion: ['Erosion', 'Érosion'], abrasion: ['Abrasion', 'Abrasion'], abfraction: ['Abfraction', 'Abfraction'],
  tetracycline: ['Tetracycline', 'Tétracycline'], fluorosis: ['Fluorosis', 'Fluorose'], nonvital: ['Non-vital', 'Non vitale'], extrinsic: ['Extrinsic stain', 'Tache extrinsèque'], other: ['Other', 'Autre'],
  bracket: ['Bracket', 'Bracket'], band: ['Band', 'Bague'], mesial: ['Mesial', 'Mésial'], distal: ['Distal', 'Distal'], extrusion: ['Extrusion', 'Égression'], intrusion: ['Intrusion', 'Ingression'],
  active: ['Active', 'Active'], arrested: ['Arrested', 'Stabilisée'], 'active-cavitated': ['Active, cavitated', 'Active, cavitaire'],
  mucositis: ['Mucositis', 'Mucosite'], 'peri-implantitis-mild': ['Peri-implantitis, mild', 'Péri-implantite légère'], 'peri-implantitis-moderate': ['Peri-implantitis, moderate', 'Péri-implantite modérée'], 'peri-implantitis-severe': ['Peri-implantitis, severe', 'Péri-implantite sévère'],
  marginal: ['Marginal defect', 'Défaut marginal'], fracture: ['Fracture', 'Fracture'], wear: ['Wear', 'Usure'],
  parodontal: ['Periodontal', 'Parodontal'], inflammation: ['Inflammation', 'Inflammation'],
  buccal: ['Buccal', 'Vestibulaire'], lingual: ['Lingual', 'Lingual'], occlusal: ['Occlusal', 'Occlusal'],
  'add': ['Add', 'Ajouter'], suppress: ['Suppress', 'Supprimer'],
};

export function label(code: string, lang: Lang): string {
  const hit = L[code];
  if (hit) return hit[lang === 'fr' ? 1 : 0];
  const s = code.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
