// scripts/aaldering-fix.js — data-kwaliteitsfix voor plants.js (ronde 8).
// Ronde 8: resterende kleur-hiaten dichten met bronvermelding.
//  - Heliopsis 'Bleeding Heart' -> 'Bleeding Hearts' (Walters Gardens /
//    White Flower Farm) + kleur oranje-rood. De ronde-5-vulkey miste deze
//    plant omdat de naam toen nog als 'Bleeding Heart' in plants.js stond.
//  - Salvia microphylla 'Andus' -> 'Anduus' (Middleton Nurseries) + roze-wit.
//  - Epimedium 'Thunderbolt' geel (E. pinnatum ssp. colchicum, Dancing Oaks).
//  - Epimedium 'Elenwe' wit (Pepinieres Delabroye, de kweker zelf).
//  - Acaena inermis 'Purpurea' bruin (Xera Plants: maroon orbs).
//  - Salvia jamensis 'La Siesta' roze (Ashwood / Middleton).
//  - Coreopsis verticillata 'Ruby Red' rood (RHS-achtige bronnen).
//  - Nepeta nuda 'Overhagen' lila (Nepeta nuda: bleeklila, Homegrown).
// Bewust NIET gevuld (nergens online te verifiëren, kwekerij-eigen rassen):
// Epimedium 'Elros', 'Fantur', 'Jorien', 'Maeglin', 'Mikado', 'Mini Drone',
// 'Nectar', 'Patricia', 'Pop-Up'; Salvia 'Manon', 'Free Magenta Lips',
// S. microphylla 'Fantasia', S. jamensis 'Lucilla'; Phlox (Arjan Schepers).
// Idempotent: alleen lege velden vullen.
var fs = require('fs');
var vm = require('vm');

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[\u00e0-\u00e5]/g, 'a').replace(/[\u00e8-\u00eb]/g, 'e')
    .replace(/[\u00ec-\u00ef]/g, 'i').replace(/[\u00f2-\u00f6]/g, 'o')
    .replace(/[\u00f9-\u00fc]/g, 'u').replace(/\u00e7/g, 'c')
    .replace(/\(.*?\)/g, ' ')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

var report = [];
function log(s) { report.push(s); console.log(s); }

