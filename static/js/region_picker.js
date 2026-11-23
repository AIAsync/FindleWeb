/* City picker: the city the visitor searches in (chat/region.py).
 *
 * The list comes from /api/regions/ — cities with listings, most first. Picking one stores it in the
 * session (every search, chat and alert then runs in that city unless the query names a place) and
 * re-runs the search on screen. `window.FindleRegion` and the `findle:region` event tell the map
 * where to centre when it has no listings to fit.
 */
(function () {
    'use strict';

    const root = document.getElementById('region-picker');
    if (!root) return;
    const button = document.getElementById('region-picker-btn');
    const label = document.getElementById('region-picker-label');
    const panel = document.getElementById('region-picker-panel');
    const search = document.getElementById('region-picker-search');
    const list = document.getElementById('region-picker-list');
    const listingsWord = root.dataset.listingsLabel || 'listings';
    const MAX_SHOWN = 60;

    let regions = [];
    let current = label.textContent.trim();

    function csrfToken() {
        // The cookie first (Django rotates it on login and logout), then the token the page was loaded with
        const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        if (match) return decodeURIComponent(match[1]);
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta && meta.content ? meta.content : '';
    }

    // The panel is fixed to the viewport: on phones the tab row scrolls sideways and would clip it
    function place() {
        const rect = button.getBoundingClientRect();
        const width = Math.min(300, window.innerWidth - 24);
        const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
        panel.style.top = `${Math.round(rect.bottom + 6)}px`;
        panel.style.left = `${Math.round(left)}px`;
        panel.style.width = `${Math.round(width)}px`;
    }

    function centerOf(name) {
        const item = regions.find(r => r.region === name);
        return item && Array.isArray(item.center) ? item.center : null;
    }

    function publish() {
        window.FindleRegion = { region: current, center: centerOf(current) };
        document.dispatchEvent(new CustomEvent('findle:region', { detail: window.FindleRegion }));
    }

    function render() {
        const term = search.value.trim().toLowerCase();
        list.replaceChildren();
        regions
            .filter(item => !term || item.region.toLowerCase().includes(term))
            .slice(0, MAX_SHOWN)
            .forEach(item => {
                const row = document.createElement('li');
                row.className = 'region-picker-item' + (item.region === current ? ' active' : '');
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', String(item.region === current));
                row.dataset.region = item.region;
                const name = document.createElement('span');
                name.textContent = item.region;
                const count = document.createElement('span');
                count.className = 'region-picker-count';
                count.textContent = `${Number(item.listings || 0).toLocaleString()} ${listingsWord}`;
                row.append(name, count);
                list.appendChild(row);
            });
    }

    function setOpen(open) {
        panel.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
        root.classList.toggle('open', open);
        if (open) {
            search.value = '';
            render();
            place();
            search.focus();
        }
    }

    async function load() {
        try {
            const res = await fetch('/api/regions/', { credentials: 'same-origin' });
            if (!res.ok) return;
            const data = await res.json();
            regions = Array.isArray(data.regions) ? data.regions : [];
            current = data.current || current;
            label.textContent = current;
            publish();
        } catch (err) {
            // The server-rendered city stays; the list fills in on the next page load
        }
    }

    async function pick(region) {
        setOpen(false);
        if (!region || region === current) return;
        let res;
        try {
            res = await fetch('/api/regions/', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                body: JSON.stringify({ region }),
            });
        } catch (err) {
            return;
        }
        if (!res.ok) return;
        current = region;
        label.textContent = region;
        publish();
        // The listings on screen belong to the old city: run the same search in the new one
        const input = document.getElementById('user-input');
        const send = document.getElementById('send-btn');
        const agentMode = document.body.classList.contains('ask-ai-mode');
        if (input && input.value.trim() && send && !agentMode) send.click();
    }

    button.addEventListener('click', event => {
        event.stopPropagation();
        setOpen(panel.hidden);
    });
    search.addEventListener('input', render);
    search.addEventListener('keydown', event => {
        if (event.key === 'Escape') setOpen(false);
        if (event.key === 'Enter') {
            event.preventDefault();
            const first = list.querySelector('.region-picker-item');
            if (first) pick(first.dataset.region);
        }
    });
    list.addEventListener('click', event => {
        const row = event.target.closest('.region-picker-item');
        if (row) pick(row.dataset.region);
    });
    document.addEventListener('click', event => {
        if (!root.contains(event.target)) setOpen(false);
    });
    window.addEventListener('resize', () => { if (!panel.hidden) place(); });
    window.addEventListener('scroll', () => { if (!panel.hidden) place(); }, { passive: true, capture: true });

    // Phones: the tab row scrolls sideways and would hide the picker at its end, so it gets its own row
    const row = document.getElementById('region-picker-row');
    const home = root.parentElement;
    const homeNext = root.nextSibling;
    const phone = window.matchMedia('(max-width: 768px)');
    function dock() {
        if (!row) return;
        if (phone.matches) row.appendChild(root);
        else home.insertBefore(root, homeNext);
        row.hidden = !phone.matches;
        document.body.classList.toggle('region-row-docked', phone.matches);
    }
    if (phone.addEventListener) phone.addEventListener('change', dock);
    dock();

    load();
})();
