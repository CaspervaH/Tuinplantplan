/* Dekkingsscan: voor elke plant in plantData (index.html) + PLANTEN_EXTRA (plants.js)
   zoeken op Wikimedia Commons (namespace File), alleen exacte match op de volledige naam.
   Schrijft foto-stats.md + GitHub Actions step summary. Draait in GitHub Actions. */
const fs = require('fs');

const UA = 'TuinplantplanFotoScan/1.0 (github.com/CaspervaH/Tuinplantplan)';
const API = 'https://commons.wikimedia.org/w/api.php';

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function nameWords(naam) {
  return String(naam || '').replace(/[\u2019']/g, ' ').split(/[\s-]+/)
    .map(norm).filter(w => w.length > 2);
}
function titleMatches(title, naam) {
  const t = norm(title);
  return nameWords(naam).every(w => t.includes(w));
}

const BLOEI = ['flower','flor','blute','bloom','blossom','inflorescen','bloei','fleur'];
const BLAD = ['habit','leaf','leaves','foliage','blad','plant','planted','tuft','rosette'];

function classify(title) {
  const t = String(title || '').toLowerCase();
  for (const w of BLOEI) if (t.includes(w)) return 'bloei';
  for (const w of BLAD) if (t.includes(w)) return 'blad';
  return 'overig';
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function zoekCommons(naam) {
  const q = encodeURIComponent(naam.replace(/[\u2019']/g, ' ').replace(/\s+/g, ' ').trim());
  const url = API + '?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20' +
    '&gsrsearch=' + q + '&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=520';
  for (let poging = 0; poging < 3; poging++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (poging + 1)); continue; }
      const j = await r.json();
      const pages = (j.query && j.query.pages) || {};
      let bloei = false, blad = false, overig = false, totaal = 0;
      for (const k of Object.keys(pages)) {
        const pg = pages[k];
        if (!titleMatches(pg.title, naam)) continue;
        totaal++;
        const c = classify(pg.title);
        if (c === 'bloei') bloei = true; else if (c === 'blad') blad = true; else overig = true;
      }
      return { bloei, blad, overig, totaal };
    } catch (e) { await sleep(1500); }
  }
  return { fout: true };
}

function plantNamen() {
  const namen = new Set();
  for (const file of ['index.html', 'plants.js']) {
    if (!fs.existsSync(file)) continue;
    const c = fs.readFileSync(file, 'utf8');
    for (const m of c.matchAll(/latijnseNaam:\s*"([^"]+)"/g)) namen.add(m[1]);
  }
  return [...namen];
}

(async () => {
  const namen = plantNamen();
  console.log('Te scannen planten: ' + namen.length);
  const resultaten = [];
  let klaar = 0;
  for (const naam of namen) {
    const r = await zoekCommons(naam);
    resultaten.push({ naam, ...r });
    klaar++;
    if (klaar % 50 === 0) console.log(klaar + '/' + namen.length + ' gescand...');
    await sleep(150);
  }

  const metBloei = resultaten.filter(r => r.bloei);
  const metBlad = resultaten.filter(r => r.blad);
  const beide = resultaten.filter(r => r.bloei && r.blad);
  const iets = resultaten.filter(r => r.bloei || r.blad || r.overig);
  const niets = resultaten.filter(r => !r.fout && !r.bloei && !r.blad && !r.overig);
  const fouten = resultaten.filter(r => r.fout);
  const cultivars = resultaten.filter(r => /[\u2019']/.test(r.naam));
  const cultivarNiets = cultivars.filter(r => !r.fout && !r.bloei && !r.blad && !r.overig);

  let md = '# Foto-dekking scan (Wikimedia Commons)\n\n';
  md += 'Datum: ' + new Date().toISOString().slice(0, 10) + ' &middot; Planten gescand: **' + namen.length + '**\n\n';
  md += '| Categorie | Aantal | Percentage |\n|---|---|---|\n';
  const pct = n => (100 * n / namen.length).toFixed(1) + '%';
  md += '| Foto in bloei gevonden | ' + metBloei.length + ' | ' + pct(metBloei.length) + ' |\n';
  md += '| Blad/vorm-foto gevonden | ' + metBlad.length + ' | ' + pct(metBlad.length) + ' |\n';
  md += '| Beide (bloei + blad) | ' + beide.length + ' | ' + pct(beide.length) + ' |\n';
  md += '| Minstens 1 foto | ' + iets.length + ' | ' + pct(iets.length) + ' |\n';
  md += '| Geen foto (exacte match) | ' + niets.length + ' | ' + pct(niets.length) + ' |\n';
  md += '\nCultivars (naam met apostrof): ' + cultivars.length + ', waarvan zonder foto: ' + cultivarNiets.length + '\n';
  if (fouten.length) md += '\n&#9888; ' + fouten.length + ' planten konden niet worden gescand (netwerk/rate-limit).\n';
  md += '\n## Planten zonder foto\n\n';
  md += niets.map(r => '- ' + r.naam).join('\n') + '\n';

  fs.writeFileSync('foto-stats.md', md);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n' + md + '\n');
  }
  console.log('Klaar. Bloei: ' + metBloei.length + ', blad: ' + metBlad.length + ', beide: ' + beide.length +
    ', niets: ' + niets.length + ', fouten: ' + fouten.length);
})();
