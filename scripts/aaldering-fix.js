// scripts/aaldering-fix.js — data-kwaliteitsfix voor plants.js (r4).
// r4: HERSTEL — de vorige ronden voegden isBeschikbaarBijAaldering ook toe
// aan functie-bodies in het inline script van index.html (regex te breed),
// wat een syntaxfout gaf. Nu: alle flags eruit, alleen binnen plantData
// opnieuw toevoegen, daarna parse-check van alle inline scripts.
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

// ---- plants.js: idempotent opnieuw verwerken (geen wijzigingen t.o.v. r3) ----
var src = fs.readFileSync('plants.js', 'utf8');
var ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
var plants = ctx.window.PLANTEN_EXTRA;
if (!Array.isArray(plants)) throw new Error('plants.js: window.PLANTEN_EXTRA is geen array');

log('# Aaldering data-fix rapport (ronde 4 — herstel index.html)');
log('');
log('Planten in plants.js: ' + plants.length);

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
log('plants.js herschreven (ongewijzigde data, alleen stabiele opmaak)');

// ---- index.html: herstel + correcte integratie ----
var idx = fs.readFileSync('index.html', 'utf8');

// 1. alle eerder toegevoegde flags verwijderen (ook de verkeerde)
var before = (idx.match(/, isBeschikbaarBijAaldering: true \}/g) || []).length;
idx = idx.split(', isBeschikbaarBijAaldering: true }').join(' }');
log('Verwijderde flag-invoegingen (inclusief eventueel foute): ' + before);

// 2. alleen binnen plantData-array opnieuw toevoegen
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
log('plantData-entries van flag voorzien: ' + flagged);

// 3. customplants-integratie (idempotent)
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

// 4. parse-check alle inline scripts (valideert het herstel)
var blocks = idx.match(/<script>([\s\S]*?)<\/script>/g) || [];
blocks.forEach(function (b, i) {
  var code = b.slice(8, -9);
  new Function(code); // gooit fout bij syntaxfout
});
log('Parse-check: ' + blocks.length + ' inline script(s) in index.html parseeren correct');

if (!idx.trimEnd().endsWith('</html>')) throw new Error('index.html eindigt niet op </html>');
fs.writeFileSync('index.html', idx);
log('index.html hersteld en weggeschreven');
fs.writeFileSync('report.md', report.join('\n') + '\n');
console.log('Klaar.');
