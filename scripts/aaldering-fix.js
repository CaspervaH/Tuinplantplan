// scripts/aaldering-fix.js — data-kwaliteitsfix voor plants.js.
// Draait in GitHub Actions (volledige checkout; plants.js is te groot voor
// directe API-fetch). Taken:
//  1. OCR-naamfouten corrigeren
//  2. ontbrekende gegevens aanvullen (PDF-heranalyse pagina 1 + botanische kennis)
//  3. duplicaten verwijderen
//  4. isBeschikbaarBijAaldering: true op alle Aaldering-planten
//  5. index.html: flag op de inline planten + koppeling customplants.js
// Schrijft report.md voor het rapport-issue.
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

// ---- 1. exacte naamcorrecties (latijnseNaam) ----
var NAME_FIXES = {
  "Veronia crinita Alba'": "Vernonia crinita 'Alba'",
  "Anemone hybrida Coupe d'Argent'": "Anemone hybrida 'Coupe d'Argent'",
  "Aster novae-angliae 'Andenken an Alma P\u00f6tschke Aster": "Aster novae-angliae 'Andenken an Alma P\u00f6tschke'",
  "Penstemon 'Andenken an Friedrich Hahn' ('Garne Slangekop": "Penstemon 'Andenken an Friedrich Hahn'",
  "Tanecetum partemonium": "Tanacetum parthenium",
  "salvia nemorosa azure snow": "Salvia nemorosa 'Azure Snow'",
  "Geranium foundling Anke": "Geranium 'Foundling'",
  "Epimedium Sphinx Twinkler ('Spine Tingler'": "Epimedium 'Spine Tingler'",
  "Epimedium 'White Pink Form' (zhushanense Cc02": "Epimedium 'White Pink Form'",
  "kniphofia caulescens": "Kniphofia caulescens"
};
// substring-correcties (alle tekstvelden)
var SUB_FIXES = [
  ['Suger Melt', 'Sugar Melt'],
  ['Zuiverkaas', 'Zilverkaars']
];

