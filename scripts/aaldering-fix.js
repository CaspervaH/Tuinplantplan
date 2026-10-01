// scripts/aaldering-fix.js — data-kwaliteitsfix voor plants.js (r5).
// r5: de 13 volledig lege PDF-rijen aanvullen met data uit betrouwbare bronnen
//     (Gardenia.net, Missouri Botanical Garden, NC State Extension, Walters
//     Gardens, NVK Nurseries), naamcorrectie 'Chrystal Blue' -> 'Crystal Blue',
//     plus een diagnose-overzicht van planten die na deze ronde nog gegevens
//     missen. Idempotent: draait op de actuele checkout via GitHub Actions.

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

// ---- plants.js lezen ----
var src = fs.readFileSync('plants.js', 'utf8');
var ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
var plants = ctx.window.PLANTEN_EXTRA;
if (!Array.isArray(plants)) throw new Error('plants.js: window.PLANTEN_EXTRA is geen array');

log('# Aaldering data-fix rapport (ronde 5 — lege PDF-rijen aanvullen)');
log('');
log('Planten in plants.js bij start: ' + plants.length);

// ---- Diagnose: alle Amsonia-entries (lost eerdere tegenstrijdigheid op) ----
log('');
log('## Diagnose: Amsonia-entries');
plants.forEach(function (p) {
  if (/amsonia/i.test(p.latijnseNaam || '')) log('- ' + JSON.stringify(p));
});

// ---- Naamcorrectie: 'Chrystal Blue' -> 'Crystal Blue' (officiele cultivarnaam) ----
var naamFixes = 0;
plants.forEach(function (p) {
  if (p.latijnseNaam && /Chrystal Blue/i.test(p.latijnseNaam)) {
    p.latijnseNaam = p.latijnseNaam.replace(/Chrystal Blue/i, 'Crystal Blue');
    naamFixes++;
  }
});
log('');
log("Naamcorrectie 'Chrystal Blue' -> 'Crystal Blue': " + naamFixes + 'x');

// ---- Fills voor de 13 volledig lege PDF-rijen ----
// Alleen lege velden vullen; uitzondering amsonia hubrichtii (overwrite: true):
// de PDF-rij was leeg, dus eventueel eerder ingevulde data is verdacht.
var FILLS = [
  { naam: 'Amsonia hubrichtii', key: 'amsonia hubrichtii', regex: /amsonia\s+hu/i, overwrite: true,
    nlNaam: 'Blauwe ster', standplaats: 'Z - HS', kleur: 'lichtblauw',
    bloeiVan: 'mei', bloeiTot: 'juni', hoogteVan: 60, hoogteTot: 90,
    bron: 'Gardenia.net / Walters Gardens / NC State Extension' },
  { naam: 'Saxifraga paniculata', key: 'saxifraga paniculata',
    standplaats: 'Z', kleur: 'wit', bloeiVan: 'juni', bloeiTot: 'augustus',
    hoogteVan: 10, hoogteTot: 30,
    bron: 'Missouri Botanical Garden / NVK Nurseries' },
  { naam: "Salvia nemorosa 'Crystal Blue'", key: 'salvia nemorosa crystal blue',
    standplaats: 'Z', kleur: 'lichtblauw', bloeiVan: 'juni', bloeiTot: 'september',
    hoogteVan: 40, hoogteTot: 50,
    bron: 'Walters Gardens / Gardenia.net' },
  { naam: 'Persicaria affinis', key: 'persicaria affinis',
    standplaats: 'Z - HS', kleur: 'roze', bloeiVan: 'juni', bloeiTot: 'augustus',
    hoogteVan: 15, hoogteTot: 25,
    bron: 'Gardenia.net / BBC Gardeners World Magazine' },
  { naam: "Penstemon barbatus coccineus 'Jingle Bells'", key: 'penstemon barbatus coccineus jingle bells',
    standplaats: 'Z', kleur: 'rood', bloeiVan: 'mei', bloeiTot: 'augustus',
    hoogteVan: 80, hoogteTot: 150,
    bron: 'Gardenia.net' },
  { naam: 'Lepechinia hastata', key: 'lepechinia hastata',
    standplaats: 'Z', kleur: 'paars - rood', bloeiVan: 'augustus', bloeiTot: 'oktober',
    hoogteVan: 120, hoogteTot: 180,
    bron: 'Gardenia.net / San Marcos Growers (let op: beperkt winterhard in NL)' },
  { naam: "Hedera helix 'Spetchley'", key: 'hedera helix spetchley',
    nlNaam: 'Klimop', standplaats: 'S - HS', kleur: 'groen',
    bron: 'miniatuur-klimop; bloei onopvallend, hoogte niet van toepassing (klimmer)' },
  { naam: "Hedera helix 'Natasja'", key: 'hedera helix natasja',
    nlNaam: 'Klimop', standplaats: 'S - HS', kleur: 'groen',
    bron: 'klimop-cultivar; hoogte niet van toepassing (klimmer)' },
  { naam: "Hedera helix 'Erecta'", key: 'hedera helix erecta',
    nlNaam: 'Klimop', standplaats: 'S - HS', kleur: 'groen',
    bron: 'klimop-cultivar; hoogte niet van toepassing (klimmer)' },
  { naam: 'Hedera bloemkool blad', key: 'hedera bloemkool blad',
    nlNaam: 'Klimop', standplaats: 'S - HS', kleur: 'groen',
    bron: 'gekroesd-blad-klimop; hoogte niet van toepassing (klimmer)' },
  { naam: 'Buddleja roze', key: 'buddleja roze',
    kleur: 'roze',
    bron: 'kleur staat in de naam zelf; overige gegevens stonden niet in de PDF' }
];

