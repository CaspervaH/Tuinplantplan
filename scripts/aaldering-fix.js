// scripts/aaldering-fix.js — data-kwaliteitsfix voor plants.js (r6).
// r6: volledige synchronisatie met de Aaldering-PDF (883 rijen in
//     scripts/rows-part-01.txt .. rows-part-09.txt als compacte
//     JSON-regels, geparsede uit de OCR van alle 31 pagina's). Voor elke PDF-rij: (a) bestaat de plant in plants.js, dan
//     ontbrekende velden aanvullen uit de PDF-rij; (b) bestaat hij niet, dan
//     toevoegen — tenzij de naam lijkt op een bestaande (naamcorrectie uit
//     eerdere rondes of bekende OCR-variant), dan overslaan en rapporteren.
//     Plus externe aanvulling uit betrouwbare bronnen en diagnose-overzicht.
//     Idempotent: draait op de actuele checkout via GitHub Actions.

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

function lev(a, b) {
  var m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  var prev = new Array(n + 1), cur = new Array(n + 1), i, j;
  for (j = 0; j <= n; j++) prev[j] = j;
  for (i = 1; i <= m; i++) {
    cur[0] = i;
    for (j = 1; j <= n; j++) {
      var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    var tmp = prev; prev = cur; cur = tmp;
  }
  return prev[n];
}

var report = [];
function log(s) { report.push(s); console.log(s); }
function leeg(v) { return v === undefined || v === null || String(v).trim() === ''; }

// ---- plants.js lezen ----
var src = fs.readFileSync('plants.js', 'utf8');
var ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
var plants = ctx.window.PLANTEN_EXTRA;
if (!Array.isArray(plants)) throw new Error('plants.js: window.PLANTEN_EXTRA is geen array');

log('# Aaldering data-fix rapport (ronde 6 — volledige PDF-synchronisatie)');
log('');
log('Planten in plants.js bij start: ' + plants.length);

// ---- hoogte 0/0 is geen echte hoogte: normaliseren naar null ----
// (o.a. Actaea-entries; hierdoor kunnen externe bronnen ze later vullen)
var hoogteGefixeerd = 0;
plants.forEach(function (p) {
  if (p.hoogteVan !== null && p.hoogteVan !== '' && Number(p.hoogteVan) === 0 &&
      p.hoogteTot !== null && p.hoogteTot !== '' && Number(p.hoogteTot) === 0) {
    p.hoogteVan = null;
    p.hoogteTot = null;
    hoogteGefixeerd++;
  }
});
log('Hoogte 0/0 omgezet naar null (lege hoogte): ' + hoogteGefixeerd + ' planten');

// ---- naamcorrectie: 'Chrystal Blue' -> 'Crystal Blue' (officiele cultivarnaam) ----
var naamFixes = 0;
plants.forEach(function (p) {
  if (p.latijnseNaam && /Chrystal Blue/i.test(p.latijnseNaam)) {
    p.latijnseNaam = p.latijnseNaam.replace(/Chrystal Blue/i, 'Crystal Blue');
    naamFixes++;
  }
});
log("Naamcorrectie 'Chrystal Blue' -> 'Crystal Blue': " + naamFixes + 'x');

// ---- PDF-rijen synchroniseren ----
// De 883 PDF-rijen staan als compacte JSON-regels in 9 deelbestanden
// scripts/rows-part-01.txt .. rows-part-09.txt (gegenereerd uit de OCR van
// de PDF; zie rapport ronde 5/6). Bestandsnamen zijn zero-padded en worden
// gesorteerd gelezen.
var rows = [];
fs.readdirSync('scripts').sort().forEach(function (f) {
  if (f.indexOf('rows-part-') !== 0) return;
  fs.readFileSync('scripts/' + f, 'utf8').split('\n').forEach(function (line) {
    line = line.trim();
    if (line) rows.push(JSON.parse(line));
  });
});
rows = rows.map(function (r) {
  return { n: r[0], nl: r[1], sp: r[2], kl: r[3], bv: r[4], bt: r[5], hv: r[6], ht: r[7] };
});
log('PDF-rijen in scripts/rows-part-01..09.txt: ' + rows.length);
log('');

function vind(naam) {
  var key = norm(naam);
  for (var i = 0; i < plants.length; i++) {
    if (norm(plants[i].latijnseNaam) === key) return plants[i];
  }
  return null;
}

// Bekende OCR-rijen waarvan de plantnaam in plants.js al gecorrigeerd is
// (eerdere rondes) — niet opnieuw toevoegen:
var SKIP = [
  'penstemon andenken an friedrich hahn garne slangekop',
  'epimedium white pink form zhushanense cc02',
  'epimedium wushanense 135',
  'tanecetum partemonium',
  'geranium foundling anke',
  'aster novae angliae andenken an alma potschke aster',
  'pottentilla atrosanguinea',
  'veronia crinita alba'
];

function lijktOpBestaande(naam) {
  var key = norm(naam);
  var best = null, bestRatio = 0;
  var prefix = key.slice(0, 2);
  for (var i = 0; i < plants.length; i++) {
    var pn = norm(plants[i].latijnseNaam);
    if (!pn || pn.slice(0, 2) !== prefix) continue;
    var d = lev(key, pn);
    var ratio = 1 - d / Math.max(key.length, pn.length);
    if (ratio > bestRatio) { bestRatio = ratio; best = plants[i]; }
  }
  // 0.75 i.p.v. 0.80: voorkomt dat OCR-varianten (bijv. 'Anemone hybrida
  // 'Königin Charlotte'' vs bestaande 'Anemone 'Konigin Charlotte'') als
  // nieuwe plant worden toegevoegd. Overgeslagen rijen komen in het rapport.
  return bestRatio >= 0.75 ? best : null;
}

// NL-namen die OCR-rommel zijn, nooit overnemen:
var NL_GARBAGE = ['Anke', '?', '-', '9', ''];

var fillFields = [
  ['nlNaam', 'nl'],
  ['standplaats', 'sp'],
  ['kleur', 'kl'],
  ['bloeiVan', 'bv'],
  ['bloeiTot', 'bt'],
  ['hoogteVan', 'hv'],
  ['hoogteTot', 'ht']
];

var toegevoegd = 0, gevuldeVelden = 0, gevuldePlanten = 0, overgeslagen = 0;
var addLog = [], skipLog = [], fillLog = [];

rows.forEach(function (row) {
  if (leeg(row.n)) return;
  if (SKIP.indexOf(norm(row.n)) !== -1) {
    overgeslagen++;
    skipLog.push("- PDF-rij '" + row.n + "' heeft in plants.js al een gecorrigeerde naam (eerdere fix) — niet opnieuw toegevoegd");
    return;
  }
  var p = vind(row.n);
  if (!p) {
    var dub = lijktOpBestaande(row.n);
    if (dub) {
      overgeslagen++;
      skipLog.push("- PDF-rij '" + row.n + "' lijkt al aanwezig als '" + dub.latijnseNaam + "' — niet toegevoegd");
      return;
    }
    plants.push({
      latijnseNaam: row.n,
      nlNaam: (row.nl && NL_GARBAGE.indexOf(row.nl) === -1) ? row.nl : '',
      standplaats: row.sp || '',
      kleur: row.kl || '',
      bloeiVan: row.bv || '',
      bloeiTot: row.bt || '',
      hoogteVan: row.hv != null ? row.hv : null,
      hoogteTot: row.ht != null ? row.ht : null
    });
    toegevoegd++;
    addLog.push('- ' + row.n + ' toegevoegd uit de PDF' +
      (row.kl ? ' (kleur ' + row.kl + ')' : '') +
      (row.bv ? ' (bloei ' + row.bv + ' - ' + row.bt + ')' : '') +
      (row.hv != null ? ' (hoogte ' + row.hv + ' - ' + row.ht + ' cm)' : '') +
      (row.sp ? ' (' + row.sp + ')' : ''));
    return;
  }
  // bestaand: ontbrekende velden aanvullen uit de PDF-rij
  var gewijzigd = [];
  fillFields.forEach(function (pair) {
    var veld = pair[0], key = pair[1];
    var val = row[key];
    if (val === undefined || val === null || String(val).trim() === '') return;
    if (veld === 'nlNaam' && NL_GARBAGE.indexOf(String(val).trim()) !== -1) return;
    if (leeg(p[veld])) {
      p[veld] = val;
      gewijzigd.push(veld);
    }
  });
  if (gewijzigd.length) {
    gevuldePlanten++;
    gevuldeVelden += gewijzigd.length;
    fillLog.push('- ' + p.latijnseNaam + ': ' + gewijzigd.join(', ') + ' aangevuld uit de PDF');
  }
});

log('## Synchronisatie met de PDF');
log('');
log('Nieuwe planten toegevoegd: ' + toegevoegd);
addLog.forEach(function (s) { log(s); });
log('');
log('Niet toegevoegd (al aanwezig onder gecorrigeerde/overeenkomende naam): ' + overgeslagen);
skipLog.forEach(function (s) { log(s); });
log('');
log('Bestaande planten met ontbrekende velden aangevuld uit de PDF: ' + gevuldePlanten + ' (' + gevuldeVelden + ' velden)');
fillLog.forEach(function (s) { log(s); });

// ---- Externe aanvulling (betrouwbare bronnen; alléén lege velden vullen) ----
// Persicaria affinis: PDF-rij is leeg (kwekerij vermeldt zelf geen gegevens).
// Actaea/Agastache foeniculum: pagina 1 van de PDF heeft verschoven
// kolomblokken; data uit Gardenia.net / Missouri Botanical Garden.
var EXTERN = [
  { naam: 'Persicaria affinis', nlNaam: 'Duizendknoop', standplaats: 'Z - HS', kleur: 'roze',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 15, hoogteTot: 25,
    bron: 'Gardenia.net / BBC Gardeners World Magazine' },
  { naam: "Actaea simplex 'Atropurpurea'", standplaats: 'HS - S', kleur: 'wit',
    bloeiVan: 'september', bloeiTot: 'oktober', hoogteVan: 120, hoogteTot: 180,
    bron: 'Gardenia.net / Missouri Botanical Garden' },
  { naam: "Actaea japonica 'Cheju Do'", standplaats: 'HS - S', kleur: 'wit',
    bloeiVan: 'augustus', bloeiTot: 'september', hoogteVan: 60, hoogteTot: 90,
    bron: 'Missouri Botanical Garden' },
  { naam: "Actaea simplex 'White Pearl'", standplaats: 'HS - S', kleur: 'wit',
    bloeiVan: 'september', bloeiTot: 'oktober', hoogteVan: 120, hoogteTot: 150,
    bron: 'Gardenia.net / RHS' },
  { naam: 'Agastache foeniculum', standplaats: 'Z - HS', kleur: 'violetblauw',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 60, hoogteTot: 90,
    bron: 'Gardenia.net / Missouri Botanical Garden' }
];
log('');
log('## Externe aanvulling');
EXTERN.forEach(function (f) {
  var p = vind(f.naam);
  if (!p) {
    plants.push({
      latijnseNaam: f.naam, nlNaam: f.nlNaam || '', standplaats: f.standplaats || '',
      kleur: f.kleur || '', bloeiVan: f.bloeiVan || '', bloeiTot: f.bloeiTot || '',
      hoogteVan: f.hoogteVan != null ? f.hoogteVan : null,
      hoogteTot: f.hoogteTot != null ? f.hoogteTot : null
    });
    log('- ' + f.naam + ': toegevoegd (' + f.bron + ')');
    return;
  }
  var gewijzigd = [];
  ['nlNaam', 'standplaats', 'kleur', 'bloeiVan', 'bloeiTot', 'hoogteVan', 'hoogteTot'].forEach(function (veld) {
    if (f[veld] === undefined) return;
    if (leeg(p[veld])) { p[veld] = f[veld]; gewijzigd.push(veld); }
  });
  log('- ' + f.naam + (gewijzigd.length ? ': ' + gewijzigd.join(', ') + ' aangevuld (' + f.bron + ')' : ': al volledig'));
});

// ---- Overzicht: planten die na deze ronde nog gegevens missen ----
var missend = { standplaats: [], kleur: [], bloeiVan: [], bloeiTot: [], hoogte: [] };
plants.forEach(function (p) {
  if (leeg(p.standplaats)) missend.standplaats.push(p.latijnseNaam);
  if (leeg(p.kleur)) missend.kleur.push(p.latijnseNaam);
  if (leeg(p.bloeiVan)) missend.bloeiVan.push(p.latijnseNaam);
  if (leeg(p.bloeiTot)) missend.bloeiTot.push(p.latijnseNaam);
  if (leeg(p.hoogteVan) && leeg(p.hoogteTot)) missend.hoogte.push(p.latijnseNaam);
});
log('');
log('## Planten die na deze ronde nog gegevens missen');
Object.keys(missend).forEach(function (k) {
  log('');
  log('### Geen ' + k + ': ' + missend[k].length);
  missend[k].forEach(function (n) { log('- ' + n); });
});

// ---- plants.js herschrijven (vaste opmaak, alles is leverbaar bij Aaldering) ----
plants.forEach(function (p) { p.isBeschikbaarBijAaldering = true; });

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
log('');
log('plants.js herschreven: ' + plants.length + ' planten');

// ---- index.html: idempotent herstel + correcte integratie ----
var idx = fs.readFileSync('index.html', 'utf8');

var before = (idx.match(/, isBeschikbaarBijAaldering: true \}/g) || []).length;
idx = idx.split(', isBeschikbaarBijAaldering: true }').join(' }');
log('Verwijderde flag-invoegingen in index.html: ' + before);

