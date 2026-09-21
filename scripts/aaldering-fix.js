// scripts/aaldering-fix.js — data-kwaliteitsfix voor plants.js (r3, definitief).
// Draait in GitHub Actions. Idempotent: alleen lege velden vullen.
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
  [/Geranium\s+[Ff]oundling[^'",]*/g, "Geranium 'Foundling'"],
  [/Suger Melt/g, 'Sugar Melt'],
  [/Zuiverkaas/g, 'Zilverkaars'],
  [/Elenw\u00c3\u00a9/g, 'Elenw\u00e9'],
  [/Epimedium wushanense 135/g, 'Epimedium wushanense'],
  [/Pottentilla/g, 'Potentilla'],
  [/Phlox \(Arjan Schepers\) \?/g, 'Phlox (Arjan Schepers)']
];

// vul-sleutels: exact genormaliseerde namen (ronde 3: vooral kleuren van planten zonder kleur)
var FILLS = {
  'adiantum venustrum': { kl: 'wit' },
  'agastache rugosum alabaster': { kl: 'wit' },
  'agastache rugosa little adder': { kl: 'violetblauw' },
  'ajuga reptans alba': { kl: 'wit' },
  'ajuga reptans atropurpurea': { kl: 'blauw - paars' },
  'ajuga reptans chocolate chips': { kl: 'blauw' },
  'ajuga reptans catlins giant': { kl: 'blauw' },
  'ajuga pyramidalis metallica crispa': { kl: 'paars' },
  'ajuga reptans rosea': { kl: 'roze' },
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
  'isotoma fluviatilis': { kl: 'blauw' },
  'lysimachia nemorum': { kl: 'geel' },
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
  'sambucus nigra': { kl: 'wit' },
  'tanacetum parthenium': { kl: 'wit' },
  'taxus baccata': { kl: 'groen' },
  'taxus fastigiata': { kl: 'groen' },
  'thymus serpyllum minor': { kl: 'roze - paars' },
  'tolmiea menziesii cool gold': { kl: 'bruinrood' },
  'trifolium repens': { kl: 'wit' },
  'patrinia monandra': { kl: 'geel' },
  'saxifraga stolonifera': { kl: 'wit' },
  'epimedium wushanense': { kl: 'wit' }
};

var src = fs.readFileSync('plants.js', 'utf8');
var ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
var plants = ctx.window.PLANTEN_EXTRA;
if (!Array.isArray(plants)) throw new Error('plants.js: window.PLANTEN_EXTRA is geen array');

log('# Aaldering data-fix rapport (ronde 3)');
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
plants.forEach(function (p) {
  if (p.kleur && /William Stearn|zhushanese|Cc02|Garne/.test(p.kleur)) p.kleur = '';
});
log('Regex-correcties: ' + JSON.stringify(regexHits));

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

var seen = {}, deduped = [], removed = [];
plants.forEach(function (p) {
  var k = norm(p.latijnseNaam);
  if (seen[k]) { removed.push(p.latijnseNaam); return; }
  seen[k] = true; deduped.push(p);
});
plants = deduped;
log('Duplicaten verwijderd: ' + removed.length + (removed.length ? ' (' + removed.join('; ') + ')' : ''));
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

var idx = fs.readFileSync('index.html', 'utf8');
var apNew = 'const allPlants = [...plantData, ...(window.PLANTEN_EXTRA || []), ...((window.CustomPlants && window.CustomPlants.all()) || [])];';
if (idx.indexOf('customplants.js') === -1) {
  var tagOld = '<script src="plants.js"></script>';
  if (idx.indexOf(tagOld) === -1) throw new Error('plants.js-script-tag niet gevonden');
  idx = idx.replace(tagOld, tagOld + '\n    <script src="customplants.js"></script>');
}
if (idx.indexOf(apNew) === -1) {
  idx = idx.replace('const allPlants = [...plantData, ...(window.PLANTEN_EXTRA || [])];', apNew);
}
idx = idx.replace(/\{[^{}]*latijnseNaam[^{}]*\}/g, function (m) {
  if (m.indexOf('isBeschikbaarBijAaldering') !== -1) return m;
  return m.replace(/\s*\}\s*$/, ', isBeschikbaarBijAaldering: true }');
});
fs.writeFileSync('index.html', idx);
log('index.html gecontroleerd/bijgewerkt');
fs.writeFileSync('report.md', report.join('\n') + '\n');
console.log('Klaar.');
