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
    setPvView, pvView: () => pvView, activeBorderId: () => activeBorderId,
    renderBorderPlantTable, renderPvBorderList, renderFootSummary, addPlantToBorder,
    borderPlantTableBodyEl, shortlistEl, plantTableBodyEl, pvBorderListEl, pvFootSummaryEl, slVisibleInfoEl,
    borderShapeBoxEl };`);

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
check('geen apart Shortlist-tabblad meer', !/data-tab="shortlist"/.test(nav));
check('geen apart Borders-tabblad meer', !/data-tab="borders"/.test(nav));
check('geen "Nieuwe border aanmaken"-knop (alleen tekenen)', !html.includes('id="addBorderBtn"'));

// 3. planten-view: alle planten in shortlist-vorm (tabel, hoogtebalk, shortlist-checkbox)
ctx.renderPlantTable();
check('planten-tabel toont plant met hoogtebalk', ctx.plantTableBodyEl._html.includes('sl-hoogte-fill'));
check('planten-tabel heeft shortlist-checkbox', ctx.plantTableBodyEl._html.includes('data-slcheck='));
check('planten-tabel toont bloeimaand-kolommen', ctx.plantTableBodyEl._html.includes('sl-m bloei'));
check('hoogtebalk + vaste tekstbreedte (uitgelijnd)', html.includes('.sl-hoogte-txt { display: inline-block; vertical-align: middle; margin-left: 6px; width: 84px'));
check('vaste tellers onderaan (pv-foot + summary)', html.includes('id="pvFoot"') && html.includes('id="pvFootSummary"'));
check('sidebar in de HTML', html.includes('id="plantSidebar"') && html.includes('data-pv="shortlist"'));

// 4. shortlist-render
ctx.setShortlist([p]);
ctx.renderShortlist();
check('rij bevat hoogtebalk (fill)', ctx.shortlistEl._html.includes('sl-hoogte-fill'));
check('shortlist-rij is sleepbaar', ctx.shortlistEl._html.includes('draggable="true"'));
check('genuskop colspan=20', ctx.shortlistEl._html.includes('colspan="20"'));
check('shortlist-teller in de sidebar', html.includes('<span class="cnt" id="shortlistCount">'));

// 5. borders alleen via tekenen: map.js opent Planten-tab + openBorderId
const mapJs = fs.readFileSync('map.js', 'utf8');
check('map.js opent Planten-tab bij border-klik', /localStorage\.setItem\('activeTab', 'planten'\)/.test(mapJs));
check('map.js zet openBorderId', mapJs.includes("localStorage.setItem('openBorderId'"));

// 6. border-view: tekening + tabel
ctx.setBorders([{ id: '1', name: 'Testborder', plants: [Object.assign({}, p)], shape: [[52, 5], [52, 5.001], [52.001, 5.001]] }]);
ctx.setPvView('border', '1');
check('border-view actief', ctx.pvView() === 'border' && ctx.activeBorderId() === '1');
check('border-tabel gebruikt shortlist-kolommen', ctx.borderPlantTableBodyEl._html.includes('sl-hoogte-fill') && ctx.borderPlantTableBodyEl._html.includes('sl-m bloei'));
check('border-tabel heeft verwijderknop', ctx.borderPlantTableBodyEl._html.includes('data-removefromborder'));
check('vormweergave gebouwd (svg in box)', ctx.borderShapeBoxEl.children.length > 0);
check('voettekst-samenvatting gevuld', ctx.pvFootSummaryEl._html.includes('pp-summary'));

// 7. sleep een shortlist-plant naar een border (drag & drop-pad)
ctx.setShortlist([p, p2]);
ctx.renderShortlist();
ctx.setPvView('border', '1');
const added = ctx.addPlantToBorder('1', 'Nieuwe plant', null);
check('plant via sleep toegevoegd aan border', added && ctx.getBorders()[0].plants.some(x => x.latijnseNaam === 'Nieuwe plant'));
check('geen planten in border zonder shortlist-herkomst', !ctx.getBorders()[0].plants.some(x => x.latijnseNaam === 'Onbekend'));
check('borderlijst in de sidebar toont border', ctx.pvBorderListEl._html.includes('Testborder'));

console.log('');
if (fail) { console.error('\u2717 ' + fail + ' rooktest-fout(en)'); process.exit(1); }
console.log('\u2713 Rooktest geslaagd (' + pass + ' checks)');
