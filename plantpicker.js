// PlantPicker: herbruikbaar planten-kiescomponent (zelfde look als de plantenlijst
// in index.html): filters (zoeken, kleur, standplaats, bloeimaand), groepering
// per geslacht, checkboxes en "Heel geslacht"-knop.
//
// Gebruik:
//   var picker = PlantPicker.create({
//     container: eenContainerElement,
//     plants: [...],                  // array plant-objecten
//     isChecked: function (latijnseNaam) { ... return bool; },
//     onToggle: function (plant, checked) { ... },
//     emptyText: '...'                // optionele tekst als plants leeg is
//   });
//   picker.refresh();                 // opnieuw renderen na externe wijzigingen
//
// Extra helpers (ook gebruikt voor samenvattingen):
//   PlantPicker.bloeiMaanden(plant) -> array van maandindexen 0-11 (jan=0)
//   PlantPicker.colorHex(kleur)     -> hex-kleur
//   PlantPicker.hoogteCategorie(plant) -> 'laag' | 'midden' | 'hoog' | 'onbekend'

window.PlantPicker = (function () {
  'use strict';

  var MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  var MONTH_ALIASES = {
    jan: 0, januari: 0,
    feb: 1, februari: 1,
    mrt: 2, maart: 2, maa: 2,
    apr: 3, april: 3,
    mei: 4,
    jun: 5, juni: 5,
    jul: 6, juli: 6,
    aug: 7, augustus: 7,
    sep: 8, sept: 8, september: 8,
    okt: 9, oktober: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  function monthIndex(s) {
    if (s == null) return -1;
    var v = String(s).toLowerCase().trim().replace(/[^a-z]/g, '');
    if (!v) return -1;
    if (MONTH_ALIASES[v] != null) return MONTH_ALIASES[v];
    if (v.length > 3) v = v.slice(0, 3);
    if (v === 'sep') v = 'sept';
    for (var key in MONTH_ALIASES) {
      if (key === v) return MONTH_ALIASES[key];
    }
    // laatste redmiddel: prefix-match op volledige maandnamen
    var full = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
    for (var i = 0; i < 12; i++) {
      if (full[i].indexOf(v) === 0) return i;
    }
    return -1;
  }

  function bloeiMaanden(plant) {
    if (!plant) return [];
    var from = monthIndex(plant.bloeiVan);
    var to = monthIndex(plant.bloeiTot);
    if (from < 0 || to < 0) return [];
    var out = [];
    if (to >= from) {
      for (var m = from; m <= to; m++) out.push(m);
    } else {
      // loopt over de jaarwisseling (bv. nov - feb)
      for (var m2 = from; m2 < 12; m2++) out.push(m2);
      for (var m3 = 0; m3 <= to; m3++) out.push(m3);
    }
    return out;
  }

  var COLOR_HEX = {
    wit: '#ffffff', creme: '#fff8dc', geel: '#ffd700', groengeel: '#adff2f',
    geelgroen: '#adff2f', warmgeel: '#f5c542', cremegeel: '#fffacd',
    roze: '#ffc0cb', lichtroze: '#ffb6c1', donkerroze: '#ff69b4',
    rood: '#e01111', donkerrood: '#8b0000', bordeaux: '#6d071a', bruinrood: '#8b0000',
    roodbruin: '#a0522d', bruin: '#8b4513', oranje: '#ffa500', abrikoos: '#f4a460',
    zalm: '#fa8072', perzik: '#ffdab9', paars: '#800080', donkerpaars: '#4b0082',
    lila: '#c8a2c8', lilapaars: '#c8a2c8', lilaroze: '#d8b2d8', mauve: '#e0b0ff',
    violet: '#8f00ff', violetblauw: '#4169e1', blauwpaars: '#483d8b', blauwrood: '#8a2be2',
    roodviolet: '#c71585', blauw: '#3a5fcd', lichtblauw: '#add8e6', hemelsblauw: '#87ceeb',
    groen: '#4c9a4c', groengrijs: '#8fbc8f', groenwit: '#eef5e9', grijs: '#a9b0b6',
    zilver: '#c0c0c0', zilvergrijs: '#b8bcb8', magenta: '#ff00ff', brons: '#cd7f32',
    koper: '#b87333', beige: '#f5f5dc', zwart: '#3b3b3b'
  };

  function foldAccents(s) {
    return String(s).replace(/[\u00e0-\u00e5]/g, 'a').replace(/[\u00e8-\u00eb]/g, 'e')
      .replace(/[\u00ec-\u00ef]/g, 'i').replace(/[\u00f2-\u00f6]/g, 'o')
      .replace(/[\u00f9-\u00fc]/g, 'u').replace(/\u00e7/g, 'c');
  }

  function colorHex(color) {
    if (!color) return '#cccccc';
    var c = foldAccents(String(color).toLowerCase()).replace(/[^a-z]/g, '');
    if (!c || c === 'onbekend') return '#cccccc';
    if (COLOR_HEX[c]) return COLOR_HEX[c];
    var best = null;
    for (var key in COLOR_HEX) {
      if (c.indexOf(key) !== -1 && (!best || key.length > best.length)) best = key;
    }
    return best ? COLOR_HEX[best] : '#cccccc';
  }

  function hoogteCategorie(plant) {
    if (!plant) return 'onbekend';
    var h = (plant.hoogteTot != null) ? plant.hoogteTot : plant.hoogteVan;
    if (h == null || isNaN(h)) return 'onbekend';
    if (h <= 40) return 'laag';
    if (h <= 80) return 'midden';
    return 'hoog';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function genusOf(plant) {
    var parts = String(plant.latijnseNaam || '').trim().split(/\s+/);
    return parts[0] || 'Overig';
  }

  var styleInjected = false;
  function injectStyle() {
    if (styleInjected || !document.head) return;
    var css = '' +
      '.pp-wrap { font-size: 13px; }' +
      '.pp-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }' +
      '.pp-filters input, .pp-filters select { padding: 6px 8px; border: 1px solid #dee2e6; border-radius: 4px; font-size: 13px; background: white; }' +
      '.pp-filters input[type="text"] { flex: 1; min-width: 160px; }' +
      '.pp-group { margin-bottom: 10px; border: 1px solid #dee2e6; border-radius: 6px; overflow: hidden; }' +
      '.pp-group-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #f0f4f0; font-weight: bold; color: #4a6b4a; font-size: 13px; }' +
      '.pp-group-header .pp-count { font-weight: normal; color: #6c757d; font-size: 12px; }' +
      '.pp-genus-btn { margin-left: auto; border: none; background: #7cb342; color: white; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 11px; }' +
      '.pp-genus-btn.remove { background: #ff6b6b; }' +
      '.pp-rows { display: flex; flex-direction: column; }' +
      '.pp-row { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-top: 1px solid #eef2ee; cursor: pointer; }' +
      '.pp-row:hover { background: #f7faf7; }' +
      '.pp-row input[type="checkbox"] { flex-shrink: 0; }' +
      '.pp-dot { width: 13px; height: 13px; border-radius: 50%; border: 1px solid #999; flex-shrink: 0; }' +
      '.pp-names { min-width: 140px; }' +
      '.pp-names strong { font-size: 13px; }' +
      '.pp-names em { display: block; font-size: 11px; color: #6c757d; font-style: normal; }' +
      '.pp-meta { margin-left: auto; display: flex; gap: 10px; font-size: 11px; color: #6c757d; white-space: nowrap; }' +
      '.pp-empty { color: #6c757d; font-size: 13px; padding: 8px 2px; }' +'.pp-summary { background: #f7faf7; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px 12px; margin-top: 12px; }' +'.pp-summary h4 { color: #4a6b4a; font-size: 0.85rem; margin-bottom: 6px; }' +'.pp-sum-colors { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }' +'.pp-sum-chip { display: inline-flex; align-items: center; gap: 5px; background: white; border: 1px solid #dee2e6; border-radius: 12px; padding: 2px 9px 2px 4px; font-size: 12px; }' +'.pp-sum-chip .dot { width: 13px; height: 13px; border-radius: 50%; border: 1px solid #999; }' +'.pp-sum-heights { font-size: 13px; margin-top: 8px; }' +'.pp-sum-months { display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; margin-top: 10px; }' +'.pp-sum-month { text-align: center; border: 1px solid #dee2e6; border-radius: 4px; padding: 3px 0; background: white; min-width: 0; }' +'.pp-sum-month .c { display: block; font-weight: bold; font-size: 13px; color: #4a6b4a; }' +'.pp-sum-month .m { display: block; font-size: 10px; color: #6c757d; text-transform: uppercase; }' +'.pp-sum-month.bloei { background: #e8f3e2; border-color: #7cb342; }' +'@media (max-width: 600px) { .pp-sum-months { grid-template-columns: repeat(6, 1fr); } }';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    styleInjected = true;
  }

  function create(opts) {
    injectStyle();
    var container = opts.container;
    var plants = opts.plants || [];
    var state = { q: '', kleur: '', standplaats: '', maand: '' };

    // unieke filterwaarden
    var kleuren = [], standplaatsen = [];
    plants.forEach(function (p) {
      if (p.kleur && kleuren.indexOf(p.kleur) === -1) kleuren.push(p.kleur);
      if (p.standplaats && standplaatsen.indexOf(p.standplaats) === -1) standplaatsen.push(p.standplaats);
    });
    kleuren.sort(); standplaatsen.sort();

    container.innerHTML =
      '<div class="pp-wrap">' +
        '<div class="pp-filters">' +
          '<input type="text" class="pp-search" placeholder="Zoek op naam...">' +
          '<select class="pp-filter-kleur"><option value="">Alle kleuren</option>' +
            kleuren.map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + '</option>'; }).join('') +
          '</select>' +
          '<select class="pp-filter-standplaats"><option value="">Alle standplaatsen</option>' +
            standplaatsen.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('') +
          '</select>' +
          '<select class="pp-filter-maand"><option value="">Alle bloeimaanden</option>' +
            MONTHS.map(function (m, i) { return '<option value="' + i + '">' + m + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div class="pp-list"></div>' +
      '</div>';

    var searchEl = container.querySelector('.pp-search');
    var listEl = container.querySelector('.pp-list');

    function matches(p) {
      if (state.kleur && p.kleur !== state.kleur) return false;
      if (state.standplaats && p.standplaats !== state.standplaats) return false;
      if (state.maand !== '' && bloeiMaanden(p).indexOf(Number(state.maand)) === -1) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        var hay = ((p.latijnseNaam || '') + ' ' + (p.nlNaam || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }

    function renderList() {
      if (!plants.length) {
        listEl.innerHTML = '<p class="pp-empty">' + esc(opts.emptyText || 'Geen planten beschikbaar.') + '</p>';
        return;
      }
      var visible = plants.filter(matches);
      if (!visible.length) {
        listEl.innerHTML = '<p class="pp-empty">Geen planten gevonden die aan de filters voldoen.</p>';
        return;
      }
      // groepeer per geslacht
      var groups = {};
      var order = [];
      visible.forEach(function (p) {
        var g = genusOf(p);
        if (!groups[g]) { groups[g] = []; order.push(g); }
        groups[g].push(p);
      });
      order.sort(function (a, b) { return a.localeCompare(b, 'nl'); });

      listEl.innerHTML = order.map(function (g) {
        var rows = groups[g];
        var checkedCount = rows.filter(function (p) { return opts.isChecked(p.latijnseNaam); }).length;
        var allChecked = checkedCount === rows.length;
        return '<div class="pp-group" data-genus="' + esc(g) + '">' +
          '<div class="pp-group-header">' + esc(g) +
            ' <span class="pp-count">(' + rows.length + (checkedCount ? ' \u00b7 ' + checkedCount + ' gekozen' : '') + ')</span>' +
            '<button class="pp-genus-btn' + (allChecked ? ' remove' : '') + '">' +
              (allChecked ? '\u2715 Van keuze af' : '+ Heel geslacht') + '</button>' +
          '</div>' +
          '<div class="pp-rows">' + rows.map(function (p) {
            var checked = opts.isChecked(p.latijnseNaam);
            return '<label class="pp-row" data-plant="' + esc(p.latijnseNaam) + '">' +
              '<input type="checkbox" class="pp-check"' + (checked ? ' checked' : '') + '>' +
              '<span class="pp-dot" style="background-color:' + colorHex(p.kleur) + ';"></span>' +
              '<span class="pp-names"><strong>' + esc(p.latijnseNaam) + '</strong><em>' + esc(p.nlNaam) + '</em></span>' +
              '<span class="pp-meta">' +
                '<span>' + esc(p.bloeiVan || '-') + ' - ' + esc(p.bloeiTot || '-') + '</span>' +
                '<span>' + (p.hoogteVan != null ? esc(p.hoogteVan) + (p.hoogteTot > p.hoogteVan ? '-' + esc(p.hoogteTot) : '') + ' cm' : '-') + '</span>' +
                '<span>' + esc(p.standplaats || '-') + '</span>' +
              '</span>' +
            '</label>';
          }).join('') + '</div>' +
        '</div>';
      }).join('');
    }

    // events (delegation)
    container.addEventListener('input', function (e) {
      if (e.target.classList.contains('pp-search')) {
        state.q = e.target.value.trim(); renderList();
      }
    });
    container.addEventListener('change', function (e) {
      if (e.target.classList.contains('pp-filter-kleur')) { state.kleur = e.target.value; renderList(); }
      else if (e.target.classList.contains('pp-filter-standplaats')) { state.standplaats = e.target.value; renderList(); }
      else if (e.target.classList.contains('pp-filter-maand')) { state.maand = e.target.value; renderList(); }
      else if (e.target.classList.contains('pp-check')) {
        var row = e.target.closest('.pp-row');
        var name = row ? row.getAttribute('data-plant') : null;
        var plant = plants.find(function (p) { return p.latijnseNaam === name; });
        if (plant) opts.onToggle(plant, e.target.checked);
      }
    });
    container.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.pp-genus-btn') : null;
      if (!btn) return;
      var group = btn.closest('.pp-group');
      var rows = group ? Array.prototype.slice.call(group.querySelectorAll('.pp-row')) : [];
      var anyUnchecked = rows.some(function (r) {
        var cb = r.querySelector('.pp-check');
        return cb && !cb.checked;
      });
      rows.forEach(function (r) {
        var cb = r.querySelector('.pp-check');
        if (!cb) return;
        var want = anyUnchecked; // alles aan, of alles uit
        if (cb.checked !== want) {
          cb.checked = want;
          var name = r.getAttribute('data-plant');
          var plant = plants.find(function (p) { return p.latijnseNaam === name; });
          if (plant) opts.onToggle(plant, want);
        }
      });
    });

    renderList();

    return {
      refresh: function () { renderList(); },
      bloeiMaanden: bloeiMaanden
    };
  }

  // Gedeelde samenvatting (kleuren, hoogtes, bloei per maand) - gebruikt in
  // de shortlist-tab van de planner en in de border-editor.
  function renderSummary(container, plants, opts) {
    if (!container) return;
    opts = opts || {};
    plants = plants || [];
    injectStyle();
    if (!plants.length) {
      container.innerHTML = '<div class="pp-summary"><h4>' + esc(opts.title || 'Samenvatting') + '</h4>' +
        '<p style="font-size:13px;color:#6c757d;">' + esc(opts.emptyText || 'Vink planten aan om een samenvatting te zien van kleuren, hoogtes en bloeimaanden.') + '</p></div>';
      return;
    }
    var kleuren = {};
    plants.forEach(function (p) {
      var k = p.kleur || 'onbekend';
      kleuren[k] = (kleuren[k] || 0) + 1;
    });
    var kleurHtml = Object.keys(kleuren).sort().map(function (k) {
      return '<span class="pp-sum-chip"><span class="dot" style="background-color:' + colorHex(k) + ';"></span>' +
        esc(k) + (kleuren[k] > 1 ? ' \u00d7 ' + kleuren[k] : '') + '</span>';
    }).join('');
    var laag = 0, midden = 0, hoog = 0, onbekend = 0;
    plants.forEach(function (p) {
      var cat = hoogteCategorie(p);
      if (cat === 'laag') laag++;
      else if (cat === 'midden') midden++;
      else if (cat === 'hoog') hoog++;
      else onbekend++;
    });
    var hoogteHtml = 'Laag (&lt;40 cm): <strong>' + laag + '</strong> \u00b7 ' +
      'Midden (40-80 cm): <strong>' + midden + '</strong> \u00b7 ' +
      'Hoog (&gt;80 cm): <strong>' + hoog + '</strong>' +
      (onbekend ? ' \u00b7 Onbekend: <strong>' + onbekend + '</strong>' : '');
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    plants.forEach(function (p) {
      bloeiMaanden(p).forEach(function (m) { counts[m]++; });
    });
    var maandHtml = MONTHS.map(function (m, i) {
      var c = counts[i];
      return '<div class="pp-sum-month' + (c > 0 ? ' bloei' : '') + '"' +
        (c > 0 ? ' title="' + c + ' bloeiende plant' + (c > 1 ? 'en' : '') + '"' : '') + '>' +
        '<span class="c">' + (c > 0 ? c : '\u00b7') + '</span><span class="m">' + esc(m) + '</span></div>';
    }).join('');
    container.innerHTML = '<div class="pp-summary"><h4>' + esc(opts.title || 'Samenvatting') +
      ' \u2014 ' + plants.length + ' plant(en)</h4>' +
      '<div class="pp-sum-colors">' + kleurHtml + '</div>' +
      '<div class="pp-sum-heights">' + hoogteHtml + '</div>' +
      '<div class="pp-sum-months">' + maandHtml + '</div></div>';
  }

  return {
    create: create,
    renderSummary: renderSummary,
    monthIndex: monthIndex,
    bloeiMaanden: bloeiMaanden,
    colorHex: colorHex,
    hoogteCategorie: hoogteCategorie,
    MONTHS: MONTHS
  };
})();
