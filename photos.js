/* Plantfoto's via Wikimedia Commons - live opgezocht in de browser.
   Zelfstandige module: heeft alleen een script-tag in index.html nodig.
   Exacte match op volledige Latijnse naam (soort of cultivar) - geen terugval op geslacht. */
(function () {
  'use strict';

  var API = 'https://commons.wikimedia.org/w/api.php';
  var CACHE_PREFIX = 'plantfoto:';

  function plantNames() {
    try {
      var list = [];
      if (typeof allPlants !== 'undefined' && allPlants) list = allPlants;
      else if (typeof plantData !== 'undefined' && plantData) list = plantData;
      return list.map(function (p) { return p.latijnseNaam; }).filter(Boolean);
    } catch (e) { return []; }
  }

  /* Normaliseer: lowercase, alleen letters/cijfers. */
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /* Significante woorden uit een naam: genus + soort + cultivarnaam (zonder quotes/hyphens). */
  function nameWords(naam) {
    return String(naam || '').replace(/['\u2019]/g, ' ').split(/[\s-]+/)
      .map(function (w) { return norm(w); }).filter(function (w) { return w.length > 2; });
  }

  /* Bestandstitel moet ALLE significante woorden bevatten (exacte match, geen genus-terugval). */
  function titleMatches(title, naam) {
    var t = norm(title);
    var words = nameWords(naam);
    if (!words.length) return false;
    for (var i = 0; i < words.length; i++) { if (t.indexOf(words[i]) < 0) return false; }
    return true;
  }

  var BLOEI = ['flower', 'flowers', 'flor', 'flora', 'blute', 'bloom', 'blossom', 'inflorescen', 'bloei', 'fleur'];
  var BLAD = ['habit', 'habitus', 'leaf', 'leaves', 'foliage', 'blad', 'plant', 'planted', 'tuft', 'rosette'];
  var SKIP = ['herbarium', 'specimen', 'seed', 'seeds', 'zaad', 'fruit', 'map', 'distribution', 'drawing', 'illustration', 'botanical print'];

  function classify(title) {
    var t = String(title || '').toLowerCase();
    for (var i = 0; i < SKIP.length; i++) { if (t.indexOf(SKIP[i]) >= 0) return null; }
    for (var j = 0; j < BLOEI.length; j++) { if (t.indexOf(BLOEI[j]) >= 0) return 'bloei'; }
    for (var k = 0; k < BLAD.length; k++) { if (t.indexOf(BLAD[k]) >= 0) return 'blad'; }
    return 'overig';
  }

  function stripTags(html) {
    var d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').trim();
  }

  function fetchFotos(naam) {
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(CACHE_PREFIX + norm(naam)) || 'null'); } catch (e) {}
    if (cached) return Promise.resolve(cached);
    var q = encodeURIComponent(naam.replace(/['\u2019]/g, ' ').replace(/\s+/g, ' ').trim());
    var url = API + '?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=20' +
      '&gsrsearch=' + q + '&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=520';
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var pages = (j && j.query && j.query.pages) || {};
      var bloei = [], blad = [], overig = [];
      Object.keys(pages).forEach(function (k) {
        var pg = pages[k], ii = (pg.imageinfo || [])[0];
        if (!ii || !ii.thumburl) return;
        if (!titleMatches(pg.title, naam)) return;
        var md = ii.extmetadata || {};
        var lic = stripTags((md.LicenseShortName || {}).value) || 'onbekende licentie';
        if (/pd|public domain|no restrictions/i.test(lic) === false &&
            /cc/i.test(lic) === false) return; /* alleen vrije licenties */
        var item = {
          titel: pg.title,
          url: ii.thumburl,
          pagina: ii.descriptionurl,
          fotograaf: stripTags((md.Artist || {}).value) || 'onbekend',
          licentie: lic,
          breedte: ii.width || 0
        };
        var c = classify(pg.title + ' ' + (stripTags((md.ImageDescription || {}).value)));
        if (c === 'bloei') bloei.push(item);
        else if (c === 'blad') blad.push(item);
        else if (c === 'overig') overig.push(item);
      });
      var bySize = function (a, b) { return b.breedte - a.breedte; };
      bloei.sort(bySize); blad.sort(bySize); overig.sort(bySize);
      var res = { bloei: bloei.slice(0, 4), blad: blad.slice(0, 4), overig: overig.slice(0, 2) };
      try { sessionStorage.setItem(CACHE_PREFIX + norm(naam), JSON.stringify(res)); } catch (e) {}
      return res;
    }).catch(function () { return { bloei: [], blad: [], overig: [], fout: true }; });
  }

  /* ---------- UI ---------- */

  var modal = null;

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'plantfotoModal';
    modal.setAttribute('style',
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10000;' +
      'overflow:auto;padding:20px;');
    modal.addEventListener('click', function (e) { if (e.target === modal) sluitModal(); });
    document.body.appendChild(modal);
    return modal;
  }

  function sluitModal() { if (modal) { modal.style.display = 'none'; modal.innerHTML = ''; } }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') sluitModal(); });

  function imgHtml(it, label) {
    if (!it) return '';
    return '<div style="flex:1;min-width:240px;max-width:460px;background:#fff;border-radius:8px;padding:10px;box-sizing:border-box;">' +
      '<div style="font-weight:600;margin-bottom:6px;">' + label + '</div>' +
      '<a href="' + it.pagina + '" target="_blank" rel="noopener"><img src="' + it.url + '" alt="' + label + '" ' +
      'style="width:100%;height:auto;border-radius:6px;display:block;"></a>' +
      '<div style="font-size:11px;color:#555;margin-top:6px;line-height:1.4;">' +
      'Foto: ' + it.fotograaf + ' &middot; ' + it.licentie + ' &middot; ' +
      '<a href="' + it.pagina + '" target="_blank" rel="noopener">Wikimedia Commons</a></div></div>';
  }

  function toonFotos(naam, nlNaam) {
    var m = ensureModal();
    m.innerHTML = '<div style="background:#fff;max-width:960px;margin:20px auto;border-radius:10px;padding:18px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">' +
      '<h3 style="margin:0;">' + naam + (nlNaam ? ' <span style="font-weight:400;font-size:14px;">(' + nlNaam + ')</span>' : '') + '</h3>' +
      '<button id="plantfotoSluit" style="border:none;background:#eee;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:16px;">&#10005;</button></div>' +
      '<div id="plantfotoInhoud" style="margin-top:12px;color:#666;">Foto\'s zoeken op Wikimedia Commons...</div></div>';
    m.style.display = 'block';
    m.querySelector('#plantfotoSluit').addEventListener('click', sluitModal);
    fetchFotos(naam).then(function (res) {
      var el = m.querySelector('#plantfotoInhoud');
      if (!el) return;
      var html = '';
      if (res.fout) { html = '<p>Zoeken mislukt. Probeer het opnieuw.</p>'; }
      else if (!res.bloei.length && !res.blad.length && !res.overig.length) {
        html = '<p>Geen vrij gelicentieerde foto\'s gevonden op Wikimedia Commons voor exact deze naam.</p>' +
          '<p style="font-size:12px;">Er wordt bewust alleen gezocht op de volledige naam (soort of cultivar), ' +
          'om te voorkomen dat een foto van een andere soort uit hetzelfde geslacht wordt getoond.</p>';
      } else {
        html = '<div style="display:flex;flex-wrap:wrap;gap:14px;">' +
          imgHtml(res.bloei[0], 'In bloei') + imgHtml(res.blad[0], 'Blad / vorm') +
          imgHtml(res.overig[0], 'Overig') + '</div>';
        var extra = [];
        if (!res.bloei.length) extra.push('geen aparte bloeifoto');
        if (!res.blad.length) extra.push('geen aparte bladfoto');
        if (extra.length) html += '<p style="font-size:12px;color:#888;">Let op: ' + extra.join(', ') + ' gevonden.</p>';
      }
      el.innerHTML = html;
      el.style.color = '#222';
    });
  }

  function zoekNlNaam(naam) {
    try {
      var lijst = (typeof allPlants !== 'undefined' && allPlants) || plantData || [];
      for (var i = 0; i < lijst.length; i++) { if (lijst[i].latijnseNaam === naam) return lijst[i].nlNaam; }
    } catch (e) {}
    return '';
  }

  function maakKnop(naam) {
    var b = document.createElement('button');
    b.className = 'plantfoto-knop';
    b.innerHTML = '&#128247;';
    b.title = 'Foto\'s van ' + naam + ' (Wikimedia Commons)';
    b.setAttribute('style', 'border:none;background:transparent;cursor:pointer;font-size:14px;padding:0 4px;vertical-align:middle;');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      toonFotos(naam, zoekNlNaam(naam));
    });
    return b;
  }

  function decoreer(root) {
    var namen = {};
    plantNames().forEach(function (n) { namen[n.toLowerCase()] = n; });
    if (!Object.keys(namen).length) return;
    var els = (root || document.body).querySelectorAll('b, strong, h3, h4, span, div, td');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.children.length > 0 || el.querySelector('.plantfoto-knop')) continue;
      var naam = namen[String(el.textContent || '').trim().toLowerCase()];
      if (naam && el.textContent.trim().length > 3) el.appendChild(maakKnop(naam));
    }
  }

  var debounceTimer = null;
  function start() {
    decoreer(document.body);
    var mo = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { decoreer(document.body); }, 150);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 100); });
  } else { setTimeout(start, 100); }

  window.PlantFotos = { toonFotos: toonFotos, decoreer: decoreer, fetchFotos: fetchFotos };
})();
