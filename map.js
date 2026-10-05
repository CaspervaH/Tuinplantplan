// Kaart- en adresfunctionaliteit Tuinplantplanner (Leaflet + PDOK)
// Nieuwe flow: vormen (borders én tuinobjecten zoals terras, pad, haag) teken
// je direct op de kaart; planten plaatsen gebeurt in de Borders-tab van de
// planner (index.html). Hoekpunten van getekende vormen kun je verslepen.

var drawMode = false;
var drawKind = null; // 'border' of een tuinobject-type (terras, pad, ...)
var drawPoints = [];
var drawPreview = null;

var editVerticesMode = false; // hoekpunten-sleepmodus
var selectedShape = null;     // { kind: 'border'|'object', obj, arr }

var savedMapView = null;
try { savedMapView = JSON.parse(localStorage.getItem('mapView')); } catch (e) {}

var gardenMap = L.map('gardenMap', { maxZoom: 28 }).setView(
  savedMapView ? [savedMapView.lat, savedMapView.lng] : [52.1, 5.3],
  savedMapView ? savedMapView.zoom : 12
);
var osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 28, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap'
});
osmLayer.addTo(gardenMap);
// Kadastrale kaart als WMTS-tegels (betrouwbaar, ook op hoog zoomniveau)
var kadasterLayer = L.tileLayer('https://service.pdok.nl/kadaster/brk-kadastralekaart/wmts/v5_0/Kadastralekaart/EPSG:3857/{z}/{x}/{y}.png', {
  maxZoom: 28, maxNativeZoom: 19, opacity: 0.9, minZoom: 14,
  attribution: 'Kadastrale kaart: PDOK / Kadaster'
});
kadasterLayer.addTo(gardenMap);

var mapShapeLayer = L.layerGroup().addTo(gardenMap);
var mapObjectLayer = L.layerGroup().addTo(gardenMap);
var mapMarkerLayer = L.layerGroup().addTo(gardenMap);
var vertexLayer = L.layerGroup().addTo(gardenMap);
var distLayer = L.layerGroup().addTo(gardenMap);
var freehandOn = false;    // vrij tekenen met Apple Pencil / vinger
var holeTarget = null;     // object waarin nu een gat wordt getekend
var circleMode = false;    // perfecte cirkel tekenen (tik middelpunt, tik rand)
var circleCenter = null;
var circlePreview = null;  // L.circle als live voorbeeld van de cirkel

// ===== Afstanden tussen hoekpunten (echte meters uit de coördinaten) =====
function distanceMeters(a, b) {
  var R = 6371000;
  var dLat = (b[0] - a[0]) * Math.PI / 180;
  var dLng = (b[1] - a[1]) * Math.PI / 180;
  var la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fmtDist(m) {
  if (m < 1) return Math.round(m * 100) + ' cm';
  if (m < 10) return (Math.round(m * 10) / 10).toString().replace('.', ',') + ' m';
  return Math.round(m) + ' m';
}

function shapeIsClosed(kind, obj) {
  if (kind === 'border') return true;
  return !!(obj && obj.closed && obj.shape && obj.shape.length >= 3);
}

function showDistances(points, closed) {
  distLayer.clearLayers();
  if (!points || points.length < 2) return;
  var total = 0;
  var n = closed ? points.length : points.length - 1;
  for (var i = 0; i < n; i++) {
    var a = points[i], b = points[(i + 1) % points.length];
    var d = distanceMeters(a, b);
    total += d;
    var pa = gardenMap.latLngToLayerPoint(a), pb = gardenMap.latLngToLayerPoint(b);
    var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    var dx = pb.x - pa.x, dy = pb.y - pa.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var off = 15;
    var lp = gardenMap.layerPointToLatLng([mx - (dy / len) * off, my + (dx / len) * off]);
    L.marker([lp.lat, lp.lng], {
      interactive: false,
      icon: L.divIcon({ className: 'dist-label', iconSize: [0, 0], html: fmtDist(d) })
    }).addTo(distLayer);
  }
  var cx = 0, cy = 0;
  points.forEach(function (p) { cx += p[0]; cy += p[1]; });
  L.marker([cx / points.length, cy / points.length], {
    interactive: false,
    icon: L.divIcon({ className: 'dist-label dist-total', iconSize: [0, 0],
      html: (closed ? 'Omtrek: ' : 'Lengte: ') + fmtDist(total) })
  }).addTo(distLayer);
}

// ===== Adres-gate =====
function geocodeAddress(q, onSuccess, onFail) {
  fetch('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=' + encodeURIComponent(q) + '&fq=type:adres&rows=1')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var doc = d.response && d.response.docs && d.response.docs[0];
      var m = doc && doc.centroide_ll && doc.centroide_ll.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
      if (m && doc.weergavenaam) {
        onSuccess(doc.weergavenaam, parseFloat(m[2]), parseFloat(m[1]));
      } else { onFail(); }
    })
    .catch(function () { onFail(); });
}

function applyAddress(addr, lat, lng, zoomTo) {
  localStorage.setItem('gardenAddress', JSON.stringify({ addr: addr, lat: lat, lng: lng }));
  document.body.classList.add('has-address');
  document.getElementById('addressTitle').textContent = '\uD83D\uDCCD ' + addr;
  if (zoomTo) gardenMap.setView([lat, lng], 19);
  setTimeout(function () { gardenMap.invalidateSize(); }, 50);
  setTimeout(function () { gardenMap.invalidateSize(); }, 400);
  window.scrollTo(0, 0);
}

function submitGateAddress() {
  var q = document.getElementById('gateAddressInput').value.trim();
  if (!q) { alert('Voer een adres in, bv. "Dorpsstraat 1, Utrecht".'); return; }
  var btn = document.getElementById('gateAddressBtn');
  btn.disabled = true; btn.textContent = 'Zoeken...';
  geocodeAddress(q, function (addr, lat, lng) {
    btn.disabled = false; btn.textContent = 'Naar mijn tuin \u2192';
    applyAddress(addr, lat, lng, true);
  }, function () {
    btn.disabled = false; btn.textContent = 'Naar mijn tuin \u2192';
    alert('Adres niet gevonden. Probeer bv. "Straatnaam 12, Plaats".');
  });
}

document.getElementById('gateAddressBtn').addEventListener('click', submitGateAddress);
document.getElementById('gateAddressInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') submitGateAddress();
});
document.getElementById('changeAddressBtn').addEventListener('click', function () {
  document.body.classList.remove('has-address');
  var input = document.getElementById('gateAddressInput');
  input.value = '';
  input.focus();
  window.scrollTo(0, 0);
});

// Opgeslagen adres herstellen
(function () {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('gardenAddress')); } catch (e) {}
  if (saved && saved.addr) {
    document.body.classList.add('has-address');
    document.getElementById('addressTitle').textContent = '\uD83D\uDCCD ' + saved.addr;
    setTimeout(function () { gardenMap.invalidateSize(); }, 50);
    setTimeout(function () { gardenMap.invalidateSize(); }, 400);
  } else {
    setTimeout(function () { document.getElementById('gateAddressInput').focus(); }, 100);
  }
})();

