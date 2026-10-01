// scripts/aaldering-fix.js — data-kwaliteitsfix voor plants.js (r7).
// r6: volledige synchronisatie met de Aaldering-PDF (883 rijen in
//     scripts/rows-part-01.txt .. rows-part-09.txt als compacte
//     JSON-regels, geparsede uit de OCR van alle 31 pagina's). Voor elke PDF-rij: (a) bestaat de plant in plants.js, dan
//     ontbrekende velden aanvullen uit de PDF-rij; (b) bestaat hij niet, dan
//     toevoegen — tenzij de naam lijkt op een bestaande (naamcorrectie uit
//     eerdere rondes of bekende OCR-variant), dan overslaan en rapporteren.
//     Plus externe aanvulling uit betrouwbare bronnen en diagnose-overzicht.
//     Idempotent: draait op de actuele checkout via GitHub Actions.
// r7: naamcorrecties ('Konigin'->'Königin Charlotte', Epimedium-cultivarnaam,
//     'Bleeding Hea'->'Bleeding Heart'), 3 als bijna-duplicaat overgeslagen
//     catalogusitems (Aquilegia) toegevoegd, hoogtes van PDF-pagina 1
//     ingevuld en standaardkenmerken van bekende soorten/cultivars aangevuld.

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

log('# Aaldering data-fix rapport (ronde 7 — PDF-synchronisatie + aanvulling ontbrekende gegevens)');
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

// ---- naamcorrecties ronde 7 ----
// 'Konigin' is OCR zonder umlaut: de cultivar heet 'Königin Charlotte'
// (verifieerbaar bij o.a. Heijnen Planten / Appeltern). 'Sphinx Twinkler' is
// de handelsnaam van Epimedium 'Spine Tingler' (NVK / Walters Gardens).
// 'Bleeding Hea' is afgekapt in de oorspronkelijke parse.
var naamFixes7 = 0;
plants.forEach(function (p) {
  var n = p.latijnseNaam;
  if (n === "Anemone 'Konigin Charlotte'") { p.latijnseNaam = "Anemone 'Königin Charlotte'"; naamFixes7++; }
  if (n === "Epimedium Sphinx Twinkler ('Spine Tingler'") { p.latijnseNaam = "Epimedium 'Sphinx Twinkler'"; naamFixes7++; }
  if (n === "Heliopsis helianthoides var. scabra 'Bleeding Hea'") { p.latijnseNaam = "Heliopsis helianthoides var. scabra 'Bleeding Heart'"; naamFixes7++; }
});
log('Naamcorrecties ronde 7 (umlaut, cultivarnamen, afkapping): ' + naamFixes7 + 'x');

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
  'veronia crinita alba',
  'epimedium sphinx twinkler spine tingler'
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

log('');
log('## Aanvulling ronde 7');
log('');
log('### Catalogusitems die ronde 6 als bijna-duplicaat waren overgeslagen');
log('');

// 1. Echte catalogusitems (eigen data in de PDF) die de fuzzy-match van
//    ronde 6 naast 'Aquilegia vulgaris' legde:
var PDF_EXTRA = [
  { naam: "Aquilegia vulgaris 'Alba'", nlNaam: 'Akelei', standplaats: 'Z', kleur: 'wit',
    bloeiVan: 'mei', bloeiTot: 'juni', hoogteVan: 30, hoogteTot: 50,
    bron: 'PDF Aaldering (catalogusitem)' },
  { naam: 'Aquilegia vulgaris mix', nlNaam: 'Akelei', standplaats: 'Z - HS', kleur: 'diverse kleuren',
    bloeiVan: 'mei', bloeiTot: 'juni', hoogteVan: 30, hoogteTot: 70,
    bron: 'PDF Aaldering (catalogusitem)' },
  { naam: "Aquilegia vulgaris 'Pink'", nlNaam: 'Akelei', standplaats: 'Z - HS', kleur: 'roze',
    bloeiVan: 'mei', bloeiTot: 'juni', hoogteVan: 30, hoogteTot: 50,
    bron: 'PDF Aaldering (catalogusitem)' }
];

