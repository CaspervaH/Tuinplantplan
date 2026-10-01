// Functionele rooktest: draait de inline-logica van index.html (shortlist + border-tab)
// tegen een mini-DOM-mock, zonder browser. Verifieert de revamp-wijzigingen.
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
Object.defineProperty(El.prototype, 'innerHTML', { get() { return this._html; }, set(v) { this._html = v; } });
Object.defineProperty(El.prototype, 'textContent', { get() { return this._text; }, set(v) { this._text = v; } });
Object.defineProperty(El.prototype, 'value', { get() { return this.attrs.value || ''; }, set(v) { this.attrs.value = v; } });
Object.defineProperty(El.prototype, 'options', { get() { return (this._html.match(/<option/g) || []).map(() => ({})); } });
Object.defineProperty(El.prototype, 'classList', { get() { return { add() {}, remove() {}, toggle() {}, contains() { return false; } }; } });

const ids = {};
global.document = {
  getElementById: id => ids[id] || (ids[id] = new El('div')),
  querySelectorAll: () => [], createElement: t => new El(t),
  createElementNS: (ns, t) => new El(t),
  head: new El('head'), body: new El('body')
};
global.window = { PLANTEN_EXTRA: [], CustomPlants: { all: () => [] } };
global.PlantPicker = new Function('window', pickerSrc + '; return window.PlantPicker;')(global.window);
global.alert = () => {}; global.confirm = () => false; global.prompt = () => null;
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const cleaned = inline
  .replace(/plantPicker\.refresh\(\);/g, '')
  .replace(/borderPicker\.refresh\(\);/g, '')
  .replace(/window\.addEventListener/g, 'window.__noop && window.addEventListener.bind(window) || (window.addEventListener = function(){}) || window.addEventListener');
window.addEventListener = function () {};

const run = new Function('window', 'document', 'PlantPicker', 'localStorage', 'alert', 'confirm', 'prompt',
  cleaned +
  `; return { slFilters, slFilterMaandEl, updateSlFilters, slMatches, renderShortlist, shortlist: () => shortlist, setShortlist: v => { shortlist = v; }, getBorders: () => borders, setBorders: v => { borders = v; }, setSlSelection: v => { slSelection.length = 0; v.forEach(x => slSelection.push(x)); }, renderBorderPlantTable, showActiveBorder, activeBorderId: () => activeBorderId, setActiveBorderId: v => { activeBorderId = v; }, borderPicker: () => borderPicker, borderShapeBoxEl, borderShape: () => (typeof borderShape !== 'undefined' ? borderShape : null), slAddSelectionToBorder, borderPlantTableBodyEl, shortlistEl };`);
const promptMock = () => '1';
const ctx = run(global.window, global.document, global.PlantPicker, global.localStorage, global.alert, global.confirm, promptMock);

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name); } }

// 1. maandfilter: opties worden gevuld (13 incl. "alle") en matching klopt
ctx.updateSlFilters();
check('maandfilter heeft 13 opties', ctx.slFilterMaandEl._html.split('<option').length - 1 === 13);
const p = { bloeiVan: 'juli', bloeiTot: 'sept', standplaats: 'Z', kleur: 'geel', latijnseNaam: 'Test x', nlNaam: 'T', hoogteVan: 40, hoogteTot: 60 };
ctx.slFilters.maand = '8'; check('plant jul-sept matcht filter september', ctx.slMatches(p));
ctx.slFilters.maand = '1'; check('plant jul-sept matcht filter februari niet', !ctx.slMatches(p));
ctx.slFilters.maand = '';

// 2. shortlist-render: hoogtebalk, selectievakje, colspan-20
ctx.setShortlist([p]);
ctx.renderShortlist();
check('rij bevat hoogtebalk (fill)', ctx.shortlistEl._html.includes('sl-hoogte-fill'));
check('rij bevat selectiecheckbox', ctx.shortlistEl._html.includes('data-sel='));
check('genuskop colspan=20', ctx.shortlistEl._html.includes('colspan="20"'));

// 3. border-tab: tabel in shortlist-vorm + geplaatst-kolom
ctx.setBorders([{ id: '1', name: 'Testborder', plants: [Object.assign({}, p)], shape: [[52, 5], [52, 5.001], [52.001, 5.001]] }]);
ctx.setActiveBorderId('1');
ctx.renderBorderPlantTable();
check('border-tabel gebruikt shortlist-kolommen', ctx.borderPlantTableBodyEl._html.includes('sl-hoogte-fill') && ctx.borderPlantTableBodyEl._html.includes('sl-m bloei'));
check('border-tabel heeft verwijderknop', ctx.borderPlantTableBodyEl._html.includes('data-removefromborder'));

// 4. borderpicker bestaat
check('borderpicker instantie bestaat', typeof ctx.borderPicker() === 'object' && ctx.borderPicker() !== null);

// 5. vormweergave met 3+ hoekpunten wordt gebouwd
ctx.showActiveBorder('1');
check('vormweergave gebouwd (svg in box)', ctx.borderShapeBoxEl.children.length > 0);
check('borderShape actief', !!ctx.borderShape());

// 6. multi-select toevoegen aan border
ctx.setShortlist([p, { latijnseNaam: 'Nieuwe plant', nlNaam: 'N', standplaats: 'S', kleur: 'rood', bloeiVan: 'mei', bloeiTot: 'mei', hoogteVan: 20, hoogteTot: 20 }]);
ctx.setSlSelection(['Nieuwe plant']);
ctx.slAddSelectionToBorder();
check('selectie toegevoegd aan border', ctx.getBorders()[0].plants.some(x => x.latijnseNaam === 'Nieuwe plant'));

console.log('');
if (fail) { console.error('✗ ' + fail + ' rooktest-fout(en)'); process.exit(1); }
console.log('✓ Rooktest geslaagd (' + pass + ' checks)');