// ---- 2. aanvullen van ontbrekende gegevens ----
// key = genormaliseerde latijnseNaam; alleen lege velden worden gevuld.
var FILLS = {
  // pagina 1 van de PDF (kolommen waren in de OCR verschoven)
  'adiantum venustrum': { nl: 'Venushaar', sp: 'Z - HS', kl: 'wit', van: 'juni', tot: 'aug', hv: 80, ht: 100 },
  'agastache alabaster': { nl: 'Anijshysop', sp: 'Z - HS', kl: 'wit', van: 'juli', tot: 'sept', hv: 120, ht: 120 },
  'agastache blue fortune': { nl: 'Anijshysop', sp: 'Z', kl: 'blauwpaars', van: 'juli', tot: 'aug', hv: 75, ht: 75 },
  'agastache foeniculum': { nl: 'Anijshysop', sp: 'Z - HS', kl: 'violetblauw' },
  'agastache little adder': { nl: 'Anijshysop', sp: 'Z', kl: 'violetblauw', van: 'juni', tot: 'sept', hv: 40, ht: 50 },
  'agastache purple haze': { nl: 'Anijshysop', sp: 'Z', kl: 'lilapaars', van: 'juli', tot: 'okt', hv: 90, ht: 90 },
  'ajuga alba': { nl: 'Zenegroen', sp: 'Z - S', kl: 'wit', van: 'mei', tot: 'juni', hv: 15, ht: 15 },
  'ajuga atropurpurea': { nl: 'Zenegroen', sp: 'Z - HS', kl: 'blauw - paars', van: 'mei', tot: 'juni', hv: 5, ht: 15 },
  'ajuga chocolate chips': { nl: 'Zenegroen', sp: 'HS', kl: 'blauw', van: 'mei', tot: 'juni', hv: 5, ht: 10 },
  'ajuga catlins giant': { nl: 'Zenegroen', sp: 'HS', kl: 'blauw', van: 'juni', tot: 'aug', hv: 30, ht: 30 },
  'ajuga metallica crispa': { nl: 'Zenegroen', sp: 'Z - HS', kl: 'paars', van: 'mei', tot: 'juni', hv: 20, ht: 20 },
  'ajuga reptans': { nl: 'Zenegroen', sp: 'Z - HS', kl: 'blauw - paars', van: 'mei', tot: 'juni', hv: 15, ht: 15 },
  'ajuga rosea': { nl: 'Zenegroen', sp: 'HS', kl: 'roze', van: 'mei', tot: 'juni', hv: 15, ht: 15 },
  'alchemilla erythropoda': { nl: 'Vrouwenmantel', sp: 'Z - HS', kl: 'geel - groen', van: 'mei', tot: 'juni', hv: 15, ht: 20 },
  'alchemilla mollis': { nl: 'Vrouwenmantel', sp: 'HS - S', kl: 'geel', van: 'mei', tot: 'aug', hv: 50, ht: 50 },
  'alchemilla vulgaris': { nl: 'Vrouwenmantel', sp: 'Z - HS', kl: 'geel', van: 'april', tot: 'juni', hv: 20, ht: 40 },
  'allium senescens lisa blue': { nl: 'Sierui', sp: 'Z', kl: 'lilaroze', van: 'aug', tot: 'sept', hv: 30, ht: 30 },
  // lege rijen aanvullen uit botanische kennis (alleen vertrouwde soorten)
  'amsonia hubrichtii': { sp: 'Z', kl: 'lichtblauw', van: 'aug', tot: 'sep', hv: 90, ht: 90 },
  'anemone ranunculoides': { nl: 'Geel anemoon', sp: 'HS - S', kl: 'geel', van: 'mrt', tot: 'mei', hv: 25, ht: 25 },
  'buddleja black night': { nl: 'Vlinderstruik', sp: 'Z', kl: 'donkerpaars', van: 'juli', tot: 'sep', hv: 150, ht: 150 },
  'buddleja little white': { nl: 'Vlinderstruik', sp: 'Z', kl: 'wit', van: 'juli', tot: 'sep', hv: 100, ht: 100 },
  'corydalis lutea': { nl: 'Gele helmbloem', sp: 'HS - S', kl: 'geel', van: 'mei', tot: 'sep', hv: 30, ht: 30 },
  'digitalis alba': { nl: 'Vingerhoedskruid', sp: 'HS', kl: 'wit', van: 'juni', tot: 'juli', hv: 120, ht: 120 },
  'digitalis suttons apricot': { nl: 'Vingerhoedskruid', sp: 'HS - S', kl: 'abrikoos', van: 'juni', tot: 'juli', hv: 120, ht: 120 },
  'geranium psilostemon': { nl: 'Ooievaarsbek', sp: 'Z', kl: 'magenta', van: 'juni', tot: 'juli', hv: 90, ht: 90 },
  'geranium rose queen': { nl: 'Ooievaarsbek', sp: 'Z', kl: 'roze', van: 'juni', tot: 'juli', hv: 40, ht: 40 },
  'helianthemum nummularium': { nl: 'Zonneroosje', sp: 'Z', kl: 'geel', van: 'juni', tot: 'sep', hv: 20, ht: 20 },
  'hepatica nobilis': { nl: 'Leverbloem', sp: 'HS - S', kl: 'blauw', van: 'mrt', tot: 'apr', hv: 10, ht: 10 },
  'hypericum calycinum': { nl: 'Hertshooi', sp: 'Z - S', kl: 'geel', van: 'juli', tot: 'sep', hv: 30, ht: 30 },
  'leonurus cardiaca': { nl: 'Hartgespan', sp: 'Z', kl: 'roze', van: 'juni', tot: 'aug', hv: 100, ht: 100 },
  'lysimachia ephemerum': { nl: 'Puntwederik', sp: 'Z - S', kl: 'lila - wit', van: 'juli', tot: 'aug', hv: 90, ht: 90 },
  'lysimachia vulgaris': { nl: 'Puntwederik', sp: 'Z - S', kl: 'geel', van: 'juli', tot: 'sep', hv: 120, ht: 120 },
  'lythrum happiness': { nl: 'Kattestaart', sp: 'S', kl: 'roze', van: 'juli', tot: 'sep', hv: 80, ht: 80 },
  'lythrum dropmore purple': { nl: 'Kattestaart', sp: 'S', kl: 'purperroze', van: 'juli', tot: 'sep', hv: 80, ht: 80 },
  'lythrum swirl': { nl: 'Kattestaart', sp: 'S', kl: 'roze', van: 'juli', tot: 'sep', hv: 90, ht: 90 },
  'luzula nivea': { nl: 'Sneeuwgras', sp: 'HS - S', kl: 'wit', van: 'juni', tot: 'juli', hv: 40, ht: 40 },
  'potentilla argentea': { sp: 'Z', kl: 'geel', van: 'juni', tot: 'aug', hv: 40, ht: 40 },
  'potentilla atrosanguinea': { sp: 'Z', kl: 'donkerrood', van: 'juni', tot: 'juli', hv: 60, ht: 60 },
  'saponaria officinalis': { nl: 'Zeepkruid', sp: 'Z - S', kl: 'roze', van: 'juli', tot: 'sep', hv: 60, ht: 60 },
  'scrophularia nodosa': { nl: 'Knopig helmkruid', sp: 'HS - S', kl: 'groenbruin', van: 'juni', tot: 'aug', hv: 100, ht: 100 },
  'thalictrum elin': { nl: 'Ruispijp', sp: 'Z - HS', kl: 'lila', van: 'juli', tot: 'aug', hv: 150, ht: 180 },
  'veronicastrum challenger': { sp: 'Z', kl: 'lilapaars', van: 'juli', tot: 'aug', hv: 150, ht: 150 },
  'fuchsia mrs popple': { sp: 'Z - HS', kl: 'rood - violet', van: 'juni', tot: 'okt', hv: 90, ht: 90 },
  'fuchsia riccartonii': { sp: 'Z - HS', kl: 'rood - violet', van: 'juni', tot: 'okt', hv: 100, ht: 100 },
  'pulmonaria miss elly': { nl: 'Vlongkruid', sp: 'HS - S', kl: 'roze - blauw', van: 'mrt', tot: 'mei', hv: 30, ht: 30 },
  'primula wanda': { sp: 'HS', kl: 'roodpaars', van: 'mrt', tot: 'apr', hv: 15, ht: 15 }
};

