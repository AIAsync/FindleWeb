/* Map tab: the listings of the last search on a San Francisco map.
 *
 * Leaflet with OpenStreetMap tiles. Points come from /api/geo/search/<search_id>/ — the same ranked
 * list the Search tab pages through, up to 300 listings. When that list has expired on the API side
 * the map falls back to the cards already on screen.
 *
 * A distance condition ("within 2 km of Salesforce Tower", "near my office") is drawn as its anchor
 * and a circle of the radius; "near BART" switches the station layer on. Every distance shown is the
 * straight-line distance the API measured, not a route.
 */
(function () {
    'use strict';

    const SF_CENTER = [37.765, -122.435];
    const SF_ZOOM = 12;
    const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · <a href="https://datasf.org" target="_blank" rel="noopener">DataSF</a>';
    const MODE_COLORS = { bart: '#1d4ed8', muni_metro: '#dc2626', caltrain: '#475569' };
    const MODE_LABELS = { bart: 'BART', muni_metro: 'Muni Metro', caltrain: 'Caltrain' };
    // Stations a transit condition is about — their radius is drawn when there are few of them
    const GROUP_MODES = {
        metro: ['bart', 'muni_metro'], bart: ['bart'], muni_metro: ['muni_metro'], muni: ['muni_metro'],
        caltrain: ['caltrain'], rail: ['bart', 'muni_metro', 'caltrain'], transit: ['bart', 'muni_metro', 'caltrain'],
    };
    const MAX_STATION_CIRCLES = 25;

    // Many listings: dots until the user zooms in, price pins from this zoom on
    const PIN_ZOOM = 15;
    const MAX_PINS_ALWAYS = 40;

    let map = null;
    let dotLayer = null;
    let pinLayer = null;
    let manyListings = false;
    let nearLayer = null;
    let stationLayer = null;
    let stations = null;
    let drawnKey = null;
    let pending = 0;

    const tr = (key, fallback) => {
        const own = window.MAP_TRANSLATIONS || {};
        if (own[key] !== undefined) return own[key];
        return typeof window.t === 'function' ? window.t(key, fallback) : fallback;
    };

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function safeUrl(url) {
        return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';
    }

    function money(value, currency) {
        if (value == null) return '';
        const amount = Math.round(value).toLocaleString('en-US');
        return currency === 'USD' || !currency ? `$${amount}` : `${amount} ${currency}`;
    }

    function shortMoney(value, currency) {
        if (value == null) return '?';
        const sign = currency === 'USD' || !currency ? '$' : '';
        if (value >= 1000000) return `${sign}${(value / 1000000).toFixed(1)}M`;
        if (value >= 10000) return `${sign}${Math.round(value / 1000)}k`;
        if (value >= 1000) return `${sign}${(value / 1000).toFixed(1)}k`;
        return `${sign}${Math.round(value)}`;
    }

    function distance(meters) {
        if (meters == null) return '';
        return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
    }

    function walk(minutes) {
        return minutes ? ` · ~${minutes} ${tr('map_walk', 'min walk')}` : '';
    }

    function element(id) {
        return document.getElementById(id);
    }

    function setStatus(html) {
        const box = element('map-status');
        if (box) box.innerHTML = html;
    }

    function ensureMap() {
        if (map) return map;
        const box = element('results-map');
        if (!box) return null;
        if (typeof L === 'undefined') {
            setStatus(`<span class="map-status-error">${esc(tr('map_unavailable', 'The map could not be loaded.'))}</span>`);
            return null;
        }
        map = L.map(box, { zoomControl: true, scrollWheelZoom: true }).setView(SF_CENTER, SF_ZOOM);
        // OpenStreetMap's tile servers refuse requests without a Referer, and Django's SecurityMiddleware
        // sends none cross-origin (Referrer-Policy: same-origin). The site's origin is enough for them.
        L.tileLayer(TILE_URL, {
            maxZoom: 19, attribution: ATTRIBUTION, referrerPolicy: 'strict-origin-when-cross-origin',
        }).addTo(map);
        stationLayer = L.layerGroup();
        nearLayer = L.featureGroup().addTo(map);
        dotLayer = L.featureGroup();
        pinLayer = L.featureGroup();
        map.on('zoomend', applyZoomMode);

        const toggle = element('map-stations-toggle');
        if (toggle) {
            toggle.addEventListener('change', () => showStations(toggle.checked));
        }
        return map;
    }

    async function loadStations() {
        if (stations) return stations;
        try {
            const res = await fetch('/api/geo/stations/');
            const data = res.ok ? await res.json() : { stations: [] };
            stations = (data.stations || []).filter(s => s.lat != null && s.lon != null);
        } catch (e) {
            stations = [];
        }
        stationLayer.clearLayers();
        stations.forEach(s => {
            const color = MODE_COLORS[s.mode] || '#475569';
            const lines = (s.lines || []).length ? ` · ${s.lines.join(', ')}` : '';
            L.circleMarker([s.lat, s.lon], {
                radius: s.mode === 'muni_metro' ? 4 : 6, color: '#ffffff', weight: 1.5,
                fillColor: color, fillOpacity: 0.95,
            }).bindTooltip(`${esc(s.name)} — ${esc(MODE_LABELS[s.mode] || s.mode)}${esc(lines)}`)
              .addTo(stationLayer);
        });
        return stations;
    }

    async function showStations(visible) {
        if (!map) return;
        const toggle = element('map-stations-toggle');
        if (toggle) toggle.checked = visible;
        if (!visible) {
            map.removeLayer(stationLayer);
            return;
        }
        await loadStations();
        stationLayer.addTo(map);
    }

    function specs(p) {
        const parts = [];
        if (p.rooms === 0) parts.push(tr('studio', 'Studio'));
        else if (p.rooms) parts.push(`${p.rooms} ${tr('bd_short', 'bd')}`);
        if (p.bathrooms) parts.push(`${p.bathrooms} ${tr('ba_short', 'ba')}`);
        if (p.area_sqft) parts.push(`${p.area_sqft.toLocaleString('en-US')} ${tr('sqft', 'sq ft')}`);
        return parts.join(' · ');
    }

    function popup(p) {
        const image = safeUrl(p.image_url);
        const url = safeUrl(p.product_url);
        const place = [p.address, p.neighborhood || p.district].filter(Boolean).join(' · ');
        const price = p.price != null
            ? `${esc(money(p.price, p.currency))}${p.monthly ? esc(tr('per_month', '/mo')) : ''}` : '';
        const measured = (p.geo_match || []).map(m =>
            `<div class="map-pop-line"><i class="fa-solid fa-ruler-horizontal"></i> ${esc(m.name)} · <b>${esc(distance(m.distance_m))}</b>${esc(walk(m.walk_min))}</div>`
        ).join('');
        const metro = p.metro && !(p.geo_match || []).some(m => m.kind === 'transit')
            ? `<div class="map-pop-line"><i class="fa-solid fa-train-subway"></i> ${esc(p.metro)} · <b>${esc(distance(p.metro_m))}</b></div>`
            : '';
        return `
            <div class="map-pop">
                ${image ? `<img class="map-pop-img" src="${esc(image)}" alt="" loading="lazy">` : ''}
                <div class="map-pop-title">${esc(p.title)}</div>
                ${price ? `<div class="map-pop-price">${price}</div>` : ''}
                ${specs(p) ? `<div class="map-pop-specs">${esc(specs(p))}</div>` : ''}
                ${place ? `<div class="map-pop-place">${esc(place)}${p.approximate ? ` <span class="map-pop-approx">${esc(tr('map_approx', 'approximate location'))}</span>` : ''}</div>` : ''}
                ${measured}${metro}
                ${url ? `<a class="map-pop-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(tr('map_open', 'Open listing'))} <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
                ${p.site_label ? `<div class="map-pop-site">${esc(p.site_label)}</div>` : ''}
            </div>`;
    }

    function applyZoomMode() {
        if (!map) return;
        const pins = !manyListings || map.getZoom() >= PIN_ZOOM;
        map.removeLayer(pins ? dotLayer : pinLayer);
        (pins ? pinLayer : dotLayer).addTo(map);
    }

    function drawListings(points) {
        dotLayer.clearLayers();
        pinLayer.clearLayers();
        const located = points.filter(p => p.lat != null && p.lon != null);
        located.forEach(p => {
            const html = popup(p);
            L.circleMarker([p.lat, p.lon], {
                radius: 6, color: '#ffffff', weight: 1.5,
                fillColor: p.approximate ? '#64748b' : '#0f172a', fillOpacity: 0.9,
            }).bindTooltip(esc(shortMoney(p.price, p.currency)), { direction: 'top' })
              .bindPopup(html, { maxWidth: 280, minWidth: 220 })
              .addTo(dotLayer);
            const icon = L.divIcon({
                className: 'map-price-pin' + (p.approximate ? ' is-approx' : ''),
                html: `<span>${esc(shortMoney(p.price, p.currency))}</span>`,
                iconSize: null,
            });
            L.marker([p.lat, p.lon], { icon, riseOnHover: true, title: p.title || '' })
                .bindPopup(html, { maxWidth: 280, minWidth: 220 })
                .addTo(pinLayer);
        });
        manyListings = located.length > MAX_PINS_ALWAYS;
        applyZoomMode();
    }

    async function drawNear(near) {
        nearLayer.clearLayers();
        const notes = [];
        let wantStations = false;
        for (const item of near || []) {
            const radius = item.max_m;
            const label = item.anchor ? item.anchor.label : (item.target || '');
            if (item.unresolved) {
                notes.push(`<span class="map-chip map-chip-warn"><i class="fa-solid fa-circle-question"></i> ${esc(tr('map_unresolved', 'Address unknown — distance not measured'))}</span>`);
                continue;
            }
            if (item.anchor && item.anchor.lat != null) {
                const icon = L.divIcon({
                    className: 'map-anchor-pin',
                    html: `<i class="fa-solid ${item.kind === 'personal' ? 'fa-briefcase' : 'fa-location-dot'}"></i>`,
                    iconSize: null,
                });
                L.marker([item.anchor.lat, item.anchor.lon], { icon, zIndexOffset: 1000 })
                    .bindTooltip(esc(item.anchor.label), { permanent: false })
                    .addTo(nearLayer);
                if (item.anchor.area && Array.isArray(item.anchor.shape)) {
                    // A park: the distance is to its edge, so the outline matters more than a circle
                    L.polygon(item.anchor.shape.map(ring => ring.map(pt => [pt[1], pt[0]])), {
                        color: '#16a34a', weight: 2, fillColor: '#22c55e', fillOpacity: 0.12,
                    }).addTo(nearLayer);
                } else if (radius) {
                    L.circle([item.anchor.lat, item.anchor.lon], {
                        radius, color: '#2563eb', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.06, dashArray: '6 6',
                    }).addTo(nearLayer);
                }
            } else if (item.kind === 'transit') {
                wantStations = true;
                const modes = GROUP_MODES[item.target] || [];
                const list = (await loadStations()).filter(s => modes.includes(s.mode));
                if (radius && list.length && list.length <= MAX_STATION_CIRCLES) {
                    list.forEach(s => L.circle([s.lat, s.lon], {
                        radius, color: MODE_COLORS[s.mode] || '#475569', weight: 1, fillOpacity: 0.05,
                    }).addTo(nearLayer));
                }
            }
            if (radius) {
                const text = tr('map_within_format', '{place} · within {distance}')
                    .replace('{place}', label).replace('{distance}', distance(radius));
                notes.push(`<span class="map-chip"><i class="fa-solid fa-ruler-horizontal"></i> ${esc(text)}</span>`);
            }
        }
        if (wantStations) await showStations(true);
        return notes;
    }

    function fit(points, near) {
        const corners = points.filter(p => p.lat != null).map(p => [p.lat, p.lon]);
        (near || []).forEach(item => {
            if (item.anchor && item.anchor.lat != null) corners.push([item.anchor.lat, item.anchor.lon]);
        });
        if (corners.length === 1) map.setView(corners[0], 15);
        else if (corners.length) map.fitBounds(L.latLngBounds(corners), { padding: [40, 40], maxZoom: 16 });
        else map.setView(SF_CENTER, SF_ZOOM);
    }

    function summary(data, notes, expired) {
        const located = (data.points || []).filter(p => p.lat != null).length;
        const total = data.total || located;
        const parts = [`<span class="map-count"><b>${located}</b> ${esc(tr('map_on_map', 'listings on the map'))}</span>`];
        if (total > located) {
            parts.push(`<span class="map-muted">${esc(tr('map_of_total', 'of {total}').replace('{total}', total))}</span>`);
        }
        if (expired) parts.push(`<span class="map-muted">${esc(tr('map_expired', 'Showing this page only — run the search again for all results.'))}</span>`);
        return parts.concat(notes).join(' ');
    }

    async function show(ctx) {
        const view = element('map-view');
        if (!view) return;
        view.hidden = false;
        if (!ensureMap()) return;
        // The container was hidden: Leaflet measures it again once it is on screen
        setTimeout(() => map && map.invalidateSize(), 60);

        ctx = ctx || {};
        const products = (ctx.products || []).filter(p => p.lat != null && p.lon != null);
        const key = ctx.searchId || ctx.query || '';
        if (!key && !products.length) {
            drawnKey = null;
            dotLayer.clearLayers();
            pinLayer.clearLayers();
            nearLayer.clearLayers();
            await showStations(true);
            map.setView(SF_CENTER, SF_ZOOM);
            setStatus(`<span class="map-muted">${esc(tr('map_empty', 'Search for a home — the results will appear on this map.'))}</span>`);
            return;
        }
        if (key === drawnKey) return;

        const ticket = ++pending;
        setStatus(`<span class="map-muted"><i class="fa-solid fa-spinner fa-spin"></i> ${esc(tr('map_loading', 'Loading the map…'))}</span>`);
        let data = null;
        let expired = false;
        if (ctx.searchId) {
            try {
                const res = await fetch(`/api/geo/search/${encodeURIComponent(ctx.searchId)}/`);
                if (res.ok) data = await res.json();
                else expired = res.status === 404;
            } catch (e) {
                data = null;
            }
        }
        if (ticket !== pending) return;     // a newer search took over
        if (!data) {
            data = { points: products, near: ctx.near || [], total: products.length };
            expired = expired || Boolean(ctx.searchId);
        }
        drawListings(data.points || []);
        const notes = await drawNear(data.near || ctx.near || []);
        fit(data.points || [], data.near || ctx.near || []);
        setStatus(summary(data, notes, expired));
        drawnKey = key;
    }

    function hide() {
        const view = element('map-view');
        if (view) view.hidden = true;
    }

    window.FindleMap = {
        show,
        hide,
        /** A new search started: the next `show` draws it even under the same key. */
        reset() { drawnKey = null; },
    };
})();
