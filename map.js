// Kaart- en adresfunctionaliteit Tuinplantplanner (Leaflet + PDOK)
// Nieuwe flow: vormen (borders én tuinobjecten zoals terras, pad, haag) teken
// je direct op de kaart; planten plaatsen gebeurt op de aparte border-editor
// (border.html). Hoekpunten van getekende vormen kun je verslepen.

var drawMode = false;
var drawKind = null; // 'border' of een tuinobject-type (terras, pad, ...)
var drawPoints = [];
var drawPreview = null;

var editVerticesMode = false; // hoekpunten-sleepmodus
var selectedShape = null;     // { kind: 'border'|'object', obj, arr }

var savedMapView = null;
try { savedMapView = JSON.parse(localStorage.getItem('mapView')); } catch (e) {}

var gardenMap = L.map('gardenMap', { maxZoom: 21 }).setView(
  savedMapView ? [savedMapView.lat, savedMapView.lng] : [52.1, 5.3],
  savedMapView ? savedMapView.zoom : 12
);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 21, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(gardenMap);
// Kadastrale kaart als WMTS-tegels (betrouwbaar, ook op hoog zoomniveau)
var kadasterLayer = L.tileLayer('https://service.pdok.nl/kadaster/brk-kadastralekaart/wmts/v5_0/Kadastralekaart/EPSG:3857/{z}/{x}/{y}.png', {
  maxZoom: 21, maxNativeZoom: 19, opacity: 0.9, minZoom: 14,
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
    L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], {
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

// ===== Alle borders op de kaart tonen =====
function openBorderEditor(borderId) {
  window.location.href = 'border.html?id=' + encodeURIComponent(borderId);
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
      poly.bindTooltip(border.name + (editVerticesMode ? ' \u2014 klik om hoekpunten te slepen' : ' \u2014 klik om te bewerken'));
      poly.on('click', function () {
        if (editVerticesMode) { selectShape('border', border, borders); }
        else { openBorderEditor(border.id); }
      });
    }
    (border.plants || []).forEach(function (p) {
      if (!p.pos) return;
      var marker = L.circleMarker([p.pos.lat, p.pos.lng], {
        radius: 8, color: '#333', weight: 1,
        fillColor: getColorHex(p.kleur) || '#8bc34a', fillOpacity: 0.95
      }).addTo(mapMarkerLayer);
      marker.bindTooltip((p.nlNaam || p.latijnseNaam) + ' (' + border.name + ')');
      marker.on('click', function () { openBorderEditor(border.id); });
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

// Keuzelijst vullen
(function () {
  var sel = document.getElementById('mapDrawType');
  if (!sel) return;
  Object.keys(SHAPE_TYPE_LABELS).forEach(function (key) {
    var opt = document.createElement('option');
    opt.value = key;
    opt.textContent = SHAPE_TYPE_LABELS[key];
    sel.appendChild(opt);
  });
})();

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
    layer.on('click', function () {
      if (editVerticesMode) selectShape('object', obj, objs);
    });
  });
}

// Toggle rechtsboven op de kaart om het ontwerp aan/uit te zetten
var objectsControl = L.control({ position: 'topright' });
objectsControl.onAdd = function () {
  var div = L.DomUtil.create('div');
  div.style.background = '#fff';
  div.style.padding = '4px 8px';
  div.style.borderRadius = '4px';
  div.style.boxShadow = '0 1px 4px rgba(0,0,0,.3)';
  div.style.fontSize = '13px';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.gap = '4px';
  var cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = true;
  cb.id = 'mapObjectsToggle';
  cb.style.cursor = 'pointer';
  var lb = document.createElement('label');
  lb.htmlFor = 'mapObjectsToggle';
  lb.style.cursor = 'pointer';
  lb.textContent = '\uD83D\uDCD0 Ontwerp';
  cb.addEventListener('change', function (e) {
    if (e.target.checked) { mapObjectLayer.addTo(gardenMap); }
    else { gardenMap.removeLayer(mapObjectLayer); }
  });
  div.appendChild(cb);
  div.appendChild(lb);
  L.DomEvent.disableClickPropagation(div);
  return div;
};
objectsControl.addTo(gardenMap);

// Bij in-/uitzoomen de lijnbreedtes opnieuw berekenen (weight is in pixels)
gardenMap.on('zoomend', renderGardenObjects);

// ===== Vormen tekenen: border of tuinobject =====
function setDrawMode(on, kind) {
  drawMode = on;
  drawKind = on ? (kind || 'border') : null;
  drawPoints = [];
  distLayer.clearLayers();
  if (drawPreview) { gardenMap.removeLayer(drawPreview); drawPreview = null; }
  if (on) setEditVertices(false);
  document.getElementById('mapDrawBtn').style.display = on ? 'none' : '';
  document.getElementById('mapFinishDrawBtn').style.display = on ? '' : 'none';
  gardenMap.getContainer().style.cursor = on ? 'crosshair' : '';
  if (!on) { circleCenter = null; if (circlePreview) { gardenMap.removeLayer(circlePreview); circlePreview = null; } }
  updateCircleBtn();
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

function finishDraw() {
  dedupePoints();
  var kind = drawKind || 'border';
  if (kind === 'border') {
    if (drawPoints.length < 3) {
      alert('Te weinig punten: klik minimaal 3 hoekpunten van de border aan.');
      return;
    }
    var bName = prompt('Naam voor deze border:', 'Border ' + (borders.length + 1));
    if (!bName) return; // annuleren: tekening blijft staan om opnieuw te kunnen afsluiten
    var newBorder = {
      id: Date.now().toString(),
      name: bName,
      plants: [],
      shape: drawPoints.slice()
    };
    borders.push(newBorder);
    setDrawMode(false);
    saveState();
    gardenMap.fitBounds(newBorder.shape, { padding: [30, 30] });
    if (confirm('Border "' + bName + '" is aangemaakt!\n\nNu planten toevoegen en plaatsen in de border-editor?')) {
      openBorderEditor(newBorder.id);
    }
    return;
  }
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
  // Tuinobject (terras, pad, haag, gazon, ...)
  var minPts = LINE_TYPES[kind] ? 2 : 1;
  if (drawPoints.length < minPts) {
    alert('Te weinig punten: klik minimaal ' + minPts + ' punt(en) aan.');
    return;
  }
  var oName = prompt('Naam voor dit object:', SHAPE_TYPE_LABELS[kind]);
  if (!oName) return;
  var objs = readGardenObjects();
  objs.push({
    id: 'obj' + Date.now().toString(36),
    type: kind,
    name: oName,
    shape: drawPoints.slice(),
    closed: !LINE_TYPES[kind],
    color: GARDEN_OBJECT_COLORS[kind] || GARDEN_OBJECT_COLORS.misc,
    weight: 4
  });
  localStorage.setItem('gardenObjects', JSON.stringify(objs));
  setDrawMode(false);
  renderGardenObjects();
  if (typeof renderGardenObjectList === 'function') renderGardenObjectList();
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
  if (on) {
    if (circleMode) setCircleMode(false);
    var sel = document.getElementById('mapDrawType');
    holeTarget = null;
    setDrawMode(true, sel ? sel.value : 'border');
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
  var minPts = kind === 'hole' ? 3 : (LINE_TYPES[kind] ? 2 : (kind === 'border' ? 3 : 1));
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
  var eb = document.getElementById('mapEditShapeBtn');
  if (!eb || holeBtn) return;
  holeBtn = document.createElement('button');
  holeBtn.type = 'button';
  holeBtn.className = eb.className || '';
  holeBtn.textContent = '\uD83D\uDD73\uFE0F Gat inmaken';
  holeBtn.style.display = 'none';
  holeBtn.addEventListener('click', function () {
    if (!selectedShape || selectedShape.kind !== 'object' || !selectedShape.obj.closed) return;
    if (freehandOn) { setFreehand(false); } // eerst modus netjes afsluiten
    holeTarget = selectedShape.obj;
    setDrawMode(true, 'hole');
  });
  eb.parentNode.insertBefore(holeBtn, eb.nextSibling);
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
    var sel = document.getElementById('mapDrawType');
    setDrawMode(true, sel ? sel.value : 'border');
  } else {
    circleCenter = null;
    if (circlePreview) { gardenMap.removeLayer(circlePreview); circlePreview = null; }
    setDrawMode(false);
  }
  updateCircleBtn();
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

function setEditVertices(on) {
  editVerticesMode = on;
  if (on) setDrawMode(false);
  if (!on) {
    selectedShape = null;
    vertexLayer.clearLayers();
    distLayer.clearLayers();
  }
  var btn = document.getElementById('mapEditShapeBtn');
  if (btn) btn.textContent = on ? '\u2705 Klaar met slepen' : '\uD83D\uDCB0 Hoekpunten slepen';
  gardenMap.getContainer().style.cursor = on ? 'pointer' : '';
  updateHoleBtn();
  renderMap();
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
      });
      mk.on('dragend', function () { saveShapeEdit(); });
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
}

function saveShapeEdit() {
  if (!selectedShape) return;
  if (selectedShape.kind === 'border') {
    saveState(); // opgeslagen + kaart herrendert (wrapped hieronder)
  } else {
    localStorage.setItem('gardenObjects', JSON.stringify(selectedShape.arr));
    renderGardenObjects();
  }
}

document.getElementById('mapDrawBtn').addEventListener('click', function () {
  var sel = document.getElementById('mapDrawType');
  setDrawMode(true, sel ? sel.value : 'border');
});
document.getElementById('mapFinishDrawBtn').addEventListener('click', finishDraw);
document.getElementById('mapEditShapeBtn').addEventListener('click', function () {
  setEditVertices(!editVerticesMode);
});
document.getElementById('mapLocateBtn').addEventListener('click', function () {
  if (!navigator.geolocation) { alert('Geolocatie wordt niet ondersteund.'); return; }
  navigator.geolocation.getCurrentPosition(function (pos) {
    gardenMap.setView([pos.coords.latitude, pos.coords.longitude], 19);
  }, function () { alert('Kon locatie niet bepalen.'); });
});
document.getElementById('mapKadasterToggle').addEventListener('change', function (e) {
  if (e.target.checked) { kadasterLayer.addTo(gardenMap); } else { gardenMap.removeLayer(kadasterLayer); }
});

// Synchroniseer kaart met planner-wijzigingen
var _origSaveState = saveState;
saveState = function () { _origSaveState(); renderMap(); };

renderMap();

// Backup-module (export/import van plannerdata als JSON) laden
(function () {
  var s = document.createElement('script');
  s.src = 'backup.js';
  document.head.appendChild(s);
})();
