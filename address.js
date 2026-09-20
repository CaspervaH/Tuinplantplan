// Adres-gate functionaliteit (hersteld 20-09-2026)
// Geocodeert via PDOK Locatieserver, slaat adres op in localStorage (gardenAddress),
// toont/verbergt de adres-gate en stuurt de knop "Adres wijzigen" aan.
(function () {
    function applyAddress(addr, zoom) {
        document.body.classList.add('has-address');
        var titleEl = document.getElementById('addressTitle');
        if (titleEl) titleEl.textContent = '\uD83D\uDCCD ' + addr.label;
        var map = window.gardenMap;
        if (map && addr.lat && addr.lng) {
            map.setView([addr.lat, addr.lng], zoom || 19);
            setTimeout(function () { map.invalidateSize(); }, 50);
            setTimeout(function () { map.invalidateSize(); }, 400);
        }
    }
    function saveAddress(addr) {
        try { localStorage.setItem('gardenAddress', JSON.stringify(addr)); } catch (e) { }
        applyAddress(addr);
    }
    function geocodeAddress(q, cb, errCb) {
        var url = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=' + encodeURIComponent(q) + '&fq=type:adres&rows=1';
        fetch(url).then(function (r) { return r.json(); }).then(function (data) {
            var doc = data && data.response && data.response.docs && data.response.docs[0];
            var m = doc && doc.centroide_ll && /POINT\(([\d.]+) ([\d.]+)\)/.exec(doc.centroide_ll);
            if (!m) { if (errCb) errCb('Adres niet gevonden'); return; }
            cb({ label: doc.weergavenaam || q, lat: parseFloat(m[2]), lng: parseFloat(m[1]) });
        }).catch(function () { if (errCb) errCb('Zoeken mislukt'); });
    }
    window.submitGateAddress = function () {
        var input = document.getElementById('gateAddressInput');
        var btn = document.getElementById('gateAddressBtn');
        var q = (input && input.value || '').trim();
        if (!q) { if (input) input.focus(); return; }
        if (btn) { btn.disabled = true; btn.textContent = 'Zoeken...'; }
        geocodeAddress(q, function (addr) {
            saveAddress(addr);
            if (btn) { btn.disabled = false; btn.innerHTML = 'Naar mijn tuin &rarr;'; }
        }, function (msg) {
            if (btn) { btn.disabled = false; btn.innerHTML = 'Naar mijn tuin &rarr;'; }
            alert(msg + '. Probeer \u201Cstraat huisnummer, plaats\u201D, bijv. Dorpsstraat 1, Utrecht.');
        });
    };
    window.changeAddress = function () {
        try { localStorage.removeItem('gardenAddress'); } catch (e) { }
        document.body.classList.remove('has-address');
        var input = document.getElementById('gateAddressInput');
        if (input) { input.value = ''; input.focus(); }
        window.scrollTo(0, 0);
    };
    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('gateAddressBtn');
        if (btn) btn.addEventListener('click', window.submitGateAddress);
        var input = document.getElementById('gateAddressInput');
        if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') window.submitGateAddress(); });
        var cab = document.getElementById('changeAddressBtn');
        if (cab) cab.addEventListener('click', window.changeAddress);
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem('gardenAddress')); } catch (e) { }
        if (saved && saved.lat) applyAddress(saved); else if (input) input.focus();
    });
})();