// 2. Hoogtes van pagina 1 van de PDF (kolomuitlijning van de hoogtekolom is
//    eerder rij-voor-rij geverifieerd tegen de OCR van de eerste pagina):
var PAGINA1_HOOGTE = [
  { naam: 'Adiantum venustrum', hoogteVan: 80, hoogteTot: 100, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Agastache rugosum 'Alabaster'", hoogteVan: 120, hoogteTot: 120, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Agastache 'Blue Fortune'", hoogteVan: 75, hoogteTot: 75, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Agastache rugosa 'Little Adder'", hoogteVan: 40, hoogteTot: 50, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Agastache 'Purple Haze'", hoogteVan: 90, hoogteTot: 90, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Ajuga reptans 'Alba'", hoogteVan: 15, hoogteTot: 15, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Ajuga reptans 'Atropurpurea'", hoogteVan: 5, hoogteTot: 15, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Ajuga reptans 'Chocolate Chips'", hoogteVan: 5, hoogteTot: 10, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Ajuga reptans 'Catlin's Giant'", hoogteVan: 30, hoogteTot: 30, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Ajuga pyramidalis 'Metallica Crispa'", hoogteVan: 20, hoogteTot: 20, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: 'Ajuga reptans', hoogteVan: 15, hoogteTot: 15, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Ajuga reptans 'Rosea'", hoogteVan: 15, hoogteTot: 15, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: 'Alchemilla erythropoda', hoogteVan: 15, hoogteTot: 20, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: 'Alchemilla mollis', hoogteVan: 50, hoogteTot: 50, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: 'Alchemilla vulgaris', hoogteVan: 20, hoogteTot: 40, bron: 'PDF Aaldering p.1 (hoogtekolom)' },
  { naam: "Allium senescens 'Lisa Blue'", hoogteVan: 30, hoogteTot: 30, bron: 'PDF Aaldering p.1 (hoogtekolom)' }
];

