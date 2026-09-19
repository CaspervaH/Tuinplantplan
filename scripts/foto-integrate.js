/* Integreert photos.js in index.html - draait in GitHub Actions op de volledige checkout.
   Voegt precies 1 script-tag toe (na de map.js-tag of anders voor </body>) als die er nog niet is,
   en valideert daarna de JS-syntax van alle inline scripts. */
const fs = require('fs');

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

if (/src=["']photos\.js["']/.test(html)) {
  console.log('photos.js is al geintegreerd, niets te doen.');
  process.exit(0);
}

const tag = '\n<script src="photos.js" defer></script>';
const mapRe = /<script[^>]*src=["']map\.js["'][^>]*><\/script>/;
if (mapRe.test(html)) {
  html = html.replace(mapRe, m => m + tag);
  console.log('Script-tag toegevoegd na map.js-tag.');
} else if (/<\/body>/i.test(html)) {
  html = html.replace(/<\/body>/i, tag + '\n</body>');
  console.log('Script-tag toegevoegd voor </body> (map.js-tag niet gevonden).');
} else {
  console.error('FOUT: geen map.js-tag en geen </body> gevonden - niets gewijzigd.');
  process.exit(1);
}

fs.writeFileSync(file, html);

/* Validatie: alle inline scripts moeten parsen. */
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let ok = true;
for (const s of scripts) {
  try { new Function(s); } catch (e) { ok = false; console.error('SYNTAXFOUT in inline script:', e.message); }
}
if (!/<\/html>/.test(html)) { ok = false; console.error('FOUT: </html> ontbreekt.'); }
if (!ok) { console.error('Validatie mislukt - bestand is wel geschreven, check dit!'); process.exit(1); }
console.log('Validatie OK: ' + scripts.length + ' inline scripts parsen, </html> aanwezig.');
