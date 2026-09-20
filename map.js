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
      var polyOpts = { color: isSel ? '#1565c0' : color, weight: isSel ? 5 : 2, fillOpacity: 0.3 };
      if (isSel) polyOpts.dashArray = '8 4';
      layer = L.polygon(obj.shape, polyOpts).addTo(mapObjectLayer);
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
  drawPoints.push([e.latlng.lat, e.latlng.lng]);
  if (drawPreview) gardenMap.removeLayer(drawPreview);
  drawPreview = L.polyline(drawPoints, { color: '#2e7d32', dashArray: '6 4', weight: 3 }).addTo(gardenMap);
  showDistances(drawPoints, false);
});

gardenMap.on('dblclick', function () { if (drawMode) finishDraw(); });

// ===== Hoekpunten van vormen slepen (borders en tuinobjecten) =====
(function () {
  var st = document.createElement('style');
  st.textContent = '.vertex-marker { width: 14px; height: 14px; background: #1565c0; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,.4); cursor: move; }' +
    '.dist-label { background: rgba(255,255,255,.92); color: #1565c0; font-size: 11px; font-weight: 600; padding: 1px 5px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.35); white-space: nowrap; transform: translate(-50%, -50%); pointer-events: none; }' +
    '.dist-total { color: #2e7d32; font-weight: 700; }';
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
  renderMap();
}

function selectShape(kind, obj, arr) {
  selectedShape = { kind: kind, obj: obj, arr: arr };
  vertexLayer.clearLayers();
  obj.shape.forEach(function (pt, i) {
    var mk = L.marker(pt, {
      draggable: true,
      icon: L.divIcon({ className: 'vertex-marker', iconSize: [14, 14] })
    }).addTo(vertexLayer);
    mk.bindTooltip('hoekpunt ' + (i + 1) + ' \u2014 sleep om te verplaatsen, rechtsklik om te verwijderen');
    mk.on('drag', function (e) {
      var ll = e.target.getLatLng();
      obj.shape[i] = [ll.lat, ll.lng];
      if (kind === 'border') renderMap();
      else renderGardenObjects();
      showDistances(obj.shape, shapeIsClosed(kind, obj));
    });
    mk.on('dragend', function () { saveShapeEdit(); });
    mk.on('contextmenu', function () {
      var minPts = kind === 'border' ? 3 : (LINE_TYPES[obj.type] ? 2 : 1);
      if (obj.shape.length <= minPts) {
        alert('Deze vorm heeft te weinig punten om er een te verwijderen.');
        return;
      }
      obj.shape.splice(i, 1);
      saveShapeEdit();
      selectShape(kind, obj, arr);
    });
  });
  showDistances(obj.shape, shapeIsClosed(kind, obj));
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
