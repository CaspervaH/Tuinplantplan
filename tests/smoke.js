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
  `; return { slFilters, updateSlFilters, slMatches, renderShortlist, renderPlantTable, pvFilters, pvMatches,
    shortlist: () => shortlist, setShortlist: v => { shortlist = v; },
    getBorders: () => borders, setBorders: v => { borders = v; },
    getPlantLists: () => plantLists, setPlantLists: v => { plantLists = v; },
    setPvView, pvView: () => pvView, pvKey: () => pvKey, activeBorderId: () => activeBorderId,
    renderBorderPlantTable, renderPvBorderList, renderPvListList, renderFootSummary, addPlantToBorder, addPlantToList, addPlantToShortlist,
    renderBorderSourceList, renderBorderSourceTable, renderPlantList, createPlantList, getSourcePlants,
    setBorderSourceKey: v => { borderSourceKey = v; },
    shortlistEl, plantTableBodyEl, pvBorderListEl, pvListListEl, pvFootSummaryEl, slVisibleInfoEl,
    borderShapeBoxEl, borderSummaryEl, borderSourceBodyEl, borderSourceListEl };`);

const ctx = run(global.window, global.document, global.PlantPicker, global.localStorage, global.alert, global.confirm, promptMock = () => '1');
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  \u2713 ' + name); } else { fail++; console.error('  \u2717 ' + name); } }

const p = { bloeiVan: 'juli', bloeiTot: 'sept', standplaats: 'Z', kleur: 'geel', latijnseNaam: 'Test x', nlNaam: 'T', hoogteVan: 40, hoogteTot: 60 };
const p2 = { bloeiVan: 'mei', bloeiTot: 'mei', standplaats: 'S', kleur: 'rood', latijnseNaam: 'Nieuwe plant', nlNaam: 'N', hoogteVan: 20, hoogteTot: 20 };

// 1. shortlist-filters (onveranderd ten opzichte van eerdere revamp)
ctx.updateSlFilters();
check('maandfilter heeft 13 opties', ids.slFilterMaand._html.split('<option').length - 1 === 13);
ctx.slFilters.maand = '8'; check('plant jul-sept matcht filter september', ctx.slMatches(p));
ctx.slFilters.maand = '1'; check('plant jul-sept matcht filter februari niet', !ctx.slMatches(p));
ctx.slFilters.maand = '';

// 2. tabvolgorde in de HTML: Tuinontwerp, Planten, Instellingen
const navIdx = html.indexOf('<nav id="mainTabs"');
const nav = html.slice(navIdx, html.indexOf('</nav>', navIdx));
check('tab 1 = Tuinontwerp', nav.indexOf('data-tab="ontwerp"') < nav.indexOf('data-tab="planten"'));
check('geen apart Shortlist-tabblad (wel in sidebar)', !/data-tab="shortlist"/.test(nav));
check('Borders-tabblad aanwezig', /data-tab="borders"/.test(nav));
check('geen "Nieuwe border aanmaken"-knop (alleen tekenen)', !html.includes('id="addBorderBtn"'));

// 3. planten-view: alle planten in shortlist-vorm (tabel, hoogtebalk, shortlist-checkbox)
ctx.renderPlantTable();
check('planten-tabel toont plant met hoogtebalk', ctx.plantTableBodyEl._html.includes('sl-hoogte-fill'));
check('planten-tabel heeft shortlist-checkbox', ctx.plantTableBodyEl._html.includes('data-slcheck='));
check('planten-tabel toont bloeimaand-kolommen', ctx.plantTableBodyEl._html.includes('sl-m bloei'));
check('hoogtebalk + vaste tekstbreedte (uitgelijnd)', html.includes('.sl-hoogte-txt { display: inline-block; vertical-align: middle; margin-left: 6px; width: 84px'));
check('vaste tellers onderaan (pv-foot + summary)', html.includes('id="pvFoot"') && html.includes('id="pvFootSummary"'));
check('sidebar in de HTML', html.includes('id="plantSidebar"') && html.includes('data-pv="shortlist"'));
check('teken-statusbalk in de toolbar', html.includes('id="mapDrawStatus"'));
check('plantpicker.js en customplants.js worden geladen', html.includes('src="plantpicker.js"') && html.includes('src="customplants.js"'));
check('borders-overzicht view in de HTML', html.includes('id="pvViewBorders"') && html.includes('id="pvBordersOverview"'));
check('teken-guard: klikken op shapes genegeerd tijdens tekenen', (fs.readFileSync('map.js', 'utf8')).includes("if (drawMode || freehandOn || circleMode) { L.DomEvent.stopPropagation(ev); return; }"));

