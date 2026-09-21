// customplants.js — eigen planten toevoegen aan de plantenlijst.
// Een eigen plant heeft alleen een (volledige) naam; alle overige gegevens
// zijn leeg en kunnen later worden aangevuld (bv. via een opzoekfunctie).
// Eigen planten krijgen isBeschikbaarBijAaldering: false.
// Opslag: localStorage-key "customPlants".
window.CustomPlants = (function () {
  'use strict';
  var KEY = 'customPlants';

  function all() {
    try {
      var list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function save(list) { localStorage.setItem(KEY, JSON.stringify(list)); }

  function isDuplicate(name) {
    var n = String(name).toLowerCase();
    function inList(list) {
      return (list || []).some(function (p) { return String(p.latijnseNaam || '').toLowerCase() === n; });
    }
    return inList(all()) || inList(window.PLANTEN_EXTRA) || inList(window.plantData);
  }

  function add(name) {
    name = String(name || '').trim();
    if (!name) return { ok: false, msg: 'Vul een naam in.' };
    if (isDuplicate(name)) return { ok: false, msg: 'Deze plant staat al in de plantenlijst.' };
    var list = all();
    list.push({
      latijnseNaam: name, nlNaam: '', standplaats: '', kleur: '',
      bloeiVan: '', bloeiTot: '', hoogteVan: null, hoogteTot: null,
      isBeschikbaarBijAaldering: false, isEigenPlant: true
    });
    save(list);
    return { ok: true };
  }

  function remove(name) {
    save(all().filter(function (p) { return p.latijnseNaam !== name; }));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderList() {
    var el = document.getElementById('customPlantList');
    if (!el) return;
    var list = all();
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div style="font-size:12px;color:#6c757d;margin-bottom:2px;">Eigen planten:</div>' +
      list.map(function (p) {
        return '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">' +
          '<span>🌱 <strong>' + esc(p.latijnseNaam) + '</strong> <em style="color:#6c757d;font-style:normal;font-size:11px;">(eigen plant, niet bij Aaldering)</em></span>' +
          '<button data-removeplant="' + esc(p.latijnseNaam) + '" style="margin-left:auto;border:none;background:#ff6b6b;color:white;border-radius:3px;padding:2px 7px;cursor:pointer;font-size:11px;">✕</button>' +
        '</div>';
      }).join('');
  }

  function injectUI() {
    var target = document.getElementById('plantPickerContainer');
    if (!target || !target.parentNode) return;
    if (document.getElementById('customPlantsBox')) return;
    var box = document.createElement('div');
    box.id = 'customPlantsBox';
    box.style.cssText = 'border:1px solid #dee2e6;border-radius:6px;padding:10px 12px;margin-bottom:12px;background:#fffdf5;font-size:13px;';
    box.innerHTML =
      '<strong style="color:#4a6b4a;">➕ Eigen plant toevoegen</strong>' +
      '<p style="margin:4px 0 6px;color:#6c757d;font-size:12px;">Alleen de volledige naam is nodig; kleur, hoogte en bloeitijd kunnen later worden aangevuld.</p>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        '<input type="text" id="customPlantInput" placeholder="Volledige plantnaam..." style="flex:1;min-width:180px;padding:6px 8px;border:1px solid #dee2e6;border-radius:4px;">' +
        '<button id="customPlantAddBtn" style="background:#7cb342;color:white;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;">Toevoegen</button>' +
      '</div>' +
      '<div id="customPlantMsg" style="font-size:12px;color:#b35900;margin-top:4px;"></div>' +
      '<div id="customPlantList" style="margin-top:6px;"></div>';
    target.parentNode.insertBefore(box, target);
    renderList();

    function doAdd() {
      var input = document.getElementById('customPlantInput');
      var res = add(input.value);
      if (res.ok) { window.location.reload(); return; }
      document.getElementById('customPlantMsg').textContent = res.msg;
    }
    box.addEventListener('click', function (e) {
      if (e.target.id === 'customPlantAddBtn') { doAdd(); return; }
      var rm = e.target.closest ? e.target.closest('[data-removeplant]') : null;
      if (rm) {
        remove(rm.getAttribute('data-removeplant'));
        window.location.reload();
      }
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.id === 'customPlantInput') doAdd();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
  } else {
    injectUI();
  }

  return { all: all, add: add, remove: remove };
})();