var REGEX_FIXES = [
  [/Andenken an Alma P\u00f6tschke Aster'/g, "Andenken an Alma P\u00f6tschke'"],
  [/Suger Melt/g, 'Sugar Melt'],
  [/Zuiverkaas/g, 'Zilverkaars'],
  [/Elenw\u00c3\u00a9/g, 'Elenw\u00e9'],
  [/Epimedium wushanense 135/g, 'Epimedium wushanense'],
  [/Pottentilla/g, 'Potentilla'],
  [/Phlox \(Arjan Schepers\) \?/g, 'Phlox (Arjan Schepers)'],
  [/Heliopsis helianthoides var\. scabra 'Bleeding Heart'/g, "Heliopsis helianthoides var. scabra 'Bleeding Hearts'"],
  [/Salvia microphylla 'Andus'/g, "Salvia microphylla 'Anduus'"]
];

// vul-sleutels (genormaliseerde namen); alleen lege velden vullen
var FILLS = {
  'actaea simplex atropurpurea': { kl: 'wit' },
  'actaea japonica cheju do': { kl: 'wit' },
  'actaea simplex white pearl': { kl: 'wit' },
  'aruncus misty lace': { kl: 'wit' },
  'asclepias incarnata': { kl: 'roze' },
  'astilboides tabularis': { kl: 'wit' },
  'blechnum penna marina': { kl: 'groen' },
  'boehmeria nivea': { kl: 'groen' },
  'campanula rapunculus': { kl: 'blauw' },
  'chrysanthemum weisse melanie': { kl: 'wit' },
  'chrysosplenium alternifolium': { kl: 'geel - groen' },
  'convallaria majalis bridal choice': { kl: 'wit' },
  'erigeron annuus': { kl: 'wit' },
  'euphorbia myrsinites': { kl: 'geel - groen' },
  'fragaria ananassa': { kl: 'wit' },
  'fuchsia dying embers': { kl: 'violet - rood' },
  'fuchsia genii': { kl: 'rood - violet' },
  'fuchsia hatschbachii': { kl: 'rood' },
  'geranium magnificum turco': { kl: 'blauw - violet' },
  'geranium foundling': { kl: 'violetblauw' },
  'heliopsis helianthoides var scabra bleeding hearts': { kl: 'oranje - rood' },
  'isotoma fluviatilis': { kl: 'blauw' },
  'lysimachia nemorum': { kl: 'geel' },
  'mentha gracilis ginger': { kl: 'lila' },
  'mentha arvensis strawberry': { kl: 'lila' },
  'muehlenbeckia axillaris': { kl: 'groen - wit' },
  'parthenocissus quinquefolia': { kl: 'groen - wit' },
  'persicaria filiformis alba': { kl: 'wit' },
  'persicaria indian summer': { kl: 'rood' },
  'plectranthus mona lavender': { kl: 'lila' },
  'polemonium heaven scent': { kl: 'blauw' },
  'potentilla atrosanguinea': { kl: 'donkerrood' },
  'salvia pink dream': { kl: 'roze' },
  'salvia greggii salmon dance': { kl: 'zalm' },
  'salvia nemorosa azure snow': { kl: 'wit - blauw' },
  'salvia jamensis california sunset': { kl: 'perzik - oranje' },
  'salvia greggii golden girl': { kl: 'geel' },
  'sambucus nigra': { kl: 'wit' },
  'tanacetum parthenium': { kl: 'wit' },
  'taxus baccata': { kl: 'groen' },
  'taxus fastigiata': { kl: 'groen' },
  'thymus serpyllum minor': { kl: 'roze - paars' },
  'tolmiea menziesii cool gold': { kl: 'bruinrood' },
  'trifolium repens': { kl: 'wit' },
  'trifolium repens isabella': { kl: 'roze - paars' },
  'patrinia monandra': { kl: 'geel' },
  'saxifraga stolonifera': { kl: 'wit' },
  'epimedium wushanense': { kl: 'wit' },
  'epimedium thunderbolt': { kl: 'geel' },
  'epimedium elenwe': { kl: 'wit' },
  'acaena inermis purpurea': { kl: 'bruin' },
  'salvia jamensis la siesta': { kl: 'roze' },
  'salvia microphylla anduus': { kl: 'roze - wit' },
  'coreopsis verticillata ruby red': { kl: 'rood' },
  'nepeta nuda overhagen': { kl: 'lila' }
};

// ---- verwerken ----
var src = fs.readFileSync('plants.js', 'utf8');
var ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
var plants = ctx.window.PLANTEN_EXTRA;
if (!Array.isArray(plants)) throw new Error('plants.js: window.PLANTEN_EXTRA is geen array');

log('# Aaldering data-fix rapport (ronde 8 — resterende kleur-hiaten met bronvermelding)');
log('');
log('Planten bij start: ' + plants.length);

var regexHits = {};
REGEX_FIXES.forEach(function (rf) {
  plants.forEach(function (p) {
    ['latijnseNaam', 'nlNaam'].forEach(function (f) {
      if (p[f] && rf[0].test(p[f])) {
        regexHits[f + ':' + rf[1]] = (regexHits[f + ':' + rf[1]] || 0) + 1;
        p[f] = p[f].replace(rf[0], rf[1]);
      }
    });
    rf[0].lastIndex = 0;
  });
});
log('Regex-correcties: ' + JSON.stringify(regexHits));

// Amsonia hubrichtii: stond als lege rij in de PDF (pagina 2) en viel uit de
// oorspronkelijke parse. Gegevens uit betrouwbare bronnen (blauwe ster):
// lichtblauwe sterrenbloemen, eind lente - vroege zomer, 80-90 cm, zon/halfschaduw.
var amsonia = plants.filter(function (p) { return /amsonia/i.test(p.latijnseNaam || ''); });
log('Bestaande Amsonia-entries: ' + amsonia.map(function (p) { return p.latijnseNaam; }).join(' | '));
if (!plants.some(function (p) { return norm(p.latijnseNaam) === 'amsonia hubrichtii'; })) {
  plants.push({
    latijnseNaam: 'Amsonia hubrichtii', nlNaam: 'Blauwe ster',
    standplaats: 'Z - HS', kleur: 'lichtblauw',
    bloeiVan: 'mei', bloeiTot: 'juni', hoogteVan: 80, hoogteTot: 90
  });
  log('Amsonia hubrichtii TOEGEVOEGD (ontbrak volledig)');
}

function applyFill(p, f) {
  if (!p.nlNaam && f.nl) p.nlNaam = f.nl;
  if (!p.standplaats && f.sp) p.standplaats = f.sp;
  if (!p.kleur && f.kl) p.kleur = f.kl;
  if (!p.bloeiVan && f.van) p.bloeiVan = f.van;
  if (!p.bloeiTot && f.tot) p.bloeiTot = f.tot;
  if ((p.hoogteVan == null || p.hoogteVan === '') && f.hv != null) p.hoogteVan = f.hv;
  if ((p.hoogteTot == null || p.hoogteTot === '') && f.ht != null) p.hoogteTot = f.ht;
}

var fillsMatched = [], fillsMissing = [];
Object.keys(FILLS).forEach(function (key) {
  var hit = false;
  plants.forEach(function (p) {
    if (norm(p.latijnseNaam) === key) { applyFill(p, FILLS[key]); hit = true; }
  });
  if (hit) fillsMatched.push(key); else fillsMissing.push(key);
});
log('Aangevuld: ' + fillsMatched.length + ' planten');
if (fillsMissing.length) log('NIET gevonden: ' + fillsMissing.join('; '));

plants.forEach(function (p) { p.isBeschikbaarBijAaldering = true; });

// duplicaten op genormaliseerde naam (eerste exemplaar blijft)
var seen = {}, deduped = [], removed = [];
plants.forEach(function (p) {
  var k = norm(p.latijnseNaam);
  if (seen[k]) { removed.push(p.latijnseNaam); return; }
  seen[k] = true; deduped.push(p);
});
plants = deduped;
log('Duplicaten verwijderd: ' + removed.length + (removed.length ? ' (' + removed.join('; ') + ')' : ''));
plants.sort(function (a, b) { return String(a.latijnseNaam || '').localeCompare(String(b.latijnseNaam || ''), 'nl'); });
log('Planten na fix: ' + plants.length);

var noKleur = plants.filter(function (p) { return !p.kleur; });
log('Nog zonder kleur: ' + noKleur.length);
noKleur.forEach(function (p) { log('  - ' + p.latijnseNaam); });

function q(s) { return JSON.stringify(s == null ? '' : s); }
function num(n) { return (n == null || n === '') ? 'null' : String(n); }
var lines = plants.map(function (p) {
  return '  { latijnseNaam: ' + q(p.latijnseNaam) + ', nlNaam: ' + q(p.nlNaam) +
    ', standplaats: ' + q(p.standplaats) + ', kleur: ' + q(p.kleur) +
    ', bloeiVan: ' + q(p.bloeiVan) + ', bloeiTot: ' + q(p.bloeiTot) +
    ', hoogteVan: ' + num(p.hoogteVan) + ', hoogteTot: ' + num(p.hoogteTot) +
    ', isBeschikbaarBijAaldering: true },';
});
var out = [
  "// Plantenlijst — volledig aanbod Biologische Kwekerij Aaldering 'De Stek' (maart 2026)",
  '// Gegenereerd uit de PDF-export (OCR) + data-kwaliteitsfix (scripts/aaldering-fix.js).',
  '// Alle planten hierin zijn (mogelijk) leverbaar bij Aaldering: isBeschikbaarBijAaldering: true.',
  '// Eigen toegevoegde planten (customplants.js) krijgen isBeschikbaarBijAaldering: false.',
  'window.PLANTEN_EXTRA = [',
  lines.join('\n'),
  '];',
  ''
].join('\n');
fs.writeFileSync('plants.js', out);
log('plants.js herschreven');
fs.writeFileSync('report.md', report.join('\n') + '\n');
console.log('Klaar.');