// ---- verwerken ----
var src = fs.readFileSync('plants.js', 'utf8');
var ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
var plants = ctx.window.PLANTEN_EXTRA;
if (!Array.isArray(plants)) throw new Error('plants.js: window.PLANTEN_EXTRA is geen array');

log('# Aaldering data-fix rapport');
log('');
log('Planten bij start: ' + plants.length);

// naamcorrecties
var fixesApplied = [], fixesMissing = [];
Object.keys(NAME_FIXES).forEach(function (oldName) {
  var hit = plants.some(function (p) { return p.latijnseNaam === oldName; });
  if (hit) fixesApplied.push(oldName); else fixesMissing.push(oldName);
  plants.forEach(function (p) { if (p.latijnseNaam === oldName) p.latijnseNaam = NAME_FIXES[oldName]; });
});
SUB_FIXES.forEach(function (pair) {
  plants.forEach(function (p) {
    ['latijnseNaam', 'nlNaam'].forEach(function (f) {
      if (p[f] && p[f].indexOf(pair[0]) !== -1) p[f] = p[f].split(pair[0]).join(pair[1]);
    });
  });
});
// kapotte kleurwaarden opruimen (OCR-rommel)
plants.forEach(function (p) {
  if (p.kleur && /William Stearn|zhushanese|Cc02|Garne/.test(p.kleur)) p.kleur = '';
});
log('Naamcorrecties toegepast: ' + fixesApplied.length + (fixesApplied.length ? ' (' + fixesApplied.join('; ') + ')' : ''));
if (fixesMissing.length) log('Naamcorrecties NIET gevonden: ' + fixesMissing.join('; '));