var VELDEN = ['nlNaam', 'standplaats', 'kleur', 'bloeiVan', 'bloeiTot', 'hoogteVan', 'hoogteTot'];

function leeg(v) { return v === undefined || v === null || String(v).trim() === ''; }

function vindFill(f) {
  var i, j, k;
  // 1. exact op genormaliseerde naam
  for (i = 0; i < plants.length; i++) {
    if (norm(plants[i].latijnseNaam) === f.key) return plants[i];
  }
  // 2. fuzzy: alle tokens van de key moeten in de genormaliseerde naam voorkomen
  var tokens = f.key.split(' ');
  for (j = 0; j < plants.length; j++) {
    var n = norm(plants[j].latijnseNaam);
    if (n && tokens.every(function (t) { return n.indexOf(t) !== -1; })) return plants[j];
  }
  // 3. extra regex (vangt eventuele OCR-spelfouten)
  if (f.regex) {
    for (k = 0; k < plants.length; k++) {
      if (f.regex.test(plants[k].latijnseNaam || '')) return plants[k];
    }
  }
  return null;
}

log('');
log('## Aanvulling van de lege PDF-rijen');
var toegevoegd = 0;
FILLS.forEach(function (f) {
  var p = vindFill(f);
  if (!p) {
    plants.push({
      latijnseNaam: f.naam,
      nlNaam: f.nlNaam || '',
      standplaats: f.standplaats || '',
      kleur: f.kleur || '',
      bloeiVan: f.bloeiVan || '',
      bloeiTot: f.bloeiTot || '',
      hoogteVan: f.hoogteVan != null ? f.hoogteVan : null,
      hoogteTot: f.hoogteTot != null ? f.hoogteTot : null
    });
    toegevoegd++;
    log('- ' + f.naam + ': NIET gevonden in plants.js -> toegevoegd als nieuwe entry (' + f.bron + ')');
    return;
  }
  var gewijzigd = [];
  VELDEN.forEach(function (v) {
    if (f[v] === undefined) return;
    if (f.overwrite || leeg(p[v])) {
      if (String(p[v] != null ? p[v] : '') !== String(f[v])) {
        gewijzigd.push(v + ': ' + JSON.stringify(p[v] == null ? '' : p[v]) + ' -> ' + JSON.stringify(f[v]));
      }
      p[v] = f[v];
    }
  });
  if (gewijzigd.length) {
    log('- ' + p.latijnseNaam + ': ' + gewijzigd.join(', ') + '  [' + f.bron + ']');
  } else {
    log('- ' + p.latijnseNaam + ': al volledig, niets gewijzigd');
  }
});

// Bewust niet ingevuld: geen betrouwbare bron gevonden
log('');
log('## Bewust niet ingevuld (geen betrouwbare bron gevonden)');
["Nepeta nuda 'Overhagen'", "Salvia 'Free Magenta Lips'"].forEach(function (n) {
  var p = null;
  plants.forEach(function (q) { if (norm(q.latijnseNaam) === norm(n)) p = q; });
  log('- ' + n + (p ? ' (staat in de lijst, gegevens blijven voorlopig leeg)' : ' (niet in de lijst aangetroffen)'));
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
log('plants.js herschreven: ' + plants.length + ' planten (' + toegevoegd + ' nieuwe entry/entries)');

// ---- index.html: idempotent herstel + correcte integratie ----
var idx = fs.readFileSync('index.html', 'utf8');

// 1. alle eerder toegevoegde flags verwijderen (ook eventuel fouteinserten) 
var before = (idx.match(/, isBeschikbaarBijAaldering: true }\g/g) || []).length;
idx = idx.split(', isBeschikbaarBijAaldering: true }').join(' }');
log('Verwijderde flag-invoegingen in index.html (inclusief eventueel foute): ' + before);

// 2. alleen binnen plantData-array opnieuw toevoegen
var start = idx.indexOf('plantData = [');
if (start === -1) throw new Error('plantData-array niet gevonden in index.html');
var end = idx.indexOf('];', start);
if (end === -1) throw new Error('plantData-array loopt niet af');
var slice = idx.slice(start, end);
var flagged = 0;
slice = slice.replace(/\{[^{}]*latijnseNaam[^;}]*\}/g, function (m) {
  if (m.indexOf('isBeschikbaarBijAaldering') !== -1) return m;
  flagged++;
  return m.replace(/\s*\}\s*$/, ', isBeschikbaarBijAaldering: true }');
});
idx = idx.slice(0, start) + slice + idx.slice(end);
log('plantData-entries in index.html van flag voorzien: ' + flagged);

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
blocks.forEach(function (b) {
  new Function(b.slice(8, -9)); // gooit fout bij syntaxfout
});
log('Parse-check: ' + blocks.length + ' inline script(s) in index.html parseeren correct');

if (!idx.trimEnd().endsWith('</html>')) throw new Error('index.html eindigt niet op </html>');
fs.writeFileSync('index.html', idx);
log('index.html gecontroleerd en weggeschreven');

fs.writeFileSync('report.md', report.join('\n') + '\n');
console.log('Klaar.');
