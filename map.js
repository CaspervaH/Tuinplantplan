// Kaart- en adresfunctionaliteit Tuinplantplanner (Leaflet + PDOK)
var mapBorderId = null;
var drawMode = false;
var drawPoints = [];
var drawPreview = null;

var savedMapView = null;
try { savedMapView = JSON.parse(localStorage.getItem('mapView')); } catch (e) {}

var gardenMap = L.map('gardenMap').setView(
  savedMapView ? [savedMapView.lat, savedMapView.lng] : [52.1, 5.3],
  savedMapView ? savedMapView.zoom : 12
);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(gardenMap);
var kadasterLayer = L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers: 'standaard', format: 'image/png', transparent: true, opacity: 0.8, minZoom: 15
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
  document.getElementById('addressTitle').textContent = '\uD83D\uDCCD ' + addr;
  if (zoomTo) gardenMap.setView([lat, lng], 18);
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

function getMapBorder() {
  return borders.find(function (b) { return b.id === mapBorderId; }) || null;
}

function updateMapBorderSelect() {
  var sel = document.getElementById('mapBorderSelect');
  sel.innerHTML = '<option value="">Kies een border...</option>' + borders.map(function (b) {
    return '<option value="' + esc(b.id) + '"' + (b.id === mapBorderId ? ' selected' : '') + '>' + esc(b.name) + '</option>';
  }).join('');
}

function updateMapPlantSelect() {
  var sel = document.getElementById('mapPlantSelect');
  var border = getMapBorder();
  if (!border || border.plants.length === 0) {
    sel.innerHTML = '<option value="">(geen planten in border)</option>';
    return;
  }
  sel.innerHTML = border.plants.map(function (p) {
    var label = esc(p.nlNaam || p.latijnseNaam) + (p.pos ? ' \u2713' : '');
    return '<option value="' + esc(p.latijnseNaam) + '">' + label + '</option>';
  }).join('');
}

function makePlantPopup(plant) {
  var div = document.createElement('div');
  var strong = document.createElement('strong');
  strong.textContent = plant.nlNaam || plant.latijnseNaam;
  div.appendChild(strong);
  div.appendChild(document.createElement('br'));
  var btn = document.createElement('button');
  btn.className = 'btn btn-danger';
  btn.textContent = 'Positie wissen';
  btn.addEventListener('click', function () {
    var border = getMapBorder();
    if (!border) return;
    var p = border.plants.find(function (x) { return x.latijnseNaam === plant.latijnseNaam; });
    if (p) { p.pos = null; saveState(); gardenMap.closePopup(); }
  });
  div.appendChild(btn);
  return div;
}

function renderMap() {
  updateMapBorderSelect();
  updateMapPlantSelect();
  mapShapeLayer.clearLayers();
  mapMarkerLayer.clearLayers();
  var border = getMapBorder();
  document.getElementById('mapPlaceRow').style.display = border ? 'flex' : 'none';
  if (!border) return;
  if (border.shape && border.shape.length >= 3) {
    L.polygon(border.shape, { color: '#2e7d32', weight: 3, fillOpacity: 0.15 }).addTo(mapShapeLayer);
  }
  border.plants.forEach(function (p) {
    if (!p.pos) return;
    var marker = L.circleMarker([p.pos.lat, p.pos.lng], {
      radius: 9, color: '#333', weight: 1,
      fillColor: getColorHex(p.kleur) || '#8bc34a', fillOpacity: 0.95
    }).addTo(mapMarkerLayer);
    marker.bindPopup(makePlantPopup(p));
    if (!L.Browser.mobile) marker.bindTooltip(p.nlNaam || p.latijnseNaam);
  });
}

function setDrawMode(on) {
  drawMode = on;
  drawPoints = [];
  if (drawPreview) { gardenMap.removeLayer(drawPreview); drawPreview = null; }
  document.getElementById('mapDrawBtn').style.display = on ? 'none' : '';
  document.getElementById('mapFinishDrawBtn').style.display = on ? '' : 'none';
  gardenMap.getContainer().style.cursor = on ? 'crosshair' : '';
}

function finishDraw() {
  if (drawPoints.length < 3) { alert('Te weinig punten: klik minimaal 3 hoekpunten van de border aan.'); return; }
  var border = getMapBorder();
  if (border) { border.shape = drawPoints; saveState(); }
  setDrawMode(false);
}

gardenMap.on('click', function (e) {
  if (!drawMode) {
    var border = getMapBorder();
    var sel = document.getElementById('mapPlantSelect');
    if (!border || !sel || !sel.value) return;
    var plant = border.plants.find(function (x) { return x.latijnseNaam === sel.value; });
    if (plant) { plant.pos = { lat: e.latlng.lat, lng: e.latlng.lng }; saveState(); }
    return;
  }
  drawPoints.push([e.latlng.lat, e.latlng.lng]);
  if (drawPreview) gardenMap.removeLayer(drawPreview);
  drawPreview = L.polyline(drawPoints, { color: '#2e7d32', dashArray: '6 4', weight: 3 }).addTo(gardenMap);
});

gardenMap.on('dblclick', function () { if (drawMode) finishDraw(); });

document.getElementById('mapBorderSelect').addEventListener('change', function (e) {
  mapBorderId = e.target.value || null;
  renderMap();
});
document.getElementById('mapDrawBtn').addEventListener('click', function () {
  if (!mapBorderId) { alert('Kies eerst een border in de dropdown.'); return; }
  setDrawMode(true);
});
document.getElementById('mapFinishDrawBtn').addEventListener('click', finishDraw);
document.getElementById('mapClearShapeBtn').addEventListener('click', function () {
  var border = getMapBorder();
  if (border && border.shape && confirm('Border-tekening wissen?')) { border.shape = null; saveState(); }
});
document.getElementById('mapLocateBtn').addEventListener('click', function () {
  if (!navigator.geolocation) { alert('Geolocatie wordt niet ondersteund.'); return; }
  navigator.geolocation.getCurrentPosition(function (pos) {
    gardenMap.setView([pos.coords.latitude, pos.coords.longitude], 18);
  }, function () { alert('Kon locatie niet bepalen.'); });
});
document.getElementById('mapKadasterToggle').addEventListener('change', function (e) {
  if (e.target.checked) { kadasterLayer.addTo(gardenMap); } else { gardenMap.removeLayer(kadasterLayer); }
});

// Synchroniseer kaart met planner-wijzigingen
var _origSaveState = saveState;
saveState = function () { _origSaveState(); renderMap(); };

renderMap();