// aanvullen
var fillsMatched = [], fillsMissing = Object.keys(FILLS).slice();
plants.forEach(function (p) {
  var key = norm(p.latijnseNaam);
  if (!FILLS[key]) return;
  var f = FILLS[key];
  if (!p.nlNaam && f.nl) p.nlNaam = f.nl;
  if (!p.standplaats && f.sp) p.standplaats = f.sp;
  if (!p.kleur && f.kl) p.kleur = f.kl;
  if (!p.bloeiVan && f.van) p.bloeiVan = f.van;
  if (!p.bloeiTot && f.tot) p.bloeiTot = f.tot;
  if ((p.hoogteVan == null || p.hoogteVan === '') && f.hv != null) p.hoogteVan = f.hv;
  if ((p.hoogteTot == null || p.hoogteTot === '') && f.ht != null) p.hoogteTot = f.ht;
  p.isBeschikbaarBijAaldering = true;
  fillsMatched.push(key);
  var i = fillsMissing.indexOf(key); if (i !== -1) fillsMissing.splice(i, 1);
});
log('Aangevuld: ' + fillsMatched.length + ' planten');
if (fillsMissing.length) log('Vul-sleutels NIET gevonden in plants.js: ' + fillsMissing.join('; '));

// flag op alles
plants.forEach(function (p) { p.isBeschikbaarBijAaldering = true; });

// duplicaten eruit (op genormaliseerde naam, eerste exemplaar blijft)
var seen = {}, deduped = [], removed = [];
plants.forEach(function (p) {
  var k = norm(p.latijnseNaam);
  if (seen[k]) { removed.push(p.latijnseNaam); return; }
  seen[k] = true; deduped.push(p);
});
plants = deduped;
log('Duplicaten verwijderd: ' + removed.length + (removed.length ? ' (' + removed.join('; ') + ')' : ''));
log('Planten na fix: ' + plants.length);
var noKleur = plants.filter(function (p) { return !p.kleur; }).length;
var noHoogte = plants.filter(function (p) { return p.hoogteVan == null && p.hoogteTot == null; }).length;
log('Nog zonder kleur: ' + noKleur + ' · nog zonder hoogte: ' + noHoogte);

// ---- plants.js herschrijven ----
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

// ---- index.html ----
var idx = fs.readFileSync('index.html', 'utf8');
if (idx.indexOf('customplants.js') === -1) {
  var tagOld = '<script src="plants.js"></script>';
  if (idx.indexOf(tagOld) === -1) throw new Error('plants.js-script-tag niet gevonden in index.html');
  idx = idx.replace(tagOld, tagOld + '\n    <script src="customplants.js"></script>');
}
var apOld = 'const allPlants = [...plantData, ...(window.PLANTEN_EXTRA || [])];';
var apNew = 'const allPlants = [...plantData, ...(window.PLANTEN_EXTRA || []), ...((window.CustomPlants && window.CustomPlants.all()) || [])];';
if (idx.indexOf(apNew) === -1) {
  if (idx.indexOf(apOld) === -1) throw new Error('allPlants-regel niet gevonden in index.html');
  idx = idx.replace(apOld, apNew);
}
var flagged = 0;
idx = idx.replace(/\{[^{}]*latijnseNaam[^{}]*\}/g, function (m) {
  if (m.indexOf('isBeschikbaarBijAaldering') !== -1) return m;
  flagged++;
  return m.replace(/\s*\}\s*$/, ', isBeschikbaarBijAaldering: true }');
});
fs.writeFileSync('index.html', idx);
log('index.html: ' + flagged + ' inline planten van een isBeschikbaarBijAaldering-flag voorzien');
log('index.html: customplants.js geïntegreerd en eigen planten meegenomen in allPlants');

fs.writeFileSync('report.md', report.join('\n') + '\n');
console.log('Klaar.');