function saveMapView() {
  var c0 = gardenMap.getCenter();
  localStorage.setItem('mapView', JSON.stringify({ lat: c0.lat, lng: c0.lng, zoom: gardenMap.getZoom() }));
}
gardenMap.on('moveend zoomend', saveMapView);

// Plantenmarkering op de kaart: zelfde stijl als in het borderontwerp —
// gevulde bol ter grootte van de plantafstand met de afkorting erin
function plantMarkerIcon(p, rM) {
  var maxChars = 10;
  var init = PlantPicker.plantShortName(p.latijnseNaam, maxChars);
  var rPx = Math.max((rM / metersPerPixel()), 4);
  var fit = Math.max(Math.min(Math.floor(rPx / 3.4), 10), 2);
  var txt = init.length > fit ? PlantPicker.plantShortName(p.latijnseNaam, fit) : init;
  var lines = txt.length > fit && txt.length >= 4
    ? [txt.slice(0, Math.ceil(txt.length / 2)), txt.slice(Math.ceil(txt.length / 2))]
    : [txt];
  var fs = lines.length === 1
    ? Math.min(rPx * 0.85, (rPx * 1.6) / Math.max(txt.length, 1))
    : Math.min(rPx * 0.58, (rPx * 1.5) / Math.max(lines[0].length, lines[1].length, 1));
  var html = '<svg width="' + (rPx * 2 + 8) + '" height="' + (rPx * 2 + 8) + '" viewBox="' + (-(rPx + 4)) + ' ' + (-(rPx + 4)) + ' ' + (rPx * 2 + 8) + ' ' + (rPx * 2 + 8) + '" style="overflow:visible;display:block;">' +
    '<circle r="' + rPx + '" fill="' + (getColorHex(p.kleur) || '#8bc34a') + '" stroke="#333" stroke-width="1"/>' +
    '<text text-anchor="middle" y="' + (lines.length === 1 ? 0 : -fs * 0.55) + '" dy="0.35em" font-size="' + fs + '" font-weight="500" fill="#111" stroke="#fff" stroke-width="' + (fs * 0.12) + '" stroke-linejoin="round" paint-order="stroke">' +
    lines.map(function (ln, li) { return '<tspan x="0"' + (li ? ' dy="' + (fs * 1.1) + '"' : '') + '>' + esc(ln) + '</tspan>'; }).join('') +
    '</text></svg>';
  var s = Math.round(rPx * 2 + 8);
  return L.divIcon({ className: 'plant-dot', html: html, iconSize: [s, s], iconAnchor: [Math.round(s / 2), Math.round(s / 2)] });
}

// ===== Alle borders op de kaart tonen =====
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function openBorderEditor(borderId) {
  if (drawMode || freehandOn || circleMode) return;
  try { localStorage.setItem('activeTab', 'planten'); } catch (e) {}
  try { localStorage.setItem('openBorderId', borderId); } catch (e) {}
  window.location.href = 'index.html';
}

function renderMap() {
  mapShapeLayer.clearLayers();
  mapMarkerLayer.clearLayers();
  borders.forEach(function (border) {
    if (border.shape && border.shape.length >= 3) {
      var isSel = editVerticesMode && selectedShape && selectedShape.kind === 'border' && selectedShape.obj === border;
      var polyOpts = {
        color: isSel ? '#1565c0' : '#2e7d32',
        weight: isSel ? 5 : 3,
        fillOpacity: 0.15
      };
      if (isSel) polyOpts.dashArray = '8 4';
      var poly = L.polygon(border.shape, polyOpts).addTo(mapShapeLayer);
      var areaTxt = PlantPicker.borderAreaTxt(border.shape);
      poly.bindTooltip(border.name + (areaTxt ? ' \u2014 ' + areaTxt : '') + (editVerticesMode ? ' \u2014 klik om hoekpunten te slepen' : ''));
      poly.on('click', function (ev) {
        if (drawMode || freehandOn || circleMode) { L.DomEvent.stopPropagation(ev); return; }
        if (editVerticesMode) { selectShape('border', border, borders); }
      });
    }
    (border.placed || []).forEach(function (p) {
      if (!p.pos) return;
      var rM = ((PlantPicker.plantSpacingCm ? PlantPicker.plantSpacingCm(p.hoogteTot, p.hoogteVan) : 30) / 2) / 100;
      var mk = L.marker([p.pos.lat, p.pos.lng], { icon: plantMarkerIcon(p, rM) }).addTo(mapMarkerLayer);
      mk.bindTooltip('<strong>' + esc(p.nlNaam || p.latijnseNaam) + '</strong><br><em>' + esc(p.latijnseNaam) + '</em> (' + esc(border.name) + ')');
    });
  });
  renderGardenObjects();
}

// ===== Tuinobjecten (pad, terras, haag, ...) op de kaart =====
// Opgeslagen in localStorage onder 'gardenObjects' als JSON-array:
//   [{ id, type, name, shape: [[lat,lng],...], closed: true/false, color: '#hex',
//      widthM: <breedte in meters, alleen voor lijnen> }]
// - shape met 1 punt    -> stip (bv. boom, vuurplaats, techniekpunt)
// - closed + >=3 punten -> vlak (bv. terras, gazon, moestuin)
// - anders              -> lijn (bv. pad, haag); met widthM schaalt de
//   getekende breedte automatisch mee met het zoomniveau (echte meters)
// - holes (optioneel): array van ringen [[lat,lng],...] die als gat in het
//   vlak worden getekend (bv. een rond pad met gazon in het midden)
function readGardenObjects() {
  try { return JSON.parse(localStorage.getItem('gardenObjects')) || []; }
  catch (e) { return []; }
}

var GARDEN_OBJECT_COLORS = {
  terras: '#8d6e63', pad: '#795548', gazon: '#66bb6a', border: '#2e7d32',
  haag: '#558b2f', moestuin: '#8bc34a', boom: '#33691e', vijver: '#29b6f6',
  zithoek: '#ffb300', zandbak: '#ffca28', speeltoestel: '#f57c00',
  vuurplaats: '#d84315', plantebak: '#6d4c41', techniek: '#546e7a',
  misc: '#607d8b'
};

// Typen die je in de kaart kunt tekenen (labels voor de keuzelijst)
var SHAPE_TYPE_LABELS = {
  border: 'Border (met planten)',
  terras: 'Terras', pad: 'Pad', gazon: 'Gazon', haag: 'Haag',
  moestuin: 'Moestuin', boom: 'Boom', vijver: 'Vijver', zithoek: 'Zithoek',
  zandbak: 'Zandbak', speeltoestel: 'Speeltoestel', vuurplaats: 'Vuurplaats',
  plantebak: 'Plantebak', techniek: 'Techniekpunt', misc: 'Anders'
};
var LINE_TYPES = { pad: true, haag: true }; // lijnvormige typen (open, geen vlak)

