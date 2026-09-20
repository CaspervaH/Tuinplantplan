// Valideert index.html + map.js + border.html + border.js van de Tuinplantplanner
// Draait in GitHub Actions bij elke push (node 20).
const fs = require('fs');

let errors = [];
const ok = (msg) => console.log('  \u2713 ' + msg);
const err = (msg) => { errors.push(msg); console.error('  \u2717 ' + msg); };

function main() {
  console.log('== Tuinplantplanner validatie ==\n');

  for (const f of ['index.html', 'map.js', 'border.html', 'border.js', 'plantpicker.js']) {
    if (!fs.existsSync(f)) { err(f + ' ontbreekt'); return fail(); }
    ok(f + ' bestaat (' + fs.statSync(f).size + ' bytes)');
  }
  const html = fs.readFileSync('index.html', 'utf8');
  const mapJs = fs.readFileSync('map.js', 'utf8');
  const borderHtml = fs.readFileSync('border.html', 'utf8');
  const borderJs = fs.readFileSync('border.js', 'utf8');
  const pickerJs = fs.readFileSync('plantpicker.js', 'utf8');

  // HTML structuur
  for (const [naam, file] of [['index.html', html], ['border.html', borderHtml]]) {
    if (!file.trimEnd().endsWith('</html>')) err(naam + ' eindigt niet op </html> (mogelijk afgekapt!)');
    else ok(naam + ' is compleet');
  }
  if (!html.includes('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')) err('leaflet.js library ontbreekt (kaart blijft grijs!)');
  else ok('leaflet.js library geladen');
  if (!html.includes('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')) err('leaflet.css ontbreekt');
  else ok('leaflet.css geladen');
  if (!/<script src="map.js" defer>/.test(html)) err('map.js wordt niet geladen');
  else ok('map.js wordt geladen');
  if (/leaflet@1.9.4\/dist\/leaflet.js" defer><\/script>\s*<script src="map.js" defer>/.test(html)) ok('leaflet.js laadt v\u00f3\u00f3r map.js');
  else err('map.js moet NA leaflet.js geladen worden');
  if (!/<script src="border.js" defer>/.test(borderHtml)) err('border.js wordt niet geladen door border.html');
  else ok('border.js wordt geladen door border.html');

  // JS-syntax
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  scripts.forEach((s, i) => {
    try { new Function(s); ok('index inline script #' + (i + 1) + ' parseert'); }
    catch (e) { err('index inline script #' + (i + 1) + ' SYNTAXFOUT: ' + e.message); }
  });
  const borderScripts = [...borderHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  borderScripts.forEach((s, i) => {
    try { new Function(s); ok('border inline script #' + (i + 1) + ' parseert'); }
    catch (e) { err('border inline script #' + (i + 1) + ' SYNTAXFOUT: ' + e.message); }
  });
  for (const [naam, src] of [['map.js', mapJs], ['border.js', borderJs]]) {
    try { new Function(src); ok(naam + ' parseert'); }
    catch (e) { err(naam + ' SYNTAXFOUT: ' + e.message); }
  }
  try { new Function(pickerJs); ok('plantpicker.js parseert'); }
  catch (e) { err('plantpicker.js SYNTAXFOUT: ' + e.message); }

  // getElementById-doelen bestaan in de juiste HTML
  function checkIds(jsSources, htmlText, htmlNaam) {
    const allJs = jsSources.join('\n');
    const ids = new Set([...allJs.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
    let missing = 0;
    for (const id of ids) {
      if (!htmlText.includes('id="' + id + '"')) { err(htmlNaam + ": getElementById('" + id + "') maar geen element met dat id in " + htmlNaam); missing++; }
    }
    if (!missing && ids.size) ok('alle ' + ids.size + ' aangesproken element-ids bestaan in ' + htmlNaam);
  }
  checkIds([mapJs, ...scripts], html, 'index.html');
  checkIds([borderJs, pickerJs, ...borderScripts], borderHtml, 'border.html');

  // HTML-specifieke onderdelen
  const htmlMust = {
    'adres-gate': 'id="addressGate"',
    'adres-titel': 'id="addressTitle"',
    'kaart-container': 'id="gardenMap"',
    'plantenlijst': 'id="plantPickerContainer"'
  };
  for (const [naam, needle] of Object.entries(htmlMust)) {
    if (html.includes(needle)) ok('index bevat: ' + naam);
    else err('index mist: ' + naam);
  }
  const borderMust = {
    'svg-view': 'id="shapeSvg"',
    'plantenlijst-palette': 'id="paletteList"',
    'tabel': 'id="plantTableBody"'
  };
  for (const [naam, needle] of Object.entries(borderMust)) {
    if (borderHtml.includes(needle)) ok('border.html bevat: ' + naam);
    else err('border.html mist: ' + naam);
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
  for (const [naam, file] of [['index.html', html], ['border.html', borderHtml]]) {
    if (/<[^>]+\sonclick=/.test(file)) err(naam + ': inline onclick gevonden (breukgevoelig met apostroffen in plantnamen)');
    else ok(naam + ': geen inline onclick-handlers');
  }

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