var start = idx.indexOf('plantData = [');
if (start === -1) throw new Error('plantData-array niet gevonden in index.html');
var end = idx.indexOf('];', start);
if (end === -1) throw new Error('plantData-array loopt niet af');
var slice = idx.slice(start, end);
var flagged = 0;
slice = slice.replace(/\{[^{}]*latijnseNaam[^{}]*\}/g, function (m) {
  if (m.indexOf('isBeschikbaarBijAaldering') !== -1) return m;
  flagged++;
  return m.replace(/\s*\}\s*$/, ', isBeschikbaarBijAaldering: true }');
});
idx = idx.slice(0, start) + slice + idx.slice(end);
log('plantData-entries in index.html van flag voorzien: ' + flagged);

var apNew = 'const allPlants = [...plantData, ...(window.PLANTEN_EXTRA || []), ...((window.CustomPlants && window.CustomPlants.all()) || [])];';
if (idx.indexOf('customplants.js') === -1) {
  var tagOld = '<script src="plants.js"></script>';
  if (idx.indexOf(tagOld) === -1) throw new Error('plants.js-script-tag niet gevonden');
  idx = idx.replace(tagOld, tagOld + '\n    <script src="customplants.js"></script>');
  log('customplants.js-tag toegevoegd');
}
if (idx.indexOf(apNew) === -1) {
  idx = idx.replace('const allPlants = [...plantData, ...(window.PLANTEN_EXTRA || [])];', apNew);
  log('allPlants-regel uitgebreid met eigen planten');
}

var blocks = idx.match(/<script>([\s\S]*?)<\/script>/g) || [];
blocks.forEach(function (b) {
  new Function(b.slice(8, -9));
});
log('Parse-check: ' + blocks.length + ' inline script(s) in index.html parseeren correct');

if (!idx.trimEnd().endsWith('</html>')) throw new Error('index.html eindigt niet op </html>');
fs.writeFileSync('index.html', idx);
log('index.html gecontroleerd en weggeschreven');

fs.writeFileSync('report.md', report.join('\n') + '\n');
console.log('Klaar.');
