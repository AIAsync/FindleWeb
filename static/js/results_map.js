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

    // Rentals from the whole US: with no listings to fit the map shows the country
    const HOME_CENTER = [39.5, -98.35];
    const HOME_ZOOM = 4;
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
    // BART, Muni Metro and Caltrain run only around San Francisco: their legend and the station switch are shown
    // only while the map shows that area, not over Tashkent or New York
    const TRANSIT_AREA = [[36.9, -122.75], [38.1, -121.5]];

    // Price pins that would overlap on screen join one numbered circle. Clicking it zooms in until they come
    // apart; pins that stay together even at CLUSTER_MAX_ZOOM (one building, or one approximate centre) open
    // as a list instead (owner, 2026-11-26: "uylar manzilda ko'rinmayapti ... zoom bo'ladigan qil")
    const CLUSTER_DX = 58;
    const CLUSTER_DY = 30;
    const CLUSTER_MAX_ZOOM = 18;
    const LIST_LIMIT = 40;

    let map = null;
    let pinLayer = null;
    // The listings on the map in ranking order: { p, at, html }
    let listings = [];
    let nearLayer = null;
    // The neighborhood the search asked for, outlined (San Francisco has its boundaries)
    let areaLayer = null;
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

    // Valyuta nomi narxdan keyin: so'm — "so'm"; noma'lum valyutaga belgi qo'yilmaydi ("$" so'mdagi narxni
    // million dollar qilib ko'rsatardi)
    function currencyWord(currency) {
        if (currency === 'UZS') return tr('som', "so'm");
        return currency && currency !== 'USD' ? currency : '';
    }

    function money(value, currency) {
        if (value == null) return '';
        const amount = Math.round(value).toLocaleString('en-US');
        if (currency === 'USD') return `$${amount}`;
        const word = currencyWord(currency);
        return word ? `${amount} ${word}` : amount;
    }

    function shortMoney(value, currency) {
        if (value == null) return '?';
        const sign = currency === 'USD' ? '$' : '';
        let text;
        if (value >= 1000000) text = `${(value / 1000000).toFixed(1)}M`;
        else if (value >= 10000) text = `${Math.round(value / 1000)}k`;
        else if (value >= 1000) text = `${(value / 1000).toFixed(1)}k`;
        else text = `${Math.round(value)}`;
        const word = currencyWord(currency);
        return word ? `${sign}${text} ${word}` : `${sign}${text}`;
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
        map = L.map(box, { zoomControl: true, scrollWheelZoom: true }).setView(HOME_CENTER, HOME_ZOOM);
        // OpenStreetMap's tile servers refuse requests without a Referer, and Django's SecurityMiddleware
        // sends none cross-origin (Referrer-Policy: same-origin). The site's origin is enough for them.
        L.tileLayer(TILE_URL, {
            maxZoom: 19, attribution: ATTRIBUTION, referrerPolicy: 'strict-origin-when-cross-origin',
        }).addTo(map);
        stationLayer = L.layerGroup();
        areaLayer = L.featureGroup().addTo(map);
        nearLayer = L.featureGroup().addTo(map);
        pinLayer = L.featureGroup().addTo(map);
        map.on('zoomend', drawClusters);
        map.on('moveend', updateLegend);

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

    function updateLegend() {
        const legend = document.querySelector('#map-view .map-legend');
        if (!legend || !map) return;
        // A map that is not on screen yet has no size: it is measured again when the tab opens
        const size = map.getSize();
        if (!size.x || !size.y) return;
        legend.hidden = !map.getBounds().intersects(L.latLngBounds(TRANSIT_AREA));
    }

    function specs(p) {
        const parts = [];
        if (p.units === 'metric') {
            // Uzbekistan: rooms and square metres, as on the result card
            if (p.rooms) parts.push(`${p.rooms} ${tr('rooms_short', 'xona')}`);
            if (p.total_area) parts.push(`${p.total_area} m²`);
            return parts.join(' · ');
        }
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

    /** Taxminiy nuqta (mo'ljal, tuman yoki shahar markazi): bir joyga tushgan e'lonlar ustma-ust turmasin —
     *  har biri o'z id'sidan 60–300 m ga, har safar bir xil tomonga suriladi. Aniq nuqta joyida qoladi. */
    function placed(p) {
        if (!p.approximate) return [p.lat, p.lon];
        let hash = 0;
        for (const ch of String(p.product_id || `${p.lat},${p.lon},${p.price}`)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
        const angle = (hash % 360) * Math.PI / 180;
        const meters = 60 + (Math.floor(hash / 360) % 240);
        const dLat = meters * Math.cos(angle) / 111320;
        const dLon = meters * Math.sin(angle) / (111320 * Math.cos(p.lat * Math.PI / 180));
        return [p.lat + dLat, p.lon + dLon];
    }

    function drawListings(points) {
        map.closePopup();
        listings = points.filter(p => p.lat != null && p.lon != null)
            .map(p => ({ p, at: L.latLng(placed(p)), html: popup(p) }));
        drawClusters();
    }

    /** The pins at this zoom. Pins that would overlap on screen become one numbered circle: greedy in ranking
     *  order, so the best match anchors its group. Runs again on every zoom. */
    function drawClusters() {
        if (!map || !pinLayer) return;
        pinLayer.clearLayers();
        const zoom = map.getZoom();
        const groups = [];
        listings.forEach(item => {
            const pt = map.project(item.at, zoom);
            const group = groups.find(g => Math.abs(g.x - pt.x) < CLUSTER_DX && Math.abs(g.y - pt.y) < CLUSTER_DY);
            if (group) group.items.push(item);
            else groups.push({ x: pt.x, y: pt.y, items: [item] });
        });
        groups.forEach(g => (g.items.length === 1 ? pricePin(g.items[0]) : clusterPin(g.items)).addTo(pinLayer));
    }

    function pricePin(item) {
        const p = item.p;
        const icon = L.divIcon({
            className: 'map-price-pin' + (p.approximate ? ' is-approx' : ''),
            html: `<span>${esc(shortMoney(p.price, p.currency))}</span>`,
            iconSize: null,
        });
        return L.marker(item.at, { icon, riseOnHover: true, title: p.title || '' })
            .bindPopup(item.html, { maxWidth: 280, minWidth: 220 });
    }

    /** "$650 – $1.2k" for a circle's tooltip; nothing when its listings are priced in different currencies */
    function priceRange(items) {
        const priced = items.map(item => item.p).filter(p => p.price != null);
        if (!priced.length || new Set(priced.map(p => p.currency || '')).size !== 1) return '';
        const values = priced.map(p => p.price);
        const low = Math.min(...values);
        const high = Math.max(...values);
        const currency = priced[0].currency;
        return low === high ? shortMoney(low, currency) : `${shortMoney(low, currency)} – ${shortMoney(high, currency)}`;
    }

    function clusterPin(items) {
        const bounds = L.latLngBounds(items.map(item => item.at));
        const size = items.length < 10 ? 36 : items.length < 100 ? 42 : 48;
        const icon = L.divIcon({
            className: 'map-cluster' + (items.every(item => item.p.approximate) ? ' is-approx' : ''),
            html: `<span>${items.length}</span>`,
            iconSize: [size, size],
        });
        const marker = L.marker(bounds.getCenter(), { icon, riseOnHover: true, zIndexOffset: 500 });
        const range = priceRange(items);
        if (range) marker.bindTooltip(esc(range), { direction: 'top', offset: [0, -size / 2] });
        marker.on('click', () => openCluster(items, bounds));
        return marker;
    }

    /** Can zooming in pull these pins apart? Not when they still share one spot at CLUSTER_MAX_ZOOM. */
    function separable(items) {
        const first = map.project(items[0].at, CLUSTER_MAX_ZOOM);
        return items.some(item => {
            const pt = map.project(item.at, CLUSTER_MAX_ZOOM);
            return Math.abs(pt.x - first.x) >= CLUSTER_DX || Math.abs(pt.y - first.y) >= CLUSTER_DY;
        });
    }

    function openCluster(items, bounds) {
        if (map.getZoom() < CLUSTER_MAX_ZOOM && separable(items)) {
            const target = Math.min(map.getBoundsZoom(bounds, false, L.point(120, 120)), CLUSTER_MAX_ZOOM);
            if (target > map.getZoom()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: CLUSTER_MAX_ZOOM });
            else map.setView(bounds.getCenter(), Math.min(map.getZoom() + 2, CLUSTER_MAX_ZOOM));
            return;
        }
        L.popup({ maxWidth: 300, minWidth: 240, className: 'map-list-popup' })
            .setLatLng(bounds.getCenter())
            .setContent(listPopup(items))
            .openOn(map);
    }

    /** Listings that zooming cannot separate: a list, each row opening the listing on its site */
    function listPopup(items) {
        const places = new Set(items.map(item => item.p.neighborhood || item.p.district).filter(Boolean));
        const place = places.size === 1 ? [...places][0] : '';
        const approx = items.every(item => item.p.approximate)
            ? ` <span class="map-pop-approx">${esc(tr('map_approx', 'approximate location'))}</span>` : '';
        const rows = items.slice(0, LIST_LIMIT).map(({ p }) => {
            const url = safeUrl(p.product_url);
            const image = safeUrl(p.image_url);
            const price = p.price != null
                ? `${esc(money(p.price, p.currency))}${p.monthly ? esc(tr('per_month', '/mo')) : ''}` : '';
            const body = `${image ? `<img class="map-list-img" src="${esc(image)}" alt="" loading="lazy">` : '<span class="map-list-img"></span>'}`
                + `<span class="map-list-text"><b>${price}</b><span>${esc([specs(p), p.title].filter(Boolean).join(' · '))}</span></span>`;
            return url
                ? `<a class="map-list-row" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
                : `<div class="map-list-row">${body}</div>`;
        }).join('');
        const more = items.length > LIST_LIMIT ? `<div class="map-list-more">+${items.length - LIST_LIMIT}</div>` : '';
        return `<div class="map-list"><div class="map-list-head"><b>${items.length}</b>${place ? ` · ${esc(place)}` : ''}${approx}</div>`
            + `<div class="map-list-rows">${rows}</div>${more}</div>`;
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
                } else if (Array.isArray(item.anchor.line) && item.anchor.line.length) {
                    // A street: the distance is to the street itself, not to a point in its middle
                    item.anchor.line.forEach(part => L.polyline(part.map(pt => [pt[1], pt[0]]), {
                        color: '#2563eb', weight: 6, opacity: 0.55, lineCap: 'round',
                    }).bindTooltip(esc(item.anchor.label)).addTo(nearLayer));
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
            if (item.relation === 'on') {
                const text = tr('map_on_street_format', '{place} · on this street').replace('{place}', label);
                notes.push(`<span class="map-chip"><i class="fa-solid fa-road"></i> ${esc(text)}</span>`);
            } else if (radius) {
                const text = tr('map_within_format', '{place} · within {distance}')
                    .replace('{place}', label).replace('{distance}', distance(radius));
                notes.push(`<span class="map-chip"><i class="fa-solid fa-ruler-horizontal"></i> ${esc(text)}</span>`);
            }
        }
        if (wantStations) await showStations(true);
        return notes;
    }

    /** Outline the neighborhood the search named. */
    function drawArea(area) {
        areaLayer.clearLayers();
        if (!area || !Array.isArray(area.rings)) return;
        area.rings.forEach(ring => {
            if (Array.isArray(ring) && ring.length >= 3) {
                L.polygon(ring, {
                    color: '#2563eb', weight: 2, dashArray: '6 4', fillColor: '#2563eb', fillOpacity: 0.06,
                    interactive: false,
                }).addTo(areaLayer);
            }
        });
    }

    function fit(points, near, focus) {
        // Hammasi taxminiy nuqta (mahalla, tuman yoki shahar markazi): ko'cha darajasiga emas, shahar darajasiga
        const located = points.filter(p => p.lat != null);
        const approximate = located.length > 0 && located.every(p => p.approximate);
        const maxZoom = approximate ? 13 : 16;
        // The API's focus: the neighborhood's outline, or the listings without a stray far-away point
        const anchored = (near || []).some(item => item.anchor && item.anchor.lat != null);
        if (!anchored && Array.isArray(focus) && focus.length === 2) {
            map.fitBounds(L.latLngBounds(focus), { padding: [40, 40], maxZoom });
            return;
        }
        const corners = located.map(p => [p.lat, p.lon]);
        (near || []).forEach(item => {
            if (item.anchor && item.anchor.lat != null) corners.push([item.anchor.lat, item.anchor.lon]);
            // Ko'cha: uylar taxminiy joyda (tuman markazi) bo'lsa butun chizig'i ko'rinsin — so'ralgan joy shu chiziq.
            // Aniq nuqtalar ko'cha bo'ylab yotadi: xarita uylarga moslashadi, uzun ko'cha uni uzoqlashtirmaydi
            if ((approximate || !located.length) && item.anchor && Array.isArray(item.anchor.line)) {
                item.anchor.line.forEach(part => (part || []).forEach(pt => corners.push([pt[1], pt[0]])));
            }
        });
        if (corners.length === 1) map.setView(corners[0], approximate ? 13 : 15);
        else if (corners.length) map.fitBounds(L.latLngBounds(corners), { padding: [40, 40], maxZoom });
        else map.setView(HOME_CENTER, HOME_ZOOM);
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

    function setLoading(on) {
        const box = element('results-map');
        if (box) box.classList.toggle('is-loading', on);
    }

    /** A search started on the Map tab. The last search's houses leave now, so the map never offers them as the
     *  answer to the new one; the next `show` draws the new houses and fits the map to them. */
    function loading() {
        drawnKey = null;
        pending++;      // a `show` still waiting for the previous search does not draw over this one
        if (!map) return;
        map.closePopup();
        listings = [];
        pinLayer.clearLayers();
        nearLayer.clearLayers();
        areaLayer.clearLayers();
        setLoading(true);
        setStatus(`<span class="map-muted"><i class="fa-solid fa-spinner fa-spin"></i> ${esc(tr('map_loading', 'Loading the map…'))}</span>`);
    }

    function failed(message) {
        setLoading(false);
        setStatus(`<span class="map-status-error">${esc(message || tr('map_unavailable', 'The map could not be loaded.'))}</span>`);
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
            setLoading(false);
            listings = [];
            pinLayer.clearLayers();
            nearLayer.clearLayers();
            areaLayer.clearLayers();
            await showStations(true);
            map.setView(HOME_CENTER, HOME_ZOOM);
            setStatus(`<span class="map-muted">${esc(tr('map_empty', 'Search for a home — the results will appear on this map.'))}</span>`);
            return;
        }
        if (key === drawnKey) return;

        const ticket = ++pending;
        setLoading(true);
        setStatus(`<span class="map-muted"><i class="fa-solid fa-spinner fa-spin"></i> ${esc(tr('map_loading', 'Loading the map…'))}</span>`);
        let data = null;
        let expired = false;
        if (ctx.searchId) {
            try {
                // The query lets the server run the search again when its ranked list has expired
                const again = ctx.query ? `?q=${encodeURIComponent(ctx.query)}` : '';
                const res = await fetch(`/api/geo/search/${encodeURIComponent(ctx.searchId)}/${again}`);
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
        drawArea(data.area);
        const notes = await drawNear(data.near || ctx.near || []);
        fit(data.points || [], data.near || ctx.near || [], data.focus);
        setLoading(false);
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
        loading,
        failed,
        /** A new search started: the next `show` draws it even under the same key. */
        reset() { drawnKey = null; },
    };
})();
