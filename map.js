// Kaart- en adresfunctionaliteit Tuinplantplanner (Leaflet + PDOK)
// Nieuwe flow: border intekenen op de kaart maakt DIRECT een border-object aan,
// bewerken en planten plaatsen gebeurt op de aparte border-editor (border.html).

var drawMode = false;
var drawPoints = [];
var drawPreview = null;

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
var mapMarkerLayer = L.layerGroup().addTo(gardenMap);

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
  document.getElementById('addressTitle').textContent = '📍 ' + addr;
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
    btn.disabled = false; btn.textContent = 'Naar mijn tuin →';
    applyAddress(addr, lat, lng, true);
  }, function () {
    btn.disabled = false; btn.textContent = 'Naar mijn tuin →';
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
    document.getElementById('addressTitle').textContent = '📍 ' + saved.addr;
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
      var poly = L.polygon(border.shape, {
        color: '#2e7d32', weight: 3, fillOpacity: 0.15
      }).addTo(mapShapeLayer);
      poly.bindTooltip(border.name + ' — klik om te bewerken');
      poly.on('click', function () { openBorderEditor(border.id); });
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

// ===== Tuinobjecten uit het ontwerp (pad, terras, haag, ...) op de kaart =====
// Opgeslagen in localStorage onder 'gardenObjects' als JSON-array:
//   [{ id, type, name, shape: [[lat,lng],...], closed: true/false, color: '#hex' }]
// - shape met 1 punt  -> stip (bv. boom, vuurplaats, techniekpunt)
// - closed + >=3 punten -> vlak (bv. terras, gazon, moestuin)
// - anders -> lijn (bv. pad, haag)
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

function renderGardenObjects() {
  readGardenObjects().forEach(function (obj) {
    if (!obj || !obj.shape || !obj.shape.length) return;
    var color = obj.color || GARDEN_OBJECT_COLORS[obj.type] || GARDEN_OBJECT_COLORS.misc;
    var layer;
    if (obj.shape.length === 1) {
      layer = L.circleMarker(obj.shape[0], {
        radius: 7, color: '#333', weight: 1, fillColor: color, fillOpacity: 0.9
      }).addTo(mapShapeLayer);
    } else if (obj.closed && obj.shape.length >= 3) {
      layer = L.polygon(obj.shape, {
        color: color, weight: 2, fillOpacity: 0.3
      }).addTo(mapShapeLayer);
    } else {
      layer = L.polyline(obj.shape, {
        color: color, weight: obj.weight || 4, opacity: 0.9
      }).addTo(mapShapeLayer);
    }
    layer.bindTooltip(obj.name || obj.type || 'Tuinobject');
  });
}

// ===== Border intekenen: maakt direct een nieuw border-object aan =====
function setDrawMode(on) {
  drawMode = on;
  drawPoints = [];
  if (drawPreview) { gardenMap.removeLayer(drawPreview); drawPreview = null; }
  document.getElementById('mapDrawBtn').style.display = on ? 'none' : '';
  document.getElementById('mapFinishDrawBtn').style.display = on ? '' : 'none';
  gardenMap.getContainer().style.cursor = on ? 'crosshair' : '';
}

function finishDraw() {
  if (drawPoints.length < 3) {
    alert('Te weinig punten: klik minimaal 3 hoekpunten van de border aan.');
    return;
  }
  var name = prompt('Naam voor deze border:', 'Border ' + (borders.length + 1));
  if (!name) return; // annuleren: tekening blijft staan om opnieuw te kunnen afsluiten
  var newBorder = {
    id: Date.now().toString(),
    name: name,
    plants: [],
    shape: drawPoints.slice()
  };
  borders.push(newBorder);
  setDrawMode(false);
  saveState();
  renderMap();
  gardenMap.fitBounds(newBorder.shape, { padding: [30, 30] });
  if (confirm('Border "' + name + '" is aangemaakt!\n\nNu planten toevoegen en plaatsen in de border-editor?')) {
    openBorderEditor(newBorder.id);
  }
}

gardenMap.on('click', function (e) {
  if (!drawMode) return;
  drawPoints.push([e.latlng.lat, e.latlng.lng]);
  if (drawPreview) gardenMap.removeLayer(drawPreview);
  drawPreview = L.polyline(drawPoints, { color: '#2e7d32', dashArray: '6 4', weight: 3 }).addTo(gardenMap);
});

gardenMap.on('dblclick', function () { if (drawMode) finishDraw(); });

document.getElementById('mapDrawBtn').addEventListener('click', function () {
  setDrawMode(true);
});
document.getElementById('mapFinishDrawBtn').addEventListener('click', finishDraw);
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
