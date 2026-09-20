// Border-editor met twee tabjes: (1) planten kiezen uit de shortlist
// (herbruikbaar PlantPicker-component + samenvatting) en (2) planten
// plaatsen op de tekening (zoom/pan, slepen, verwijderen).
// Data in localStorage (zelfde als index).

(function () {
  'use strict';

  var borderId = null;
  try {
    var params = new URLSearchParams(window.location.search);
    borderId = params.get('id');
  } catch (e) {}

  var borders = [];
  try { borders = JSON.parse(localStorage.getItem('borders')) || []; } catch (e) { borders = []; }
  var shortlist = [];
  try { shortlist = JSON.parse(localStorage.getItem('shortlist')) || []; } catch (e) { shortlist = []; }

  var border = borders.find(function (b) { return b.id === borderId; }) || null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var colorToHex = {
    wit: '#ffffff', geel: '#ffd700', roze: '#ffc0cb', rood: '#ff0000',
    paars: '#800080', blauw: '#0000ff', oranje: '#ffa500', bruinrood: '#8b0000',
    groengeel: '#adff2f', lichtroze: '#ffb6c1', lilapaars: '#c8a2c8',
    cremegeel: '#fffacd', violetblauw: '#4169e1', lichtblauw: '#add8e6'
  };
  function getColorHex(color) {
    if (!color) return '#cccccc';
    var c = color.toLowerCase().replace(/\s+/g, '');
    for (var key in colorToHex) {
      if (c.indexOf(key) !== -1) return colorToHex[key];
    }
    return '#cccccc';
  }

  function showError(msg) {
    document.getElementById('editorBox').style.display = 'none';
    document.getElementById('errorText').textContent = msg;
    document.getElementById('errorBox').style.display = '';
  }

  if (!border) {
    showError('Deze border bestaat niet (meer).');
    return;
  }
  if (!border.shape || border.shape.length < 3) {
    showError('Deze border heeft nog geen vorm. Teken de border eerst op de kaart in de planner (of via "Border intekenen"), dan kun je hem hier vullen met planten.');
    return;
  }

  // ===== Opslaan =====
  function saveState() {
    localStorage.setItem('borders', JSON.stringify(borders));
  }

  // ===== Tabjes =====
  var TAB_KEY = 'borderEditorTab';
  function setTab(name) {
    var buttons = document.querySelectorAll('#borderTabs button');
    buttons.forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-btab') === name);
    });
    document.getElementById('btab-plants').classList.toggle('active', name === 'plants');
    document.getElementById('btab-place').classList.toggle('active', name === 'place');
    try { localStorage.setItem(TAB_KEY, name); } catch (e) {}
    if (name === 'place') {
      // SVG had afmeting 0 terwijl verborgen: view opnieuw toepassen
      applyView();
    }
  }
  document.getElementById('borderTabs').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-btab]') : null;
    if (btn) setTab(btn.getAttribute('data-btab'));
  });

  // ===== Projectie: lat/lng -> lokale meters (afstand-getrouw, zoombaar) =====
  var lat0 = border.shape[0][0];
  var lng0 = border.shape[0][1];
  var M_LAT = 110540; // meter per graad breedte
  var M_LNG = 111320 * Math.cos(lat0 * Math.PI / 180); // meter per graad lengte op deze breedte

  function toLocal(lat, lng) {
    return { x: (lng - lng0) * M_LNG, y: -(lat - lat0) * M_LAT };
  }
  function toLatLng(x, y) {
    return { lat: lat0 - y / M_LAT, lng: lng0 + x / M_LNG };
  }

  // Bounding box van de vorm
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  border.shape.forEach(function (pt) {
    var p = toLocal(pt[0], pt[1]);
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  });
  var w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  // ===== SVG-view met zoom + pan =====
  var svg = document.getElementById('shapeSvg');
  var viewGroup = document.getElementById('viewGroup');
  var view = { scale: 1, tx: 0, ty: 0 }; // transform: translate(tx,ty) scale(s), uitgaande van fit-view

  function svgSize() {
    return { w: svg.clientWidth || 600, h: svg.clientHeight || 480 };
  }

  var lastMarkerScale = null;
  function applyView() {
    var s = svgSize();
    var base = Math.min(s.w / w, s.h / h) * 0.8; // fit met marge
    // viewBox in "fit"-coordinaten: vorm gecentreerd rond (0,0)
    viewGroup.setAttribute('transform',
      'translate(' + (s.w / 2 + view.tx) + ',' + (s.h / 2 + view.ty) + ') ' +
      'scale(' + (base * view.scale) + ') translate(' + (-cx) + ',' + (-cy) + ')');
    // houd markers op constante schermgrootte bij zoomen
    if (lastMarkerScale !== null && lastMarkerScale !== view.scale) drawAllMarkers();
    lastMarkerScale = view.scale;
  }

  function screenToWorld(clientX, clientY) {
    var s = svgSize();
    var base = Math.min(s.w / w, s.h / h) * 0.8;
    var rect = svg.getBoundingClientRect();
    var px = clientX - rect.left, py = clientY - rect.top;
    var fx = (px - s.w / 2 - view.tx) / (base * view.scale) + cx;
    var fy = (py - s.h / 2 - view.ty) / (base * view.scale) + cy;
    return { x: fx, y: fy };
  }

  function zoomAt(clientX, clientY, factor) {
    var s = svgSize();
    var px = clientX - svg.getBoundingClientRect().left - s.w / 2;
    var py = clientY - svg.getBoundingClientRect().top - s.h / 2;
    // houd punt onder cursor vast bij zoomen
    view.tx = px - (px - view.tx) * factor;
    view.ty = py - (py - view.ty) * factor;
    view.scale *= factor;
    view.scale = Math.min(Math.max(view.scale, 0.2), 60);
    applyView();
  }

  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  document.getElementById('zoomInBtn').addEventListener('click', function () {
    var s = svgSize();
    zoomAt(svg.getBoundingClientRect().left + s.w / 2, svg.getBoundingClientRect().top + s.h / 2, 1.3);
  });
  document.getElementById('zoomOutBtn').addEventListener('click', function () {
    var s = svgSize();
    zoomAt(svg.getBoundingClientRect().left + s.w / 2, svg.getBoundingClientRect().top + s.h / 2, 1 / 1.3);
  });
  document.getElementById('zoomResetBtn').addEventListener('click', function () {
    view = { scale: 1, tx: 0, ty: 0 };
    applyView();
  });
  window.addEventListener('resize', applyView);

  // ===== Vorm tekenen =====
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  var shapePath = border.shape.map(function (pt, i) {
    var p = toLocal(pt[0], pt[1]);
    return (i === 0 ? 'M' : 'L') + p.x + ' ' + p.y;
  }).join(' ') + ' Z';
  viewGroup.appendChild(el('path', {
    d: shapePath, fill: '#a5d6a7', 'fill-opacity': '0.5',
    stroke: '#2e7d32', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke'
  }));

  // ===== Planten selecteren / plaatsen / slepen =====
  var selectedPlant = null; // latijnseNaam van plant die geplaatst gaat worden
  var markers = {}; // latijnseNaam -> svg-groep

  var plantLayer = el('g', {});
  viewGroup.appendChild(plantLayer);

  function markerRadius() {
    // constante schermgrootte ongeacht zoom
    var s = svgSize();
    var base = Math.min(s.w / w, s.h / h) * 0.8;
    return 10 / (base * view.scale);
  }

  function plantByName(name) {
    return border.plants.find(function (p) { return p.latijnseNaam === name; }) || null;
  }

  function drawMarker(plant) {
    var old = markers[plant.latijnseNaam];
    if (old) plantLayer.removeChild(old);
    if (!plant.pos) return;
    var p = toLocal(plant.pos.lat, plant.pos.lng);
    var g = el('g', { style: 'cursor: move;' });
    var r = markerRadius();
    g.appendChild(el('circle', {
      cx: p.x, cy: p.y, r: r, fill: getColorHex(plant.kleur),
      stroke: plant.latijnseNaam === selectedPlant ? '#1565c0' : '#333',
      'stroke-width': plant.latijnseNaam === selectedPlant ? 3 : 1,
      'vector-effect': 'non-scaling-stroke'
    }));
    plantLayer.appendChild(g);
    markers[plant.latijnseNaam] = g;

    // slepen
    var dragging = false, moved = false;
    g.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      dragging = true; moved = false;
      g.setPointerCapture(e.pointerId);
    });
    g.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      moved = true;
      var wp = screenToWorld(e.clientX, e.clientY);
      var ll = toLatLng(wp.x, wp.y);
      plant.pos = { lat: ll.lat, lng: ll.lng };
      var loc = toLocal(plant.pos.lat, plant.pos.lng);
      var c = g.querySelector('circle');
      c.setAttribute('cx', loc.x); c.setAttribute('cy', loc.y);
    });
    g.addEventListener('pointerup', function (e) {
      dragging = false;
      if (moved) saveState();
      else {
        // klik op marker: positie wissen
        if (confirm('Positie van ' + (plant.nlNaam || plant.latijnseNaam) + ' wissen?')) {
          plant.pos = null; saveState(); renderAll();
        }
      }
    });
    g.addEventListener('dblclick', function (e) { e.stopPropagation(); });
  }

  function drawAllMarkers() {
    plantLayer.innerHTML = '';
    markers = {};
    border.plants.forEach(drawMarker);
  }

  // Klik op lege vlakte: geselecteerde plant plaatsen (niet direct na het pannen)
  svg.addEventListener('click', function (e) {
    if (justPanned) { justPanned = false; return; }
    // alleen plaatsen bij klik op achtergrond of de vorm zelf, niet op een plant-marker
    if (e.target !== svg && e.target.parentNode !== viewGroup) return;
    if (!selectedPlant) return;
    var plant = plantByName(selectedPlant);
    if (!plant) return;
    var wp = screenToWorld(e.clientX, e.clientY);
    var ll = toLatLng(wp.x, wp.y);
    plant.pos = { lat: ll.lat, lng: ll.lng };
    saveState();
    renderAll();
  });

  // ===== Tab 1: planten kiezen uit de shortlist (herbruikbaar component) =====
  var picker = window.PlantPicker.create({
    container: document.getElementById('pickerContainer'),
    plants: shortlist,
    emptyText: 'Je shortlist is nog leeg. Ga terug naar de planner en vink daar planten aan om ze aan de shortlist toe te voegen.',
    isChecked: function (name) {
      return !!plantByName(name);
    },
    onToggle: function (plant, checked) {
      if (checked) {
        if (plantByName(plant.latijnseNaam)) return;
        var copy = JSON.parse(JSON.stringify(plant));
        copy.pos = null;
        border.plants.push(copy);
      } else {
        border.plants = border.plants.filter(function (p) {
          return p.latijnseNaam !== plant.latijnseNaam;
        });
        if (selectedPlant === plant.latijnseNaam) {
          selectedPlant = null;
          svg.classList.remove('placing');
        }
      }
      saveState();
      renderAll();
    }
  });

  // ===== Samenvatting: kleuren, hoogtes, bloei per maand =====
  var MONTHS = window.PlantPicker.MONTHS;

  function renderSummary() {
    var box = document.getElementById('borderSummary');
    var plants = border.plants;
    if (!plants.length) {
      box.innerHTML = '<h4>Samenvatting</h4><p style="font-size:13px;color:#6c757d;">Vink hierboven planten aan om een samenvatting te zien van kleuren, hoogtes en bloeimaanden.</p>';
      return;
    }

    // Kleuren
    var kleuren = {};
    plants.forEach(function (p) {
      var k = p.kleur || 'onbekend';
      kleuren[k] = (kleuren[k] || 0) + 1;
    });
    var kleurHtml = Object.keys(kleuren).sort().map(function (k) {
      return '<span class="sum-chip"><span class="dot" style="background-color:' + getColorHex(k) + ';"></span>' +
        esc(k) + (kleuren[k] > 1 ? ' \u00d7 ' + kleuren[k] : '') + '</span>';
    }).join('');

    // Hoogtes
    var laag = 0, midden = 0, hoog = 0, onbekend = 0;
    plants.forEach(function (p) {
      var cat = window.PlantPicker.hoogteCategorie(p);
      if (cat === 'laag') laag++;
      else if (cat === 'midden') midden++;
      else if (cat === 'hoog') hoog++;
      else onbekend++;
    });
    var hoogteHtml = '\ud83c\udf31 Laag (&lt;40 cm): <strong>' + laag + '</strong> \u00b7 ' +
      'Midden (40-80 cm): <strong>' + midden + '</strong> \u00b7 ' +
      'Hoog (&gt;80 cm): <strong>' + hoog + '</strong>' +
      (onbekend ? ' \u00b7 Onbekend: <strong>' + onbekend + '</strong>' : '');

    // Bloeimaanden
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    plants.forEach(function (p) {
      window.PlantPicker.bloeiMaanden(p).forEach(function (m) { counts[m]++; });
    });
    var maandHtml = MONTHS.map(function (m, i) {
      var c = counts[i];
      return '<div class="sum-month' + (c > 0 ? ' bloei' : '') + '"' +
        (c > 0 ? ' title="' + c + ' bloeiende plant' + (c > 1 ? 'en' : '') + '"' : '') + '>' +
        '<span class="c">' + (c > 0 ? c : '\u00b7') + '</span><span class="m">' + esc(m) + '</span></div>';
    }).join('');

    box.innerHTML = '<h4>Samenvatting van ' + plants.length + ' gekozen plant(en)</h4>' +
      '<div class="sum-colors">' + kleurHtml + '</div>' +
      '<div class="sum-heights">' + hoogteHtml + '</div>' +
      '<div class="sum-months">' + maandHtml + '</div>';
  }

  // ===== Tab 2-paneel: palette =====
  function renderPalette() {
    var list = document.getElementById('paletteList');
    if (border.plants.length === 0) {
      list.innerHTML = '<p style="font-size:13px;color:#6c757d;">Nog geen planten in deze border. Kies ze in het tabje Planten kiezen.</p>';
      return;
    }
    list.innerHTML = border.plants.map(function (p) {
      var name = esc(p.latijnseNaam);
      var placed = !!p.pos;
      return '<div class="palette-item ' + (p.latijnseNaam === selectedPlant ? 'selected' : '') + '" data-plant="' + name + '">' +
        '<span class="dot" style="background-color:' + getColorHex(p.kleur) + ';"></span>' +
        '<span><strong>' + name + '</strong><br><em style="font-size:11px;color:#6c757d;">' + esc(p.nlNaam) + '</em></span>' +
        '<span class="status">' + (placed ? '\u2713 geplaatst' : 'klik om te plaatsen') + '</span>' +
        '</div>';
    }).join('');
  }

  document.getElementById('paletteList').addEventListener('click', function (e) {
    var item = e.target.closest ? e.target.closest('.palette-item') : null;
    if (!item) return;
    var name = item.getAttribute('data-plant');
    selectedPlant = (selectedPlant === name) ? null : name;
    svg.classList.toggle('placing', !!selectedPlant);
    renderPalette();
    drawAllMarkers();
  });

  function renderTable() {
    var body = document.getElementById('plantTableBody');
    body.innerHTML = border.plants.map(function (p) {
      var name = esc(p.latijnseNaam);
      return '<tr>' +
        '<td><strong>' + name + '</strong><br><em>' + esc(p.nlNaam) + '</em></td>' +
        '<td><span class="color-indicator" style="background-color:' + getColorHex(p.kleur) + ';"></span> ' + esc(p.kleur) + '</td>' +
        '<td>' + esc(p.bloeiVan) + ' - ' + esc(p.bloeiTot) + '</td>' +
        '<td>' + esc(p.hoogteVan) + (p.hoogteTot > p.hoogteVan ? '-' + esc(p.hoogteTot) : '') + ' cm</td>' +
        '<td>' + esc(p.standplaats) + '</td>' +
        '<td><button class="btn btn-danger" data-removeplant="' + name + '">\u2715</button></td>' +
        '</tr>';
    }).join('');
  }

  document.getElementById('plantTableBody').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-removeplant]') : null;
    if (!btn) return;
    var name = btn.getAttribute('data-removeplant');
    border.plants = border.plants.filter(function (p) { return p.latijnseNaam !== name; });
    if (selectedPlant === name) selectedPlant = null;
    saveState(); renderAll();
  });

  function renderHeader() {
    document.title = border.name + ' \u2013 Tuinplantplanner';
    document.getElementById('borderTitle').textContent = border.name;
    var placed = border.plants.filter(function (p) { return p.pos; }).length;
    document.getElementById('borderSubtitle').textContent =
      border.shape.length + ' hoekpunten \u00b7 ' + border.plants.length + ' planten \u00b7 ' + placed + ' geplaatst';
    document.getElementById('placedInfo').textContent =
      placed + ' van ' + border.plants.length + ' planten geplaatst';
  }

  function renderAll() {
    renderHeader();
    picker.refresh();
    renderSummary();
    renderPalette();
    drawAllMarkers();
    renderTable();
    applyView();
  }

  // ===== Pan (slepen op lege ondergrond) =====
  var panning = false, panStart = null, justPanned = false;
  svg.addEventListener('pointerdown', function (e) {
    if (e.target !== svg && e.target.parentNode !== viewGroup) return;
    panning = true; moved2 = false;
    panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    svg.setPointerCapture(e.pointerId);
    svg.style.cursor = 'grabbing';
  });
  var moved2 = false;
  svg.addEventListener('pointermove', function (e) {
    if (!panning) return;
    var dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved2 = true;
    if (moved2) justPanned = true;
    view.tx = panStart.tx + dx; view.ty = panStart.ty + dy;
    applyView();
  });
  svg.addEventListener('pointerup', function (e) {
    if (!panning) return;
    panning = false;
    svg.style.cursor = selectedPlant ? 'crosshair' : 'grab';
    if (!moved2) return; // klik: val door naar click-handler hierboven
  });

  // ===== Naam wijzigen / verwijderen =====
  document.getElementById('renameBtn').addEventListener('click', function () {
    var name = prompt('Nieuwe naam voor deze border:', border.name);
    if (!name) return;
    border.name = name;
    saveState(); renderHeader();
  });

  document.getElementById('deleteBorderBtn').addEventListener('click', function () {
    if (!confirm('Border "' + border.name + '" inclusief geplaatste planten verwijderen?')) return;
    borders = borders.filter(function (b) { return b.id !== border.id; });
    localStorage.setItem('borders', JSON.stringify(borders));
    window.location.href = 'index.html';
  });

  // ===== Start =====
  var startTab = 'plants';
  try {
    var saved = localStorage.getItem(TAB_KEY);
    if (saved === 'plants' || saved === 'place') startTab = saved;
  } catch (e) {}
  setTab(startTab);
  renderAll();
})();