function metersPerPixel() {
  // Web Mercator: equator-omtrek / 2^(zoom+8), gecorrigeerd voor breedtegraad
  return 40075016.686 * Math.cos(gardenMap.getCenter().lat * Math.PI / 180) / Math.pow(2, gardenMap.getZoom() + 8);
}

function renderGardenObjects() {
  mapObjectLayer.clearLayers();
  var objs = readGardenObjects();
  objs.forEach(function (obj) {
    if (!obj || !obj.shape || !obj.shape.length) return;
    var color = obj.color || GARDEN_OBJECT_COLORS[obj.type] || GARDEN_OBJECT_COLORS.misc;
    var label = obj.name || obj.type || 'Tuinobject';
    if (obj.materiaal) label += ' \u2014 ' + obj.materiaal;
    var isSel = editVerticesMode && selectedShape && selectedShape.kind === 'object' && selectedShape.obj === obj;
    var layer;
    if (obj.shape.length === 1) {
      layer = L.circleMarker(obj.shape[0], {
        radius: isSel ? 10 : 7, color: isSel ? '#1565c0' : '#333',
        weight: isSel ? 3 : 1, fillColor: color, fillOpacity: 0.9
      }).addTo(mapObjectLayer);
    } else if (obj.closed && obj.shape.length >= 3) {
      var polyOpts = { color: isSel ? '#1565c0' : color, weight: isSel ? 5 : 2, fillOpacity: 0.3, fillRule: 'evenodd' };
      if (isSel) polyOpts.dashArray = '8 4';
      var rings = [obj.shape].concat((obj.holes && obj.holes.length) ? obj.holes : []);
      layer = L.polygon(rings, polyOpts).addTo(mapObjectLayer);
    } else {
      // Lijn: breedte in meters (widthM) als die gegeven is, anders vaste weight
      var weight = obj.weight || 4;
      if (typeof obj.widthM === 'number' && obj.widthM > 0) {
        weight = Math.max(2, Math.round(obj.widthM / metersPerPixel()));
      }
      layer = L.polyline(obj.shape, {
        color: isSel ? '#1565c0' : color,
        weight: isSel ? Math.max(weight, 6) : weight,
        opacity: 0.9, lineCap: 'round',
        dashArray: isSel ? '8 4' : null
      }).addTo(mapObjectLayer);
    }
    layer.bindTooltip(label + (editVerticesMode ? ' \u2014 klik om hoekpunten te slepen' : ''));
    layer.on('click', function (ev) {
      if (drawMode || freehandOn || circleMode) { L.DomEvent.stopPropagation(ev); return; }
      if (editVerticesMode) selectShape('object', obj, objs);
    });
  });
}

// ===== Weergave-schakelaar rechtsbovenin de kaart: Kaart <-> Perceel =====
var parcelSwitchCb = null;
var kadasterCb = null;
var kadasterRow = null;
var viewControl = L.control({ position: 'topright' });
viewControl.onAdd = function () {
  var div = L.DomUtil.create('div');
  div.style.cssText = 'background:#fff;padding:6px 8px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.3);font-size:13px;';
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;';
  var lbMap = document.createElement('span');
  lbMap.textContent = 'Kaart';
  var sw = document.createElement('label');
  sw.className = 'map-switch';
  sw.innerHTML = '<input type="checkbox"><span class="map-switch-slider"></span>';
  parcelSwitchCb = sw.firstChild;
  parcelSwitchCb.addEventListener('change', function (e) { setParcelMode(e.target.checked); });
  var lbParcel = document.createElement('span');
  lbParcel.textContent = 'Perceel';
  row.appendChild(lbMap); row.appendChild(sw); row.appendChild(lbParcel);
  div.appendChild(row);
  kadasterRow = document.createElement('label');
  kadasterRow.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:5px;cursor:pointer;font-size:12px;';
  kadasterCb = document.createElement('input');
  kadasterCb.type = 'checkbox';
  kadasterCb.checked = true;
  kadasterCb.id = 'mapKadasterToggle';
  kadasterCb.addEventListener('change', function (e) {
    if (parcelMode) { e.target.checked = true; return; }
    if (e.target.checked) { kadasterLayer.addTo(gardenMap); } else { gardenMap.removeLayer(kadasterLayer); }
  });
  kadasterRow.appendChild(kadasterCb);
  var kt = document.createElement('span');
  kt.textContent = 'Kadastrale kaart';
  kadasterRow.appendChild(kt);
  div.appendChild(kadasterRow);
  L.DomEvent.disableClickPropagation(div);
  return div;
};
viewControl.addTo(gardenMap);

// Bij in-/uitzoomen de lijnbreedtes en plantenmarkeringen opnieuw tekenen
gardenMap.on('zoomend', function () {
  renderGardenObjects();
  if (!editVerticesMode && !suppressVertexZoomRender) renderMap();
});

// ===== Vormen tekenen: border of tuinobject =====
function updateDrawStatus() {
  var el = document.getElementById('mapDrawStatus');
  if (!el) return;
  var on = drawMode || freehandOn || circleMode;
  el.style.display = on ? '' : 'none';
  el.textContent = on ? 'Bezig met tekenen \u2014 klik hoekpunten, dubbelklik of \u201cKlaar \u2713\u201d om af te sluiten' : '';
}

function setDrawMode(on, kind) {
  drawMode = on;
  drawKind = on ? (kind || 'border') : null;
  drawPoints = [];
  distLayer.clearLayers();
  if (drawPreview) { gardenMap.removeLayer(drawPreview); drawPreview = null; }
  if (on) setEditVertices(false);
  if (drawPreview) { gardenMap.removeLayer(drawPreview); drawPreview = null; }
  document.getElementById('mapDrawBtn').style.display = on ? 'none' : '';
  document.getElementById('mapFinishDrawBtn').style.display = on ? '' : 'none';
  gardenMap.getContainer().style.cursor = on ? 'crosshair' : '';
  if (!on) { circleCenter = null; if (circlePreview) { gardenMap.removeLayer(circlePreview); circlePreview = null; } }
  updateCircleBtn();
  updateDrawStatus();
}

function dedupePoints() {
  // een dubbelklik voegt (bijna) identieke punten toe: die weghalen
  while (drawPoints.length >= 2) {
    var a = drawPoints[drawPoints.length - 1];
    var b = drawPoints[drawPoints.length - 2];
    if (Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7) drawPoints.pop();
    else break;
  }
}

