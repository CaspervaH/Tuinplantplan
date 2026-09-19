// Valideert index.html + map.js van de Tuinplantplanner
// Draait in GitHub Actions bij elke push (node 20).
const fs = require('fs');

let errors = [];
const ok = (msg) => console.log('  \u2713 ' + msg);
const err = (msg) => { errors.push(msg); console.error('  \u2717 ' + msg); };

function main() {
  console.log('== Tuinplantplanner validatie ==\n');

  for (const f of ['index.html', 'map.js']) {
    if (!fs.existsSync(f)) { err(f + ' ontbreekt'); return fail(); }
    ok(f + ' bestaat (' + fs.statSync(f).size + ' bytes)');
  }
  const html = fs.readFileSync('index.html', 'utf8');
  const mapJs = fs.readFileSync('map.js', 'utf8');

  // HTML structuur
  if (!html.trimEnd().endsWith('</html>')) err('index.html eindigt niet op </html> (mogelijk afgekapt!)');
  else ok('index.html is compleet');
  if (!html.includes('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')) err('leaflet.js library ontbreekt (kaart blijft grijs!)');
  else ok('leaflet.js library geladen');
  if (!html.includes('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')) err('leaflet.css ontbreekt');
  else ok('leaflet.css geladen');
  if (!/<script src="map.js" defer>/.test(html)) err('map.js wordt niet geladen');
  else ok('map.js wordt geladen');
  if (/leaflet@1.9.4\/dist\/leaflet.js" defer><\/script>\s*<script src="map.js" defer>/.test(html)) ok('leaflet.js laadt v\u00f3\u00f3r map.js');
  else err('map.js moet NA leaflet.js geladen worden');

  // JS-syntax
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  scripts.forEach((s, i) => {
    try { new Function(s); ok('inline script #' + (i + 1) + ' parseert'); }
    catch (e) { err('inline script #' + (i + 1) + ' SYNTAXFOUT: ' + e.message); }
  });
  try { new Function(mapJs); ok('map.js parseert'); }
  catch (e) { err('map.js SYNTAXFOUT: ' + e.message); }

  // getElementById-doelen bestaan in de HTML
  const allJs = mapJs + scripts.join('\n');
  const ids = new Set([...allJs.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
  let missing = 0;
  for (const id of ids) {
    if (!html.includes('id="' + id + '"')) { err("getElementById('" + id + "') maar geen element met dat id in HTML"); missing++; }
  }
  if (!missing && ids.size) ok('alle ' + ids.size + ' aangesproken element-ids bestaan in de HTML');

  // HTML-specifieke onderdelen
  const htmlMust = {
    'adres-gate': 'id="addressGate"',
    'adres-titel': 'id="addressTitle"',
    'kaart-container': 'id="gardenMap"',
    'plantenlijst': 'id="plantList"'
  };
  for (const [naam, needle] of Object.entries(htmlMust)) {
    if (html.includes(needle)) ok('bevat: ' + naam);
    else err('mist: ' + naam);
  }

  // map.js-specifieke onderdelen
  const mapMust = {
    'kadaster WMTS-laag': 'kadastralekaart/wmts',
    'PDOK locatieserver': 'locatieserver',
    'renderMap': 'function renderMap',
    'saveState-koppeling': '_origSaveState',
    'adres-gate logica': 'has-address',
    'invalidateSize-fix': 'invalidateSize'
  };
  for (const [naam, needle] of Object.entries(mapMust)) {
    if (mapJs.includes(needle)) ok('map.js bevat: ' + naam);
    else err('map.js mist: ' + naam);
  }

  // Geen inline onclick (breukgevoelig)
  if (/<[^>]+\sonclick=/.test(html)) err('inline onclick gevonden (breukgevoelig met apostroffen in plantnamen)');
  else ok('geen inline onclick-handlers');

  fail();
}

function fail() {
  console.log('');
  if (errors.length) {
    console.error('\u2717 ' + errors.length + ' fout(en) gevonden.');
    process.exit(1);
  }
  console.log('\u2713 Alle checks geslaagd.');
}
main();