// 4. shortlist-render
ctx.setShortlist([p]);
ctx.renderShortlist();
check('rij bevat hoogtebalk (fill)', ctx.shortlistEl._html.includes('sl-hoogte-fill'));
check('shortlist-rij is sleepbaar', ctx.shortlistEl._html.includes('draggable="true"'));
check('genuskop colspan=20', ctx.shortlistEl._html.includes('colspan="20"'));
check('shortlist-teller in de sidebar', html.includes('<span class="cnt" id="shortlistCount">'));

// 5. borders alleen via tekenen: map.js opent Planten-tab + openBorderId
const mapJs = fs.readFileSync('map.js', 'utf8');
check('map.js opent Borders-tab bij border-klik', /localStorage\.setItem\('activeTab', 'borders'\)/.test(mapJs));
check('map.js zet openBorderId', mapJs.includes("localStorage.setItem('openBorderId'"));

// 6. border-view: tekening + bronlijst (3 kolommen)
ctx.setBorders([{ id: '1', name: 'Testborder', plants: [Object.assign({}, p)], shape: [[52, 5], [52, 5.001], [52.001, 5.001]] }]);
ctx.setPvView('border', '1');
check('border-view actief', ctx.pvView() === 'border' && ctx.activeBorderId() === '1');
check('border-samenvatting toont alleen geplaatste planten (titel)', ctx.borderSummaryEl._html.includes('Geplaatst in deze border'));
check('vormweergave gebouwd (svg in box)', ctx.borderShapeBoxEl.children.length > 0);
check('voettekst-samenvatting gevuld', ctx.pvFootSummaryEl._html.includes('pp-summary'));
check('3-kolommen borderscherm in de HTML', html.includes('border-3col') && html.includes('borderSourceList') && html.includes('borderSourceSearch'));
check('bronlijst-dropdown gevuld (shortlist + alle planten)', ctx.borderSourceListEl._html.includes('Shortlist') && ctx.borderSourceListEl._html.includes('Alle planten'));
check('bronlijst toont shortlist-planten', (ctx.setShortlist([p, p2]), ctx.renderBorderSourceList(), ctx.renderBorderSourceTable(), ctx.borderSourceBodyEl._html.includes('Nieuwe plant')));
ctx.setBorderSourceKey('all');
ctx.renderBorderSourceTable();
check('bronlijst "alle planten" toont plant uit plantData', ctx.borderSourceBodyEl._html.includes('sl-hoogte-fill'));
ctx.setShortlist([p, p2]);
// 7. eigen lijstjes
ctx.setPlantLists([{ id: 'L1', name: 'Mijn lijstje', plants: [Object.assign({}, p)] }]);
ctx.setPvView('list', 'L1');
check('lijstje-view actief', ctx.pvView() === 'list' && ctx.pvKey() === 'list:L1');
check('lijstje in sidebar getoond', ctx.pvListListEl._html.includes('Mijn lijstje'));
check('lijstje-tabel toont plant', ids.plantListBody._html.includes('sl-hoogte-fill'));
check('plant toevoegen aan lijstje', (ctx.addPlantToList('L1', 'Nieuwe plant'), ctx.getPlantLists()[0].plants.some(x => x.latijnseNaam === 'Nieuwe plant')));
check('plant uit lijstje toevoegen aan shortlist', (ctx.setShortlist([]), ctx.addPlantToShortlist('Nieuwe plant'), ctx.shortlist().some(x => x.latijnseNaam === 'Nieuwe plant')));
ctx.setPvView('border', '1');
check('bronlijst-dropdown bevat lijstje en andere border', ctx.borderSourceListEl._html.includes('Mijn lijstje') && ctx.borderSourceListEl._html.includes('Testborder') === false);
ctx.setBorderSourceKey('list:L1');
ctx.renderBorderSourceTable();
check('bronlijst uit lijstje toont plant', ctx.borderSourceBodyEl._html.includes('Test x'));
// 8. sleep een shortlist-plant naar een border (drag & drop-pad)
ctx.setShortlist([p, p2]);
ctx.renderShortlist();
ctx.setPvView('border', '1');
const added = ctx.addPlantToBorder('1', 'Nieuwe plant', null);
check('plant via sleep toegevoegd aan border', added && ctx.getBorders()[0].plants.some(x => x.latijnseNaam === 'Nieuwe plant'));
check('geen planten in border zonder herkomst', !ctx.getBorders()[0].plants.some(x => x.latijnseNaam === 'Onbekend'));
check('borderlijst in de sidebar toont border', ctx.pvBorderListEl._html.includes('Testborder'));
check('plantLists in saveState en backup', /localStorage.setItem\('plantLists'/.test(html) && require('fs').readFileSync('backup.js', 'utf8').includes("'plantLists'"));
console.log('');
if (fail) { console.error('\u2717 ' + fail + ' rooktest-fout(en)'); process.exit(1); }
console.log('\u2713 Rooktest geslaagd (' + pass + ' checks)');