// Popup na het tekenen: kies wat je hebt getekend en geef het een naam
function askShapeNamePopup() {
  return new Promise(function (resolve) {
    var wrap = document.createElement('div');
    wrap.className = 'shape-popup-backdrop';
    var box = document.createElement('div');
    box.className = 'shape-popup';
    var h = document.createElement('h3');
    h.textContent = 'Vorm getekend';
    box.appendChild(h);
    var p = document.createElement('p');
    p.textContent = 'Wat heb je getekend en hoe heet het?';
    box.appendChild(p);
    var sel = document.createElement('select');
    Object.keys(SHAPE_TYPE_LABELS).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = SHAPE_TYPE_LABELS[key];
      sel.appendChild(opt);
    });
    sel.value = drawKind || 'border';
    box.appendChild(sel);
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Naam';
    function defaultName() {
      return sel.value === 'border'
        ? 'Border ' + (borders.length + 1)
        : SHAPE_TYPE_LABELS[sel.value] + ' ' + (readGardenObjects().length + 1);
    }
    inp.value = defaultName();
    sel.addEventListener('change', function () { inp.value = defaultName(); });
    box.appendChild(inp);
    var row = document.createElement('div');
    row.className = 'shape-popup-row';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Annuleren';
    cancel.addEventListener('click', function () { wrap.remove(); resolve(null); });
    var ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-primary';
    ok.textContent = 'Opslaan';
    row.appendChild(cancel); row.appendChild(ok);
    box.appendChild(row);
    wrap.appendChild(box);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) { wrap.remove(); resolve(null); } });
    ok.addEventListener('click', function () {
      var v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      wrap.remove();
      resolve({ kind: sel.value, name: v });
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok.click(); });
    document.body.appendChild(wrap);
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
  });
}

function finishDraw() {
  dedupePoints();
  var kind = drawKind || 'border';
  if (kind === 'hole') {
    if (drawPoints.length < 3) {
      alert('Te weinig punten: teken minimaal 3 punten rondom het gat.');
      return;
    }
    if (!holeTarget) { setDrawMode(false); return; }
    var hArr = readGardenObjects();
    var hObj = null;
    for (var qi = 0; qi < hArr.length; qi++) if (hArr[qi].id === holeTarget.id) hObj = hArr[qi];
    var hId = holeTarget.id;
    holeTarget = null;
    if (!hObj) { setDrawMode(false); return; }
    if (!hObj.holes) hObj.holes = [];
    hObj.holes.push(drawPoints.slice());
    localStorage.setItem('gardenObjects', JSON.stringify(hArr));
    setDrawMode(false);
    if (typeof renderGardenObjectList === 'function') renderGardenObjectList();
    setEditVertices(true);
    selectShape('object', hObj, hArr);
    return;
  }
  // Border of tuinobject (terras, pad, haag, gazon, ...): type + naam in de popup
  askShapeNamePopup().then(function (res) {
    if (!res || res.kind === 'hole') return; // annuleren: tekening blijft staan
    var oKind = res.kind;
    var oMinPts = oKind === 'border' ? 3 : (LINE_TYPES[oKind] ? 2 : 1);
    if (drawPoints.length < oMinPts) {
      alert('Te weinig punten voor een ' + SHAPE_TYPE_LABELS[oKind] + ': klik minimaal ' + oMinPts + ' punt(en) aan.');
      return;
    }
    if (oKind === 'border') {
      var newBorder = {
        id: Date.now().toString(),
        name: res.name,
        placed: [],
        shape: drawPoints.slice()
      };
      borders.push(newBorder);
      setDrawMode(false);
      saveState();
      gardenMap.fitBounds(newBorder.shape, { padding: [30, 30] });
      renderShapeSidebar();
      setEditVertices(true);
      selectShape('border', newBorder, borders);
      return;
    }
    var objs = readGardenObjects();
    objs.push({
      id: 'obj' + Date.now().toString(36),
      type: oKind,
      name: res.name,
      shape: drawPoints.slice(),
      closed: !LINE_TYPES[oKind],
      color: GARDEN_OBJECT_COLORS[oKind] || GARDEN_OBJECT_COLORS.misc,
      weight: 4
    });
    localStorage.setItem('gardenObjects', JSON.stringify(objs));
    var newObj = objs[objs.length - 1];
    setDrawMode(false);
    renderGardenObjects();
    if (typeof renderGardenObjectList === 'function') renderGardenObjectList();
    renderShapeSidebar();
    if (newObj) { setEditVertices(true); selectShape('object', newObj, objs); }
  });
}

gardenMap.on('click', function (e) {
  if (editVerticesMode) return;
  if (!drawMode) return;
  if (circleMode) {
    if (!circleCenter) {
      circleCenter = [e.latlng.lat, e.latlng.lng];
      circlePreview = L.circle(circleCenter, { radius: 1, color: '#1565c0', weight: 2, dashArray: '6 4', fillOpacity: 0.1 }).addTo(gardenMap);
    } else {
      var rM = distanceMeters(circleCenter, [e.latlng.lat, e.latlng.lng]);
      if (rM < 0.2) {
        alert('Tik eerst het middelpunt en daarna een punt op de rand van de cirkel (iets verder van het midden).');
        return;
      }
      var cKind = drawKind || 'border';
      drawPoints = makeCirclePoints(circleCenter, rM, 48);
      circleCenter = null;
      if (circlePreview) { gardenMap.removeLayer(circlePreview); circlePreview = null; }
      finishDraw();
      // na succes: meteen weer cirkel-modus voor het volgende rondje
      if (circleMode && !drawMode && cKind !== 'hole') setDrawMode(true, cKind);
    }
    return;
  }
  if (freehandOn) return; // bij vrij tekenen komt de vorm uit de penstreep
  drawPoints.push([e.latlng.lat, e.latlng.lng]);
  if (drawPreview) gardenMap.removeLayer(drawPreview);
  drawPreview = L.polyline(drawPoints, { color: '#2e7d32', dashArray: '6 4', weight: 3 }).addTo(gardenMap);
  showDistances(drawPoints, false);
});

gardenMap.on('dblclick', function () { if (circleMode) return; if (drawMode && !freehandStroke) finishDraw(); });

// ===== Vrij tekenen met Apple Pencil / vinger (freehand) =====
// Modus aan zetten, type kiezen in de lijst, en de vorm in \u00e9\u00e9n streep
// trekken: pen op het scherm, omtrek volgen, pen los. De streep wordt met
// Douglas-Peucker vereenvoudigd tot hoekpunten en meteen opgeslagen. De pen
// tekent altijd; de vinger tekent alleen als het vinkje "vinger tekent mee"
// aanstaat (zo blijft pannen/zoomen met vingers mogelijk = palmondersteuning).
var freehandStroke = null; // { id, pts, line }
var freehandBtn = null, freehandFingerCb = null, freehandFingerLb = null;

