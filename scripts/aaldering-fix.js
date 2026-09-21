// scripts/aaldering-fix.js — data-kwaliteitsfix voor plants.js (r2).
// Draait in GitHub Actions. Taken: OCR-naamfouten corrigeren (exact + regex),
// ontbrekende gegevens aanvullen (exact + fuzzy token-match), duplicaten
// verwijderen, isBeschikbaarBijAaldering: true op alles, index.html-integratie.
// Schrijft report.md voor het rapport-issue. Idempotent: alleen lege velden vullen.
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

// ---- naamcorrecties ----
var NAME_FIXES = {
  "Veronia crinita Alba'": "Vernonia crinita 'Alba'",
  "Anemone hybrida Coupe d'Argent'": "Anemone hybrida 'Coupe d'Argent'",
  "Penstemon 'Andenken an Friedrich Hahn' ('Garne Slangekop": "Penstemon 'Andenken an Friedrich Hahn'",
  "Tanecetum partemonium": "Tanacetum parthenium",
  "salvia nemorosa azure snow": "Salvia nemorosa 'Azure Snow'",
  "Epimedium Sphinx Twinkler ('Spine Tingler'": "Epimedium 'Spine Tingler'",
  "Epimedium 'White Pink Form' (zhushanense Cc02": "Epimedium 'White Pink Form'",
  "kniphofia caulescens": "Kniphofia caulescens"
};
var REGEX_FIXES = [
  [/Andenken an Alma P\u00f6tschke Aster'/g, "Andenken an Alma P\u00f6tschke'"],
  [/Geranium\s+[Ff]oundling[^'",]*/g, "Geranium 'Foundling'"],
  [/Suger Melt/g, 'Sugar Melt'],
  [/Zuiverkaas/g, 'Zilverkaars']
];

// ---- aanvullen van ontbrekende gegevens (key = genormaliseerde naam) ----
var FILLS = {
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

log('# Aaldering data-fix rapport (ronde 2)');
log('');
log('Planten bij start: ' + plants.length);

var fixesApplied = [], fixesMissing = [];
Object.keys(NAME_FIXES).forEach(function (oldName) {
  var hit = plants.some(function (p) { return p.latijnseNaam === oldName; });
  if (hit) fixesApplied.push(oldName); else fixesMissing.push(oldName);
  plants.forEach(function (p) { if (p.latijnseNaam === oldName) p.latijnseNaam = NAME_FIXES[oldName]; });
});
var regexHits = {};
REGEX_FIXES.forEach(function (rf) {
  plants.forEach(function (p) {
    ['latijnseNaam', 'nlNaam'].forEach(function (f) {
      if (p[f] && rf[0].test(p[f])) {
        regexHits[f] = (regexHits[f] || 0) + 1;
        p[f] = p[f].replace(rf[0], rf[1]);
      }
    });
    rf[0].lastIndex = 0;
  });
});
plants.forEach(function (p) {
  if (p.kleur && /William Stearn|zhushanese|Cc02|Garne/.test(p.kleur)) p.kleur = '';
});
log('Exacte naamcorrecties: ' + fixesApplied.length + ' toegepast' + (fixesMissing.length ? ' · niet gevonden: ' + fixesMissing.join('; ') : ''));
log('Regex-correcties toegepast: ' + JSON.stringify(regexHits));

function applyFill(p, f) {
  if (!p.nlNaam && f.nl) p.nlNaam = f.nl;
  if (!p.standplaats && f.sp) p.standplaats = f.sp;
  if (!p.kleur && f.kl) p.kleur = f.kl;
  if (!p.bloeiVan && f.van) p.bloeiVan = f.van;
  if (!p.bloeiTot && f.tot) p.bloeiTot = f.tot;
  if ((p.hoogteVan == null || p.hoogteVan === '') && f.hv != null) p.hoogteVan = f.hv;
  if ((p.hoogteTot == null || p.hoogteTot === '') && f.ht != null) p.hoogteTot = f.ht;
}

// pas 1: exacte match
var fillsMissing = [];
Object.keys(FILLS).forEach(function (key) {
  var hit = false;
  plants.forEach(function (p) {
    if (norm(p.latijnseNaam) === key) { applyFill(p, FILLS[key]); hit = true; }
  });
  if (!hit) fillsMissing.push(key);
});
log('Exact aangevuld: ' + (Object.keys(FILLS).length - fillsMissing.length) + ' planten');

// pas 2: fuzzy — plant waarvan de genormaliseerde naam alle woorden van de sleutel bevat
var fuzzy = [];
fillsMissing.forEach(function (key) {
  var tokens = key.split(' ');
  var candidates = plants.filter(function (p) {
    var n = ' ' + norm(p.latijnseNaam) + ' ';
    return tokens.every(function (t) { return n.indexOf(' ' + t) !== -1 || n.indexOf(t) !== -1; });
  });
  if (candidates.length === 1) {
    applyFill(candidates[0], FILLS[key]);
    fuzzy.push(key + ' -> ' + candidates[0].latijnseNaam);
  } else if (candidates.length > 1) {
    fuzzy.push(key + ' ?? meerdere kandidaten: ' + candidates.map(function (c) { return c.latijnseNaam; }).join(' | '));
  } else {
    fuzzy.push(key + ' ?? geen kandidaat');
  }
});
if (fuzzy.length) log('Fuzzy-matches:'); fuzzy.forEach(function (s) { log('  ' + s); });

plants.forEach(function (p) { p.isBeschikbaarBijAaldering = true; });

var seen = {}, deduped = [], removed = [];
plants.forEach(function (p) {
  var k = norm(p.latijnseNaam);
  if (seen[k]) { removed.push(p.latijnseNaam); return; }
  seen[k] = true; deduped.push(p);
});
plants = deduped;
log('Duplicaten verwijderd: ' + removed.length);
log('Planten na fix: ' + plants.length);

var noKleur = plants.filter(function (p) { return !p.kleur; });
log('Nog zonder kleur: ' + noKleur.length);
noKleur.forEach(function (p) { log('  - ' + p.latijnseNaam); });

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

// ---- index.html (idempotent) ----
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
log('index.html gecontroleerd/bijgewerkt (customplants.js + flag)');
fs.writeFileSync('report.md', report.join('\n') + '\n');
console.log('Klaar.');
