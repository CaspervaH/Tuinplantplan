// Backup: exporteer & importeer plannerdata (localStorage) als JSON — Tuinplantplanner
// v3: rechtstreeks in het Instellingen-tabblad (#backupDock), geen uitklapknop meer.
(function () {
  var KEYS = ['shortlist', 'borders', 'gardenObjects', 'gardenAddress', 'mapView'];
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

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var payload;
      try { payload = JSON.parse(String(reader.result)); }
      catch (e) { setStatus('Ongeldig bestand: geen geldige JSON.'); return; }
      if (!payload || payload.app !== 'tuinplantplanner' || !payload.data || typeof payload.data !== 'object') {
        setStatus('Dit lijkt geen Tuinplantplanner-backup te zijn.');
        return;
      }
      var hasData = Object.keys(readAll()).length > 0;
      if (hasData && !window.confirm('Importeren vervangt de gegevens die in dit bestand zitten (shortlist, borders, tuinobjecten, kaartgegevens en adres). Gegevens die niet in het bestand staan, blijven gewoon staan. Doorgaan?')) return;
      // Alleen sleutels die in het bestand zitten worden vervangen,
      // zodat je bv. alleen tuinobjecten (gardenObjects) kunt importeren
      // zonder je shortlist of borders te verliezen.
      KEYS.forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(payload.data, k)) {
          localStorage.removeItem(k);
          var v = payload.data[k];
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
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
      '<input type="file" id="backupFileInput" accept=".json,application/json" style="display:none;">' +
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
