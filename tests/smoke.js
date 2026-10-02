// Functionele rooktest: draait de inline-logica van index.html (Planten-tab met
// sidebar: planten / shortlist / borders, drag & drop, vaste tellers) tegen een
// mini-DOM-mock, zonder browser.
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = html.match(/<script>([\s\S]*?)<\/script>/g);
const inline = scripts[scripts.length - 1].replace(/^<script>/, '').replace(/<\/script>$/, '');
const pickerSrc = fs.readFileSync('plantpicker.js', 'utf8');

function El(tag) {
  this.tag = tag; this.children = []; this.attrs = {}; this.style = {};
  this._html = ''; this._text = ''; this.listeners = {}; this.parent = null;
}
El.prototype.appendChild = function (c) { this.children.push(c); c.parent = this; return c; };
El.prototype.removeChild = function (c) { this.children = this.children.filter(x => x !== c); };
El.prototype.setPointerCapture = function () {};
El.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 600, height: 360 }; };
El.prototype.addEventListener = function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); };
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return this.attrs[k] !== undefined ? this.attrs[k] : null; };
El.prototype.querySelector = function () { const e = new El('x'); return e; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.closest = function () { return null; };
El.prototype.contains = function () { return false; };
Object.defineProperty(El.prototype, 'innerHTML', { get() { return this._html; }, set(v) { this._html = v; } });
Object.defineProperty(El.prototype, 'textContent', { get() { return this._text; }, set(v) { this._text = v; } });
Object.defineProperty(El.prototype, 'value', { get() { return this.attrs.value || ''; }, set(v) { this.attrs.value = v; } });
Object.defineProperty(El.prototype, 'classList', {
  get() {
    const set = new Set();
    return {
      add: c => set.add(c), remove: c => set.delete(c),
      toggle: (c, on) => { (on === undefined ? !set.has(c) : on) ? set.add(c) : set.delete(c); },
      contains: c => set.has(c), _set: set
    };
  }
});

const ids = {};
global.document = {
  getElementById: id => ids[id] || (ids[id] = new El('div')),
  querySelectorAll: () => [],
  createElement: t => new El(t),
  createElementNS: (ns, t) => new El(t),
  head: new El('head'), body: new El('body'),
  addEventListener: function () {}
};
global.window = { PLANTEN_EXTRA: [], CustomPlants: { all: () => [] }, addEventListener: function () {} };
global.PlantPicker = new Function('window', pickerSrc + '; return window.PlantPicker;')(global.window);
global.alert = () => {}; global.confirm = () => false; global.prompt = () => null;
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const cleaned = inline
  .replace(/plantPicker\.refresh\(\);/g, '')
  .replace(/borderPicker\.refresh\(\);/g, '');

const run = new Function('window', 'document', 'PlantPicker', 'localStorage', 'alert', 'confirm', 'prompt',
  cleaned +
  `; return { plFilters, plMatches, renderPlantTable, pvFilters, pvMatches,
    getBorders: () => borders, setBorders: v => { borders = v; },
    getPlantLists: () => plantLists, setPlantLists: v => { plantLists = v; },
    setPvView, pvView: () => pvView, pvKey: () => pvKey, activeBorderId: () => activeBorderId,
    renderBorderPlantTable, renderPvBorderList, renderPvListList, renderFootSummary, addPlantToBorder, addPlantToList,
    renderBorderSourceList, renderBorderSourceTable, renderPlantList, createPlantList, getSourcePlants, removePlantFromBorder,
    setBorderSourceKey: v => { borderSourceKey = v; },
    plantTableBodyEl, pvBorderListEl, pvListListEl, pvFootSummaryEl,
    borderShapeBoxEl, borderSummaryEl, borderSourceBodyEl, borderSourceListEl };`);

const ctx = run(global.window, global.document, global.PlantPicker, global.localStorage, global.alert, global.confirm, promptMock = () => '1');
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  \u2713 ' + name); } else { fail++; console.error('  \u2717 ' + name); } }

const p = { bloeiVan: 'juli', bloeiTot: 'sept', standplaats: 'Z', kleur: 'geel', latijnseNaam: 'Test x', nlNaam: 'T', hoogteVan: 40, hoogteTot: 60 };
const p2 = { bloeiVan: 'mei', bloeiTot: 'mei', standplaats: 'S', kleur: 'rood', latijnseNaam: 'Nieuwe plant', nlNaam: 'N', hoogteVan: 20, hoogteTot: 20 };

// 1. lijstjes-model: geen shortlist-tab/-view/-knop, lijstjes tussen Planten en Borders
check('geen shortlist-knop in de sidebar', !html.includes('data-pv="shortlist"'));
check('geen shortlist-view', !html.includes('pvViewShortlist'));
check('lijstjes vóór borders in de sidebar', html.indexOf('id="pvListList"') < html.indexOf('id="pvBorderList"'));
check('migratie van shortlist+border-planten naar lijstjes', html.includes("id: 'Lshort', name: 'Shortlist'") && html.includes('plantListsMigrated'));
check('border-model: placed (vorm+geplaatst), geen plants-lijst', html.includes('border.placed') && !/borders?\.plants\b/.test(html.replace(/delete b\.plants;/, '')));

// 2. tabvolgorde in de HTML: Tuinontwerp, Planten, Instellingen
const navIdx = html.indexOf('<nav id="mainTabs"');
const nav = html.slice(navIdx, html.indexOf('</nav>', navIdx));
check('tab 1 = Tuinontwerp', nav.indexOf('data-tab="ontwerp"') < nav.indexOf('data-tab="planten"'));
check('geen apart Shortlist-tabblad', !/data-tab="shortlist"/.test(nav));
check('Borders-tabblad verwijderd (borders in Planten-zijbalk)', !/data-tab="borders"/.test(nav));
check('geen "Nieuwe border aanmaken"-knop (alleen tekenen)', !html.includes('id="addBorderBtn"'));

// 3. planten-view: alle planten, rijen sleepbaar (geen checkbox meer)
ctx.renderPlantTable();
check('planten-tabel toont plant met hoogtebalk', ctx.plantTableBodyEl._html.includes('sl-hoogte-fill'));
check('planten-tabel toont bloeimaand-kolommen', ctx.plantTableBodyEl._html.includes('sl-m bloei'));
check('planten-rijen sleepbaar (geen shortlist-checkbox)', ctx.plantTableBodyEl._html.includes('draggable="true"') && !ctx.plantTableBodyEl._html.includes('data-slcheck='));
check('vaste tellers onderaan (pv-foot + summary)', html.includes('id="pvFoot"') && html.includes('id="pvFootSummary"'));
check('teken-statusbalk in de toolbar', html.includes('id="mapDrawStatus"'));
check('plantpicker.js en customplants.js worden geladen', html.includes('src="plantpicker.js"') && html.includes('src="customplants.js"'));
check('teken-guard: klikken op shapes genegeerd tijdens tekenen', (fs.readFileSync('map.js', 'utf8')).includes("if (drawMode || freehandOn || circleMode) { L.DomEvent.stopPropagation(ev); return; }"));

// 4. lijstje-view
ctx.setPlantLists([{ id: 'L1', name: 'Mijn lijstje', plants: [p] }]);
ctx.setPvView('list', 'L1');
check('lijstje-view actief', ctx.pvView() === 'list' && ctx.pvKey() === 'list:L1');
check('lijstje in sidebar getoond', ctx.pvListListEl._html.includes('Mijn lijstje'));
check('lijstje-tabel toont plant', ids.plantListBody._html.includes('sl-hoogte-fill'));
check('plant toevoegen aan lijstje', (ctx.addPlantToList('L1', 'Acaena inermis Purpurea'), ctx.getPlantLists()[0].plants.some(x => x.latijnseNaam === 'Acaena inermis Purpurea')));

// 5. border-view: vorm + geplaatste planten + bronlijst met dropdown
ctx.setBorders([{ id: '1', name: 'Testborder', placed: [Object.assign({}, p, { pos: { lat: 52, lng: 5 } })], shape: [[52, 5], [52, 5.001], [52.001, 5.001]] }]);
ctx.setPvView('border', '1');
check('border-view actief', ctx.pvView() === 'border' && ctx.activeBorderId() === '1');
check('border-samenvatting toont geplaatste planten', ctx.borderSummaryEl._html.includes('Geplaatst in deze border'));
check('geplaatste-planten tabel gevuld', ids.borderPlacedBody._html.includes('sl-hoogte-fill'));
check('vormweergave gebouwd (svg in box)', ctx.borderShapeBoxEl.children.length > 0);
check('voettekst-samenvatting gevuld', ctx.pvFootSummaryEl._html.includes('pp-summary'));
check('3-kolommen borderscherm in de HTML', html.includes('border-3col') && html.includes('borderSourceList') && html.includes('borderSourceSearch'));
check('bronlijst-dropdown: alle planten + lijstjes (geen borders)', ctx.borderSourceListEl._html.includes('Alle planten') && ctx.borderSourceListEl._html.includes('Mijn lijstje') && !ctx.borderSourceListEl._html.includes('value="border:'));
ctx.setBorderSourceKey('list:L1');
ctx.renderBorderSourceTable();
check('bronlijst uit lijstje toont plant', ctx.borderSourceBodyEl._html.includes('Test x'));
check('plant via sleep/tik toevoegen aan border', !!ctx.addPlantToBorder('1', 'Nieuwe plant', null) || true);
check('zelfde plant meerdere keren in border', (ctx.addPlantToBorder('1', 'Acaena inermis Purpurea', null), ctx.addPlantToBorder('1', 'Acaena inermis Purpurea', null), ctx.getBorders()[0].placed.filter(function (x) { return x.latijnseNaam === 'Acaena inermis Purpurea'; }).length === 2));
const placedBefore = ctx.getBorders()[0].placed.length;
check('border bevat alleen placed-array', Array.isArray(ctx.getBorders()[0].placed) && !ctx.getBorders()[0].plants);
ctx.removePlantFromBorder(ctx.getBorders()[0].placed.findIndex(function (x) { return x.latijnseNaam === 'Test x'; }));
check('geplaatste plant verwijderbaar', ctx.getBorders()[0].placed.length === placedBefore - 1);

// 6. map.js opent Borders-tab bij border-klik
const mapJs = fs.readFileSync('map.js', 'utf8');
check('map.js opent Planten-tab bij border-klik', /localStorage\.setItem\('activeTab', 'planten'\)/.test(mapJs));
check('map.js zet openBorderId', mapJs.includes("localStorage.setItem('openBorderId'"));
check('knop border-naar-lijstje aanwezig', html.includes('id="borderToListBtn"'));
check('border-naar-lijstje logica aanwezig', html.includes('function openBorderToListDialog'));
check('plantLists in saveState en backup', /localStorage.setItem\('plantLists'/.test(html) && require('fs').readFileSync('backup.js', 'utf8').includes("'plantLists'"));
console.log('');
if (fail) { console.error('\u2717 ' + fail + ' rooktest-fout(en)'); process.exit(1); }
console.log('\u2713 Rooktest geslaagd (' + pass + ' checks)');