function buildFreehandControls() {
  var drawBtn = document.getElementById('mapDrawBtn');
  if (!drawBtn || freehandBtn) return;
  freehandBtn = document.createElement('button');
  freehandBtn.type = 'button';
  freehandBtn.className = drawBtn.className || '';
  freehandBtn.textContent = '\uD83D\uDCDD Vrij tekenen';
  freehandBtn.addEventListener('click', function () { setFreehand(!freehandOn); });
  drawBtn.parentNode.insertBefore(freehandBtn, drawBtn.nextSibling);
  freehandFingerCb = document.createElement('input');
  freehandFingerCb.type = 'checkbox';
  freehandFingerCb.id = 'mapFreehandFinger';
  freehandFingerCb.style.display = 'none';
  freehandFingerCb.style.marginLeft = '10px';
  freehandFingerCb.style.verticalAlign = 'middle';
  freehandFingerLb = document.createElement('label');
  freehandFingerLb.htmlFor = 'mapFreehandFinger';
  freehandFingerLb.textContent = 'vinger tekent mee';
  freehandFingerLb.style.display = 'none';
  freehandFingerLb.style.fontSize = '13px';
  freehandFingerLb.style.marginLeft = '4px';
  freehandFingerLb.style.verticalAlign = 'middle';
  freehandFingerLb.style.cursor = 'pointer';
  freehandFingerLb.title = 'Aanvinken als je zonder Apple Pencil met een vinger wilt tekenen';
  drawBtn.parentNode.insertBefore(freehandFingerCb, freehandBtn.nextSibling);
  drawBtn.parentNode.insertBefore(freehandFingerLb, freehandFingerCb.nextSibling);
}

function setFreehand(on) {
  freehandOn = on;
  if (freehandBtn) {
    freehandBtn.textContent = on ? '\u2705 Klaar met vrij tekenen' : '\uD83D\uDCDD Vrij tekenen';
    var disp = on ? 'inline' : 'none';
    if (freehandFingerCb) freehandFingerCb.style.display = disp;
    if (freehandFingerLb) freehandFingerLb.style.display = disp;
  }
  updateDrawStatus();
  if (on) {
    if (circleMode) setCircleMode(false);
    holeTarget = null;
    setDrawMode(true, 'border');
  } else {
    cancelStroke();
    setDrawMode(false);
  }
}

function pointerMayDraw(e) {
  if (e.pointerType === 'pen') return true;
  if (e.pointerType === 'touch' && freehandFingerCb && freehandFingerCb.checked) return true;
  return false;
}

function startStroke(e) {
  if (circleMode) return; // bij cirkel teken je met tikken, niet met een streep
  if (!freehandOn || !drawMode) return;
  if (!pointerMayDraw(e) || freehandStroke) return;
  e.preventDefault();
  try { gardenMap.dragging.disable(); } catch (err) {}
  try { gardenMap.touchZoom.disable(); } catch (err) {}
  freehandStroke = { id: e.pointerId, pts: [], line: null };
  addStrokePoint(e);
}

function addStrokePoint(e) {
  if (!freehandStroke || e.pointerId !== freehandStroke.id) return;
  var ll = gardenMap.mouseEventToLatLng(e);
  var pt = [ll.lat, ll.lng];
  var pts = freehandStroke.pts;
  var last = pts[pts.length - 1];
  if (last && Math.abs(last[0] - pt[0]) * 111320 < 0.01 && Math.abs(last[1] - pt[1]) * 111320 < 0.01) return;
  pts.push(pt);
  if (freehandStroke.line) freehandStroke.line.setLatLngs(pts);
  else freehandStroke.line = L.polyline(pts, { color: '#2e7d32', weight: 4, lineCap: 'round' }).addTo(gardenMap);
}

function cancelStroke() {
  if (freehandStroke && freehandStroke.line) gardenMap.removeLayer(freehandStroke.line);
  freehandStroke = null;
  try { gardenMap.dragging.enable(); } catch (err) {}
  try { gardenMap.touchZoom.enable(); } catch (err) {}
}

function pointSegDist(p, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1];
  var len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((p[0] - a[0]) * (p[0] - a[0]) + (p[1] - a[1]) * (p[1] - a[1]));
  var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  if (t < 0) t = 0; if (t > 1) t = 1;
  var x = a[0] + t * dx, y = a[1] + t * dy;
  return Math.sqrt((p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y));
}

