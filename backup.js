// Backup: exporteer & importeer plannerdata (localStorage) als JSON — Tuinplantplanner
// v6: import-knop op het startscherm (#addressGate), zodat een backup hersteld kan
//     worden vóór het invoeren van een adres (nieuw apparaat / nieuwe browser).
// v3: rechtstreeks in het Instellingen-tabblad (#backupDock), geen uitklapknop meer.
// v5: EXPECT-structuur gecorrigeerd (shortlist = plant-objecten, borders = array)
// v4: geharde import — maximale bestandsgrootte, strikte structuurcontrole per sleutel
//     en weigering bij HTML/script/event-handler-patronen in de gegevens.
(function () {
  var KEYS = ['shortlist', 'borders', 'plantLists', 'gardenObjects', 'gardenAddress', 'mapView'];
  var LAST = 'lastBackupAt';

  function readAll() {
    var data = {};
    KEYS.forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    });
    return data;
  }

  function setStatus(msg) {
    var el = document.getElementById('backupStatus');
    if (el) el.textContent = msg;
  }

  function updateLast() {
    var el = document.getElementById('backupLast');
    if (!el) return;
    var t = localStorage.getItem(LAST);
    el.textContent = t ? ('Laatste export: ' + new Date(t).toLocaleString('nl-NL')) : 'Nog nooit geëxporteerd.';
  }

  function doExport() {
    var data = readAll();
    if (!Object.keys(data).length) {
      setStatus('Niets om te exporteren — maak eerst een shortlist of border.');
      return;
    }
    var payload = {
      app: 'tuinplantplanner',
      version: 2,
      exportedAt: new Date().toISOString(),
      data: data
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tuinplantplanner-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    localStorage.setItem(LAST, new Date().toISOString());
    updateLast();
    setStatus('Backup gedownload.');
  }

  // ---- Beveiliging (v4): import is data-only, nooit code ----
  // 1. maximaal 2 MB, 2. alleen de 5 bekende sleutels, 3. elke waarde moet
  //    geldige JSON zijn met de verwachte structuur, 4. alle tekst wordt
  //    gescand op HTML/script/event-handler-patronen -> import geweigerd.
  //    De app voert geïmporteerde gegevens nooit uit als code (JSON.parse +
  //    escaping bij het tonen); deze laag is een extra vangnet.
  var MAX_BYTES = 2 * 1024 * 1024;
  var DANGEROUS = /<\s*\/?\s*(script|iframe|object|embed|svg|link|style|img|video|audio|body|input|form|meta|base)\b|javascript\s*:|data\s*:\s*text\s*\/html|\bon[a-z]+\s*=/i;

  function deepScan(value, depth) {
    if (depth > 12) return true; // abnormaal diep genest = verdacht
    if (typeof value === 'string') return DANGEROUS.test(value);
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        if (deepScan(value[i], depth + 1)) return true;
      }
      return false;
    }
    if (value && typeof value === 'object') {
      for (var k in value) {
        if (Object.prototype.hasOwnProperty.call(value, k) && deepScan(value[k], depth + 1)) return true;
      }
    }
    return false;
  }

  // Verwachte structuur per sleutel (exports slaan elke sleutel op als JSON-string)
  // NB: de app zelf slaat shortlist op als array van plant-objecten en borders
  // als array van border-objecten — precies wat een eigen
  // export bevat en wat we hier dus strikt verwachten.
  var EXPECT = {
    shortlist: function (v) { return Array.isArray(v) && v.every(function (x) { return x && typeof x === 'object' && !Array.isArray(x) && typeof x.latijnseNaam === 'string'; }); },
    gardenObjects: function (v) { return Array.isArray(v) && v.every(function (x) { return x && typeof x === 'object' && !Array.isArray(x); }); },
    borders: function (v) { return Array.isArray(v) && v.every(function (x) { return x && typeof x === 'object' && !Array.isArray(x) && typeof x.id === 'string' && typeof x.name === 'string'; }); },
    plantLists: function (v) { return Array.isArray(v) && v.every(function (x) { return x && typeof x === 'object' && !Array.isArray(x) && typeof x.id === 'string' && typeof x.name === 'string' && Array.isArray(x.plants); }); },
    gardenAddress: function (v) { return v && typeof v === 'object' && !Array.isArray(v); },
    mapView: function (v) { return v && typeof v === 'object' && !Array.isArray(v); }
  };

  function doImport(file, statusEl) {
    // statusEl: eigen status-regel (bv. op het startscherm); default = Instellingen-tab
    var setStatus = function (msg) {
      var el = statusEl || document.getElementById('backupStatus');
      if (el) el.textContent = msg;
    };
    if (file.size > MAX_BYTES) {
      setStatus('Import geweigerd: bestand is groter dan 2 MB — dit is geen normale backup.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var payload;
      try { payload = JSON.parse(String(reader.result)); }
      catch (e) { setStatus('Ongeldig bestand: geen geldige JSON.'); return; }
      if (!payload || payload.app !== 'tuinplantplanner' || !payload.data || typeof payload.data !== 'object') {
        setStatus('Dit lijkt geen Tuinplantplanner-backup te zijn.');
        return;
      }
      // Eerst ALLES valideren; pas daarna wegschrijven (nooit half importeren).
      var validated = {};
      try {
        KEYS.forEach(function (k) {
          if (!Object.prototype.hasOwnProperty.call(payload.data, k)) return;
          var v = payload.data[k];
          if (typeof v === 'string') v = JSON.parse(v); // exports slaan JSON-strings op
          if (!EXPECT[k](v)) throw new Error('structuur van sleutel "' + k + '" klopt niet');
          if (deepScan(v, 0)) throw new Error('DANGER');
          validated[k] = v;
        });
      } catch (e) {
        if (String(e.message) === 'DANGER') {
          setStatus('Import geweigerd: het bestand bevat mogelijk schadelijke code (HTML/script in de gegevens).');
        } else {
          setStatus('Import geweigerd: ' + (e.message || 'de inhoud past niet bij de app') + '.');
        }
        return;
      }
      if (!Object.keys(validated).length) {
        setStatus('Er staan geen bruikbare gegevens in dit bestand.');
        return;
      }
      var hasData = Object.keys(readAll()).length > 0;
      if (hasData && !window.confirm('Importeren vervangt de gegevens die in dit bestand zitten (shortlist, borders, lijstjes, tuinobjecten, kaartgegevens en adres). Gegevens die niet in het bestand staan, blijven gewoon staan. Doorgaan?')) return;
      // Alleen sleutels die in het bestand zitten worden vervangen,
      // zodat je bv. alleen tuinobjecten (gardenObjects) kunt importeren
      // zonder je shortlist of borders te verliezen.
      KEYS.forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(validated, k)) {
          localStorage.removeItem(k);
          localStorage.setItem(k, JSON.stringify(validated[k]));
        }
      });
      setStatus('Geïmporteerd — pagina wordt herladen...');
      setTimeout(function () { location.reload(); }, 800);
    };
    reader.readAsText(file);
  }

  function buildUI() {
    var dock = document.getElementById('backupDock');
    if (!dock) return;
    dock.innerHTML =
      '<p class="settings-note">Je gegevens (shortlist, borders, tuinobjecten zoals paden en terrassen, kaartgegevens en adres) staan in deze browser (localStorage) en zijn dus alleen voor jou zichtbaar. Exporteer regelmatig een JSON-backup als veiligheid, of om je tuin over te zetten naar een ander apparaat of een andere browser.</p>' +
      '<div class="backup-actions">' +
      '<button id="backupExportBtn" class="btn">Exporteer JSON</button>' +
      '<button id="backupImportBtn" class="btn">Importeer JSON</button>' +
      '</div>' +
      '<input type="file" id="backupFileInput" style="display:none;">' +
      '<p style="font-size:0.8em;color:#777;margin:6px 0 0;">Tip (iPhone/iPad): het geëxporteerde bestand staat meestal in Bestanden \u2192 Downloads. Kies bij \u201cImporteer JSON\u201d voor \u201cBestanden kiezen\u201d.</p>' +
      '<span id="backupStatus" style="font-weight:600;"></span>' +
      '<p id="backupLast" style="font-size:0.85em;color:#777;margin-top:6px;"></p>';
    document.getElementById('backupExportBtn').addEventListener('click', doExport);
    document.getElementById('backupImportBtn').addEventListener('click', function () {
      document.getElementById('backupFileInput').click();
    });
    document.getElementById('backupFileInput').addEventListener('change', function (e) {
      var f = (e.target).files && (e.target).files[0];
      if (f) doImport(f);
      (e.target).value = '';
    });
    updateLast();
  }

  // v6: import-mogelijkheid op het startscherm (vóór het adres), zodat je op een
  // nieuw apparaat of in een andere browser direct je backup kunt terugzetten.
  // Dynamisch gebouwd (geen index.html-wijziging); verdwijnt automatisch zodra
  // er een adres is (CSS: body.has-address #addressGate { display:none }).
  function buildGateImport() {
    var gate = document.getElementById('addressGate');
    if (!gate || gate.getAttribute('data-backup-import')) return;
    gate.setAttribute('data-backup-import', '1');
    var wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:16px;';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.style.cssText = 'background:#4682b4;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:0.95em;';
    btn.textContent = '💾 Backup importeren';
    var input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    var status = document.createElement('div');
    status.style.cssText = 'margin-top:8px;font-weight:600;font-size:0.9em;';
    var tip = document.createElement('div');
    tip.style.cssText = 'margin-top:6px;color:#777;font-size:0.85em;';
    tip.textContent = 'Op een nieuw apparaat of in een andere browser? Importeer hier je JSON-backup — adres, shortlist, borders, lijstjes en tuinobjecten worden in één keer hersteld.';
    btn.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (f) doImport(f, status);
      input.value = '';
    });
    wrap.appendChild(btn);
    wrap.appendChild(input);
    wrap.appendChild(status);
    wrap.appendChild(tip);
    gate.appendChild(wrap);
  }

  function init() {
    buildUI();
    buildGateImport();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