// 3. Standaard botanische kenmerken van bekende soorten en cultivars.
//    Alleen planten waarvan de kenmerken onomstreden zijn; obscure
//    collectiecodes en zeldzame cultivars blijven bewust leeg.
var KENNIS = [
  { naam: 'Anemone ranunculoides', nlNaam: 'Geel anemoon', standplaats: 'HS - S', kleur: 'geel',
    bloeiVan: 'maart', bloeiTot: 'mei', hoogteVan: 20, hoogteTot: 30,
    bron: 'standaard botanische kenmerken' },
  { naam: "Buddleja davidii 'Black Night'", nlNaam: 'Vlinderstruik', standplaats: 'Z', kleur: 'donkerpaars',
    bloeiVan: 'juli', bloeiTot: 'september', hoogteVan: 200, hoogteTot: 250,
    bron: 'standaard botanische kenmerken' },
  { naam: "Buddleja davidii butterfly candy 'Little White'", standplaats: 'Z', kleur: 'wit',
    bloeiVan: 'juli', bloeiTot: 'september', hoogteVan: 70, hoogteTot: 100,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Corydalis lutea', standplaats: 'HS - S', kleur: 'geel',
    bloeiVan: 'mei', bloeiTot: 'september', hoogteVan: 25, hoogteTot: 40,
    bron: 'standaard botanische kenmerken' },
  { naam: "Digitalis purpurea 'Alba'", standplaats: 'Z - HS', kleur: 'wit',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 100, hoogteTot: 150,
    bron: 'standaard botanische kenmerken' },
  { naam: "Digitalis purpurea 'Sutton's Apricot'", standplaats: 'Z - HS', kleur: 'perzikroze',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 100, hoogteTot: 140,
    bron: 'standaard botanische kenmerken' },
  { naam: "Fuchsia magellanica 'Mrs Popple'", standplaats: 'Z - HS', kleur: 'rood - violet',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 75, hoogteTot: 100,
    bron: 'standaard botanische kenmerken' },
  { naam: "Fuchsia 'Riccartonii'", standplaats: 'Z - HS', kleur: 'rood - violet',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 90, hoogteTot: 120,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Geranium psilostemon', standplaats: 'Z - HS', kleur: 'magenta',
    bloeiVan: 'juni', bloeiTot: 'juli', hoogteVan: 90, hoogteTot: 120,
    bron: 'standaard botanische kenmerken' },
  { naam: "Geranium pratense 'Rose Queen'", standplaats: 'Z - HS', kleur: 'roze',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 60, hoogteTot: 80,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Helianthemum nummularium', nlNaam: 'Zonneroosje', standplaats: 'Z', kleur: 'geel',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 20, hoogteTot: 30,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Hepatica nobilis', standplaats: 'HS - S', kleur: 'blauw',
    bloeiVan: 'maart', bloeiTot: 'mei', hoogteVan: 10, hoogteTot: 15,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Hypericum calycinum', standplaats: 'Z - HS', kleur: 'geel',
    bloeiVan: 'juli', bloeiTot: 'september', hoogteVan: 30, hoogteTot: 50,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Leonurus cardiaca', nlNaam: 'Hartgespan', standplaats: 'Z - HS', kleur: 'roze - lila',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 80, hoogteTot: 150,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Linaria vulgaris', nlNaam: 'Vlasleeuwenbek', standplaats: 'Z - HS', kleur: 'geel',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 30, hoogteTot: 80,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Luzula nivea', standplaats: 'HS - S', kleur: 'wit',
    bloeiVan: 'juni', bloeiTot: 'juli', hoogteVan: 40, hoogteTot: 50,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Lysimachia ephemerum', standplaats: 'Z - HS', kleur: 'wit',
    bloeiVan: 'juli', bloeiTot: 'augustus', hoogteVan: 60, hoogteTot: 90,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Lysimachia nemorum', standplaats: 'HS - S', kleur: 'geel',
    bloeiVan: 'mei', bloeiTot: 'juli', hoogteVan: 20, hoogteTot: 30,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Lysimachia vulgaris', standplaats: 'Z - HS', kleur: 'geel',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 80, hoogteTot: 150,
    bron: 'standaard botanische kenmerken' },
  { naam: "Lythrum salicaria 'Happiness'", standplaats: 'Z - HS', kleur: 'roze',
    bloeiVan: 'juli', bloeiTot: 'september', hoogteVan: 80, hoogteTot: 120,
    bron: 'standaard botanische kenmerken' },
  { naam: "Lythrum virgatum 'Dropmore Purple'", standplaats: 'Z', kleur: 'paarsroze',
    bloeiVan: 'juli', bloeiTot: 'september', hoogteVan: 60, hoogteTot: 80,
    bron: 'standaard botanische kenmerken' },
  { naam: "Lythrum virgatum 'Swirl'", standplaats: 'Z - HS', kleur: 'roze',
    bloeiVan: 'juli', bloeiTot: 'september', hoogteVan: 60, hoogteTot: 90,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Potentilla argentea', standplaats: 'Z', kleur: 'geel',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 30, hoogteTot: 60,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Potentilla atrosanguinea', standplaats: 'Z', kleur: 'donkerrood',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 40, hoogteTot: 60,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Primula wanda', standplaats: 'HS - S', kleur: 'donkerroze',
    bloeiVan: 'maart', bloeiTot: 'mei', hoogteVan: 10, hoogteTot: 15,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Pulmonaria mollis', standplaats: 'HS - S', kleur: 'blauw - violet',
    bloeiVan: 'april', bloeiTot: 'mei', hoogteVan: 25, hoogteTot: 40,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Saponaria officinalis', nlNaam: 'Zeepkruid', standplaats: 'Z - HS', kleur: 'roze',
    bloeiVan: 'juli', bloeiTot: 'september', hoogteVan: 50, hoogteTot: 90,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Scrophularia nodosa', standplaats: 'HS - S', kleur: 'roodbruin',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 50, hoogteTot: 100,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Sambucus nigra', nlNaam: 'Vlier', standplaats: 'Z - HS', kleur: 'wit',
    bloeiVan: 'juni', bloeiTot: 'juli', hoogteVan: 250, hoogteTot: 400,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Tanacetum parthenium', nlNaam: 'Moederkruid', standplaats: 'Z - HS', kleur: 'wit',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 30, hoogteTot: 60,
    bron: 'standaard botanische kenmerken' },
  { naam: "Thymus serpyllum 'Minor'", standplaats: 'Z', kleur: 'roze - lila',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 2, hoogteTot: 5,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Trifolium repens', nlNaam: 'Witte klaver', standplaats: 'Z', kleur: 'wit',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 10, hoogteTot: 30,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Saxifraga stolonifera', standplaats: 'HS - S', kleur: 'wit',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 10, hoogteTot: 20,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Erigeron annuus', standplaats: 'Z - HS', kleur: 'wit - roze',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 60, hoogteTot: 120,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Euphorbia myrsinites', standplaats: 'Z', kleur: 'geel',
    bloeiVan: 'april', bloeiTot: 'juni', hoogteVan: 10, hoogteTot: 30,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Asclepias incarnata', nlNaam: 'Zijdeplant', standplaats: 'Z - HS', kleur: 'roze',
    bloeiVan: 'juli', bloeiTot: 'augustus', hoogteVan: 100, hoogteTot: 150,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Astilboides tabularis', standplaats: 'HS - S', kleur: 'wit',
    bloeiVan: 'juni', bloeiTot: 'juli', hoogteVan: 100, hoogteTot: 120,
    bron: 'standaard botanische kenmerken' },
  { naam: "Baptisia australis 'Lemon Meringue'", standplaats: 'Z', kleur: 'geel',
    bloeiVan: 'juni', bloeiTot: 'juli', hoogteVan: 75, hoogteTot: 100,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Campanula rapunculus', standplaats: 'Z - HS', kleur: 'blauw - violet',
    bloeiVan: 'juli', bloeiTot: 'september', hoogteVan: 40, hoogteTot: 80,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Chrysosplenium alternifolium', nlNaam: 'Goudvechje', standplaats: 'HS - S', kleur: 'geel',
    bloeiVan: 'maart', bloeiTot: 'mei', hoogteVan: 5, hoogteTot: 15,
    bron: 'standaard botanische kenmerken' },
  { naam: "Convallaria majalis 'Bridal Choice'", standplaats: 'HS - S', kleur: 'wit',
    bloeiVan: 'mei', bloeiTot: 'juni', hoogteVan: 15, hoogteTot: 20,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Fragaria ananassa', nlNaam: 'Aardbei', standplaats: 'Z', kleur: 'wit',
    bloeiVan: 'mei', bloeiTot: 'juni', hoogteVan: 15, hoogteTot: 30,
    bron: 'standaard botanische kenmerken' },
  { naam: 'Isotoma fluviatilis', standplaats: 'Z - HS', kleur: 'blauw',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 5, hoogteTot: 10,
    bron: 'standaard botanische kenmerken' },
  { naam: "Aruncus 'Misty Lace'", standplaats: 'Z - HS', kleur: 'wit',
    bloeiVan: 'juni', bloeiTot: 'juli', hoogteVan: 90, hoogteTot: 120,
    bron: 'standaard botanische kenmerken' },
  { naam: "Achillea filipendulina 'Cloth of Gold'", standplaats: 'Z', kleur: 'geel',
    bloeiVan: 'juni', bloeiTot: 'augustus', hoogteVan: 90, hoogteTot: 120,
    bron: 'standaard botanische kenmerken' },
  { naam: "Salvia nemorosa 'Azure Snow'", standplaats: 'Z', kleur: 'blauw - wit',
    bloeiVan: 'juni', bloeiTot: 'september', hoogteVan: 40, hoogteTot: 50,
    bron: 'standaard botanische kenmerken' },
  // grassen en varens: geen opvallende bloem, alleen standplaats + hoogte
  { naam: "Molinia arundinacea 'Karl Foerster'", standplaats: 'Z - HS',
    hoogteVan: 150, hoogteTot: 200, bron: 'standaard botanische kenmerken (gras)' },
  { naam: 'Blechnum penna marina', standplaats: 'HS - S',
    hoogteVan: 15, hoogteTot: 30, bron: 'standaard botanische kenmerken (varen)' },
  { naam: "Acaena inermis 'Purpurea'", standplaats: 'Z - HS',
    hoogteVan: 5, hoogteTot: 10, bron: 'standaard botanische kenmerken (bladplant)' },
  { naam: 'Muehlenbeckia axillaris', standplaats: 'Z - HS',
    hoogteVan: 5, hoogteTot: 10, bron: 'standaard botanische kenmerken (bladplant)' },
  // online geverifieerd tegen kwekerij- en botanische bronnen:
  { naam: "Thalictrum 'Elin'", standplaats: 'Z - HS', kleur: 'lila',
    bloeiVan: 'juli', bloeiTot: 'augustus', hoogteVan: 200, hoogteTot: 280,
    bron: 'plantlust / Phoenix Perennials (geverifieerd)' },
  { naam: "Veronicastrum virginicum 'Challenger'", standplaats: 'Z - HS', kleur: 'roze',
    bloeiVan: 'juli', bloeiTot: 'augustus', hoogteVan: 120, hoogteTot: 150,
    bron: 'RHS / Horsford Nursery (geverifieerd)' },
  // klimplant: hoogte is afhankelijk van geleiding, alleen standplaats
  { naam: 'Parthenocissus quinquefolia', nlNaam: 'Wilde wingerd', standplaats: 'Z - HS',
    bron: 'standaard botanische kenmerken (klimplant)' }
];

function verwerkAanvulling(lijst) {
  lijst.forEach(function (f) {
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
}

verwerkAanvulling(PDF_EXTRA);
log('');
log('### Hoogtes van PDF-pagina 1 (kolomuitlijning geverifieerd tegen de OCR)');
log('');
verwerkAanvulling(PAGINA1_HOOGTE);
log('');
log('### Standaardkenmerken van bekende soorten en cultivars');
log('');
verwerkAanvulling(KENNIS);

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