// Douglas-Peucker: punten vereenvoudigen tot een tolerantie in meters
function simplifyLatLng(pts, tolM) {
  if (!pts || pts.length < 3) return pts ? pts.slice() : [];
  var lat0 = pts[0][0];
  var cos0 = Math.cos(lat0 * Math.PI / 180);
  var lng0 = pts[0][1];
  var m = pts.map(function (p) {
    return [(p[1] - lng0) * 111320 * cos0, (p[0] - lat0) * 111320];
  });
  var keep = pts.map(function () { return false; });
  keep[0] = true; keep[keep.length - 1] = true;
  (function rdp(a, b) {
    var idx = -1, maxD = 0;
    for (var i = a + 1; i < b; i++) {
      var d = pointSegDist(m[i], m[a], m[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolM && idx > 0) { keep[idx] = true; rdp(a, idx); rdp(idx, b); }
  })(0, m.length - 1);
  var out = [];
  for (var k = 0; k < pts.length; k++) if (keep[k]) out.push(pts[k]);
  return out;
}

function endStroke(e) {
  if (!freehandStroke || e.pointerId !== freehandStroke.id) return;
  var pts = freehandStroke.pts.slice();
  var kind = drawKind || 'border';
  cancelStroke();
  if (!freehandOn || !drawMode) return;
  var tol = Math.max(0.15, metersPerPixel() * 1.5); // fijner dan ~1,5 px is trilling
  drawPoints = simplifyLatLng(pts, tol);
  dedupePoints();
  var minPts = kind === 'hole' ? 3 : 1; // definitieve typekeuze + validatie volgt in de popup
  if (drawPoints.length < minPts) {
    drawPoints = [];
    distLayer.clearLayers();
    alert('Te korte streep: teken de omtrek van de vorm iets groter en probeer opnieuw.');
    return;
  }
  finishDraw();
  // na succes: meteen weer tekenbaar (doorlopend tekenen), behalve bij een gat
  if (freehandOn && !drawMode && kind !== 'hole') {
    setDrawMode(true, kind);
  }
}

var mapContainerEl = gardenMap.getContainer();
mapContainerEl.addEventListener('pointerdown', function (e) { startStroke(e); }, true);
mapContainerEl.addEventListener('pointermove', function (e) { addStrokePoint(e); }, true);
['pointerup', 'pointercancel'].forEach(function (ev) {
  mapContainerEl.addEventListener(ev, function (e) { endStroke(e); }, true);
});
buildFreehandControls();

// ===== Gat in een vlak ("donut"): bv. een rond pad met gazon in het midden =====
var holeBtn = null;
function buildHoleButton() {
  if (holeBtn) return;
  var holeControl = L.control({ position: 'topright' });
  holeControl.onAdd = function () {
    var div = L.DomUtil.create('div');
    div.style.cssText = 'background:#fff;padding:4px 8px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.3);font-size:13px;';
    holeBtn = document.createElement('button');
    holeBtn.type = 'button';
    holeBtn.textContent = '\uD83D\uDD73\uFE0F Gat inmaken';
    holeBtn.style.cssText = 'border:none;background:none;cursor:pointer;font-size:13px;';
    holeBtn.style.display = 'none';
    holeBtn.addEventListener('click', function () {
      if (!selectedShape || selectedShape.kind !== 'object' || !selectedShape.obj.closed) return;
      if (freehandOn) { setFreehand(false); } // eerst modus netjes afsluiten
      holeTarget = selectedShape.obj;
      setDrawMode(true, 'hole');
    });
    div.appendChild(holeBtn);
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  holeControl.addTo(gardenMap);
}
function updateHoleBtn() {
  if (!holeBtn) return;
  var show = editVerticesMode && selectedShape && selectedShape.kind === 'object' &&
    selectedShape.obj.closed && selectedShape.obj.shape.length >= 3;
  holeBtn.style.display = show ? '' : 'none';
}
buildHoleButton();

// ===== Perfecte cirkel tekenen (tik middelpunt, tik rand) =====
var circleBtn = null;
function buildCircleButton() {
  var db = document.getElementById('mapDrawBtn');
  if (!db || circleBtn) return;
  circleBtn = document.createElement('button');
  circleBtn.type = 'button';
  circleBtn.className = db.className || '';
  circleBtn.textContent = '\u2B55 Cirkel';
  circleBtn.title = 'Perfecte cirkel: tik het middelpunt en daarna de rand';
  circleBtn.addEventListener('click', function () { setCircleMode(!circleMode); });
  db.parentNode.insertBefore(circleBtn, db.nextSibling);
}
function setCircleMode(on) {
  circleMode = on;
  if (on) {
    if (freehandOn) setFreehand(false);
    holeTarget = null;
    setDrawMode(true, 'border');
  } else {
    circleCenter = null;
    if (circlePreview) { gardenMap.removeLayer(circlePreview); circlePreview = null; }
    setDrawMode(false);
  }
  updateCircleBtn();
  updateDrawStatus();
}
function updateCircleBtn() {
  if (!circleBtn) return;
  circleBtn.textContent = circleMode ? '\u2705 Klaar met cirkel' : '\u2B55 Cirkel';
}
function makeCirclePoints(center, radiusM, n) {
  var pts = [];
  var latRad = center[0] * Math.PI / 180;
  for (var i = 0; i < n; i++) {
    var a = 2 * Math.PI * i / n;
    var dLat = (radiusM * Math.cos(a)) / 111320;
    var dLng = (radiusM * Math.sin(a)) / (111320 * Math.cos(latRad));
    pts.push([center[0] + dLat, center[1] + dLng]);
  }
  return pts;
}
// Live voorbeeld: cirkel meelaten groeien met de pen/vinger
gardenMap.on('mousemove', function (e) {
  if (circleMode && circleCenter && circlePreview) {
    circlePreview.setRadius(Math.max(0.2, distanceMeters(circleCenter, [e.latlng.lat, e.latlng.lng])));
  }
});
buildCircleButton();

// ===== Hoekpunten van vormen slepen (borders en tuinobjecten) =====
(function () {
  var st = document.createElement('style');
  st.textContent = '.vertex-marker { width: 14px; height: 14px; background: #1565c0; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,.4); cursor: move; }' +
    '.dist-label { background: rgba(255,255,255,.92); color: #1565c0; font-size: 11px; font-weight: 600; padding: 1px 5px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.35); white-space: nowrap; transform: translate(-50%, -50%); pointer-events: none; }' +
    '.dist-total { color: #2e7d32; font-weight: 700; }' +
    '.vertex-add { width: 18px; height: 18px; background: rgba(255,255,255,.95); color: #1565c0; border: 2px solid #1565c0; border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,.4); cursor: copy; font-size: 14px; font-weight: 700; line-height: 14px; text-align: center; font-family: sans-serif; }' +
    '.vertex-add:hover { background: #1565c0; color: #fff; }' +
    '.vertex-hole { background: #ff9800; }' +
    '.vertex-hole-add { color: #ef6c00; border-color: #ef6c00; }' +
    '.freehand-active { cursor: crosshair !important; }' +
    '@media (pointer: coarse) { .vertex-marker { width: 22px !important; height: 22px !important; } .vertex-add { width: 26px !important; height: 26px !important; line-height: 22px !important; font-size: 18px !important; } }';
  document.head.appendChild(st);
})();

// ===== Sidebar met vormen (links van de kaart) =====
// Lijst met borders + tuinobjecten; klik = meteen hoekpunten slepen tot je
// de vorm weer uitklikt. De losse knop "Hoekpunten slepen" is vervallen.
function buildShapeSidebar() {
  var host = document.getElementById('mapShapeSidebar');
  var listEl = document.getElementById('mapShapeSidebarList');
  if (!host || !listEl) return;
  listEl.addEventListener('click', function (e) {
    var del = e.target.closest ? e.target.closest('[data-shapedel]') : null;
    if (del) {
      var dKind = del.getAttribute('data-shapekind');
      var dId = del.getAttribute('data-shapeid');
      if (!confirm('Deze vorm verwijderen?')) return;
      if (dKind === 'border') {
        var bi = borders.findIndex(function (b) { return b.id === dId; });
        if (bi >= 0) { borders.splice(bi, 1); saveState(); renderShapeSidebar(); }
      } else {
        var objs = readGardenObjects().filter(function (o) { return o.id !== dId; });
        localStorage.setItem('gardenObjects', JSON.stringify(objs));
        renderGardenObjects();
        renderShapeSidebar();
      }
      return;
    }
    var btn = e.target.closest ? e.target.closest('[data-shapebtn]') : null;
    if (!btn) return;
    var kind = btn.getAttribute('data-shapekind');
    var id = btn.getAttribute('data-shapeid');
    var arr = kind === 'border' ? borders : readGardenObjects();
    var obj = null;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { obj = arr[i]; break; }
    if (!obj) return;
    var isActive = editVerticesMode && selectedShape && selectedShape.obj === obj;
    if (isActive) { setEditVertices(false); }
    else { setEditVertices(true); selectShape(kind, obj, arr); }
  });
}
buildShapeSidebar();

function renderShapeSidebar() {
  var listEl = document.getElementById('mapShapeSidebarList');
  if (!listEl) return;
  var activeObj = editVerticesMode && selectedShape ? selectedShape.obj : null;
  var html = '';
  borders.forEach(function (b) {
    if (!b.shape || b.shape.length < 3) return;
    var sel = activeObj === b;
    html += '<div class="shape-row"><button type="button" data-shapebtn="1" data-shapekind="border" data-shapeid="' + esc(b.id) + '" class="pv-side-btn' + (sel ? ' active' : '') + '" title="' + esc(b.name) + '">\uD83C\uDF3F ' + esc(b.name) + (sel ? ' \u2715' : '') + '</button>' +
      '<button type="button" data-shapedel="1" data-shapekind="border" data-shapeid="' + esc(b.id) + '" class="shape-del" title="Vorm verwijderen">\u2715</button></div>';
  });
  var objs = readGardenObjects();
  if (borders.length && objs.length) html += '<div class="pv-side-group">Tuinobjecten</div>';
  objs.forEach(function (o) {
    if (!o.shape || !o.shape.length) return;
    var sel = activeObj === o;
    var color = o.color || GARDEN_OBJECT_COLORS[o.type] || GARDEN_OBJECT_COLORS.misc;
    html += '<div class="shape-row"><button type="button" data-shapebtn="1" data-shapekind="object" data-shapeid="' + esc(o.id) + '" class="pv-side-btn' + (sel ? ' active' : '') + '" style="' + (sel ? '' : 'border-left:4px solid ' + color + ';') + '" title="' + esc(o.name || o.type) + '">' + esc(o.name || o.type) + (sel ? ' \u2715' : '') + '</button>' +
      '<button type="button" data-shapedel="1" data-shapekind="object" data-shapeid="' + esc(o.id) + '" class="shape-del" title="Vorm verwijderen">\u2715</button></div>';
  });
  if (!html) html = '<div class="pv-side-group" style="font-weight:400;color:var(--light-text);">Nog geen vormen \u2014 teken er \u00E9\u00E9n met "Vorm intekenen".</div>';
  listEl.innerHTML = html;
}

function setEditVertices(on) {
  editVerticesMode = on;
  if (on) setDrawMode(false);
  if (!on) {
    selectedShape = null;
    vertexLayer.clearLayers();
    distLayer.clearLayers();
  }
  gardenMap.getContainer().style.cursor = on ? 'pointer' : '';
  updateHoleBtn();
  renderMap();
  renderShapeSidebar();
}

function selectShape(kind, obj, arr) {
  selectedShape = { kind: kind, obj: obj, arr: arr };
  vertexLayer.clearLayers();
  var rings = [{ pts: obj.shape, hole: -1 }];
  if (obj.holes) obj.holes.forEach(function (h, hi) { rings.push({ pts: h, hole: hi }); });
  rings.forEach(function (ring) {
    ring.pts.forEach(function (pt, i) {
      var mk = L.marker(pt, {
        draggable: true,
        icon: L.divIcon({ className: ring.hole < 0 ? 'vertex-marker' : 'vertex-marker vertex-hole', iconSize: [14, 14] })
      }).addTo(vertexLayer);
      mk.bindTooltip((ring.hole < 0 ? 'hoekpunt ' : 'gat ' + (ring.hole + 1) + ', punt ') + (i + 1) + ' \u2014 sleep om te verplaatsen, rechtsklik om te verwijderen');
      mk.on('drag', function (e) {
        var ll = e.target.getLatLng();
        ring.pts[i] = [ll.lat, ll.lng];
        if (kind === 'border') renderMap();
        else renderGardenObjects();
        showDistances(obj.shape, shapeIsClosed(kind, obj));
        suppressVertexZoomRender = true;
      });
      mk.on('dragend', function () {
        suppressVertexZoomRender = false;
        saveShapeEdit();
        if (editVerticesMode && selectedShape) selectShape(selectedShape.kind, selectedShape.obj, selectedShape.arr);
      });
      mk.on('contextmenu', function () {
        var minPts = ring.hole < 0 ? (kind === 'border' ? 3 : (LINE_TYPES[obj.type] ? 2 : 1)) : 3;
        if (ring.hole >= 0 && ring.pts.length <= minPts) {
          if (confirm('Dit gat verwijderen?')) {
            obj.holes.splice(ring.hole, 1);
            saveShapeEdit();
            selectShape(kind, obj, arr);
          }
          return;
        }
        if (ring.pts.length <= minPts) {
          alert('Deze vorm heeft te weinig punten om er een te verwijderen.');
          return;
        }
        ring.pts.splice(i, 1);
        saveShapeEdit();
        selectShape(kind, obj, arr);
      });
    });
    // Midden van elk segment: klik = hoekpunt toevoegen
    var closed = ring.hole < 0 ? shapeIsClosed(kind, obj) : true;
    var nSeg = closed ? ring.pts.length : ring.pts.length - 1;
    for (var j = 0; j < nSeg; j++) {
      (function (segIdx) {
        var a = ring.pts[segIdx], b = ring.pts[(segIdx + 1) % ring.pts.length];
        var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        var pa2 = gardenMap.latLngToLayerPoint(a), pb2 = gardenMap.latLngToLayerPoint(b);
        var segPx = Math.sqrt(Math.pow(pb2.x - pa2.x, 2) + Math.pow(pb2.y - pa2.y, 2));
        if (segPx < 56) return;
        var am = L.marker(mid, {
          icon: L.divIcon({ className: ring.hole < 0 ? 'vertex-add' : 'vertex-add vertex-hole-add', iconSize: [18, 18], html: '+' })
        }).addTo(vertexLayer);
        am.bindTooltip('hoekpunt toevoegen');
        am.on('click', function () {
          ring.pts.splice(segIdx + 1, 0, mid.slice());
          saveShapeEdit();
          selectShape(kind, obj, arr);
        });
      })(j);
    }
  });
  showDistances(obj.shape, shapeIsClosed(kind, obj));
  updateHoleBtn();
  renderMap();
  renderShapeSidebar();
}

function saveShapeEdit() {
  if (!selectedShape) return;
  if (selectedShape.kind === 'border') {
    saveState(); // opgeslagen + kaart herrendert (wrapped hieronder)
  } else {
    localStorage.setItem('gardenObjects', JSON.stringify(selectedShape.arr));
    renderGardenObjects();
  }
  renderShapeSidebar();
}

document.getElementById('mapDrawBtn').addEventListener('click', function () {
  setDrawMode(true, 'border');
});
document.getElementById('mapFinishDrawBtn').addEventListener('click', finishDraw);
var suppressVertexZoomRender = false;
gardenMap.on('zoomend', function () {
  if (suppressVertexZoomRender) return;
  if (editVerticesMode && selectedShape) {
    selectShape(selectedShape.kind, selectedShape.obj, selectedShape.arr);
  }
});
// Synchroniseer kaart met planner-wijzigingen
var _origSaveState = saveState;
saveState = function () { _origSaveState(); renderMap(); renderShapeSidebar(); };

renderMap();
renderShapeSidebar();

// ===== Perceel-view: kadastrale grens + bebouwing als vector (PDOK BRK WFS) =====
// Zet de gebruiker de schuif op "Perceel", dan verdwijnt de tegelondergrond
// (die is op hoog zoomniveau wazig) en wordt het perceel van het gekozen
// adres + de bebouwing (panden, uit de BGT) als echte vectoren getekend:
// haarscherp tot zoom 28. De perceelgegevens (kadastrale aanduiding en
// oppervlakte) staan in een label net buiten de perceelgrens, zodat je er
// nooit een vorm overheen tekent.
var parcelLayer = L.layerGroup().addTo(gardenMap);
var parcelBuildLayer = L.layerGroup().addTo(gardenMap);
var parcelLabelLayer = L.layerGroup().addTo(gardenMap);
var parcelMode = false;
var parcelFetching = false;
var parcelGeom = null;   // GeoJSON-geometry van het eigen perceel
var parcelInfo = null;   // { label, opp }

function parcelStyle(sel) {
  return sel
    ? { color: '#1565c0', weight: 4, fillOpacity: 0.06, dashArray: '8 4' }
    : { color: '#6d4c41', weight: 2.5, fillOpacity: 0.05 };
}

function buildStyle(sel) {
  return sel
    ? { color: '#b71c1c', weight: 3, fillColor: '#7f0000', fillOpacity: 0.25, dashArray: '6 4' }
    : { color: '#4e342e', weight: 2, fillColor: '#3e2723', fillOpacity: 0.18 };
}

function ringToLatLngs(ring) {
  // GeoJSON CRS84: [lng, lat] -> Leaflet [lat, lng]
  return ring.map(function (p) { return [p[1], p[0]]; });
}

function geomRings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') {
    var out = [];
    geom.coordinates.forEach(function (poly) { out = out.concat(poly); });
    return out;
  }
  return [];
}

function gardenAddressPos() {
  try {
    var a = JSON.parse(localStorage.getItem('gardenAddress'));
    if (a && typeof a.lat === 'number' && typeof a.lng === 'number') return a;
  } catch (e) {}
  return null;
}

function updateParcelLabel() {
  parcelLabelLayer.clearLayers();
  if (!parcelGeom || !parcelInfo) return;
  var rings = geomRings(parcelGeom).map(ringToLatLngs);
  if (!rings.length) return;
  var bounds = L.latLngBounds(rings[0]);
  rings.forEach(function (r) { bounds.extend(L.latLngBounds(r)); });
  var NE = bounds.getNorthEast();
  L.marker([NE.lat, NE.lng], {
    interactive: false,
    icon: L.divIcon({
      className: 'dist-label parcel-info-label',
      iconSize: [0, 0],
      html: '\uD83D\uDCCD ' + esc(parcelInfo.label)
    })
  }).addTo(parcelLabelLayer);
}

function setParcelMode(on) {
  parcelMode = on;
  if (parcelSwitchCb) parcelSwitchCb.checked = on;
  if (kadasterRow) kadasterRow.style.display = on ? 'none' : '';
  parcelLayer.clearLayers();
  parcelBuildLayer.clearLayers();
  parcelLabelLayer.clearLayers();
  parcelGeom = null;
  parcelInfo = null;
  gardenMap.getContainer().style.background = on ? '#e8f5e9' : '';
  if (on) {
    [osmLayer, kadasterLayer].forEach(function (lyr) {
      if (gardenMap.hasLayer(lyr)) gardenMap.removeLayer(lyr);
    });
    var addr = gardenAddressPos();
    if (!addr) {
      alert('Kies eerst een adres: het perceel wordt opgezocht bij het adres van je tuin.');
      setParcelMode(false);
      return;
    }
    var d = 0.002; // ~200 m rond het adres
    var bbox = [addr.lng - d, addr.lat - d, addr.lng + d, addr.lat + d];
    fetchParcels(bbox, addr);
    fetchBuildings(bbox);
  } else {
    osmLayer.addTo(gardenMap);
    if (kadasterCb && kadasterCb.checked) kadasterLayer.addTo(gardenMap);
  }
}

function wfsUrl(typeName, bbox) {
  return 'https://service.pdok.nl/kadaster/brk-kadastrale-kaart/wfs/v5_0?service=WFS&version=2.0.0' +
    '&request=GetFeature&typeNames=' + typeName +
    '&outputFormat=application/json%3B%20subtype%3Dgeojson' +
    '&srsName=urn:ogc:def:crs:EPSG::4326' +
    '&bbox=' + bbox.join(',') + ',urn:ogc:def:crs:EPSG::CRS84';
}

// Geeft true als het punt (van het adres) binnen de buitenring ligt
function ringContains(ring, lat, lng) {
  var pts = ringToLatLngs(ring);
  var inside = false;
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    var xi = pts[i][1], yi = pts[i][0], xj = pts[j][1], yj = pts[j][0];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function fetchParcels(bbox, addr) {
  parcelFetching = true;
  fetch(wfsUrl('kadastralekaart:Perceel', bbox)).then(function (r) { return r.json(); }).then(function (fc) {
    var own = null;
    (fc.features || []).forEach(function (f) {
      if (!own && ringContains(f.geometry.coordinates[0], addr.lat, addr.lng)) own = f;
    });
    if (!own) {
      alert('Geen kadastraal perceel gevonden op dit adres.');
      setParcelMode(false);
      return;
    }
    var props = own.properties || {};
    parcelGeom = own.geometry;
    parcelInfo = {
      label: (props.kadastraleGemeenteWaarde || '') + ' ' + (props.sectie || '') + ' ' +
        (props.perceelnummer || '') + (props.kadastraleGrootteWaarde ? ' \u2014 ' + props.kadastraleGrootteWaarde + ' m\u00B2' : '')
    };
    var rings = geomRings(parcelGeom).map(ringToLatLngs);
    L.polygon(rings, parcelStyle(true)).addTo(parcelLayer);
    gardenMap.fitBounds(L.latLngBounds(rings[0]), { padding: [70, 70], maxZoom: 24 });
    updateParcelLabel();
  }).catch(function () {
    alert('Perceelgegevens konden niet worden opgehaald (PDOK onbereikbaar?).');
    setParcelMode(false);
  });
}

function fetchBuildings(bbox) {
  fetch(wfsUrl('kadastralekaart:Bebouwing', bbox)).then(function (r) { return r.json(); }).then(function (fc) {
    (fc.features || []).forEach(function (f) {
      var rings = geomRings(f.geometry);
      if (!rings.length) return;
      L.polygon(rings.map(ringToLatLngs), buildStyle(false)).addTo(parcelBuildLayer);
    });
    // panden binnen het eigen perceel markeren als "niet-tuin"
    if (parcelGeom) {
      var bounds = L.latLngBounds(ringToLatLngs(parcelGeom.coordinates[0]));
      parcelBuildLayer.eachLayer(function (lyr) {
        if (!lyr.getBounds) return;
        var b = lyr.getBounds();
        if (bounds.contains(b.getSouthWest()) && bounds.contains(b.getNorthEast())) {
          lyr.setStyle(buildStyle(true));
        }
      });
    }
  }).catch(function () {});
}
