/* Alerts tab: a description that notifies when a new listing matches it.
 *
 * The Findle API keeps the alerts and, as listings are crawled and extracted, records the new ones
 * that match (the search's own conditions, no language model). This file draws the tab, the unread
 * number on it and the bell button's "save as alert". Notification cards are built by the Search
 * tab's own card builder (window.FindleCards), so a new listing here looks like a search result.
 */
(function () {
    'use strict';

    const POLL_MS = 60000;
    const PAGE = 24;

    const t = (key, fallback) => (window.t ? window.t(key, fallback) : fallback);

    function escapeHTML(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function csrfToken() {
        const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function request(method, url, body) {
        const headers = { 'Accept': 'application/json', 'X-CSRFToken': csrfToken() };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        try {
            const res = await fetch(url, {
                method, headers, credentials: 'same-origin',
                body: body !== undefined ? JSON.stringify(body) : undefined,
            });
            let data = {};
            try { data = await res.json(); } catch (e) { data = {}; }
            return { ok: res.ok, status: res.status, data: data || {} };
        } catch (e) {
            return { ok: false, status: 0, data: {} };
        }
    }

    function formatDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleString(document.documentElement.lang || undefined, {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        });
    }

    /* ── Unread number on the tab ─────────────────────────────────────── */

    const state = { unread: 0, alerts: [], selectedId: null, container: null, pollStarted: false };

    function setBadge(count) {
        state.unread = count || 0;
        document.querySelectorAll('#tab-alert, #landing-tab-alert').forEach(tab => {
            let badge = tab.querySelector('.alert-tab-badge');
            if (!state.unread) {
                if (badge) badge.remove();
                return;
            }
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'alert-tab-badge';
                tab.appendChild(badge);
            }
            badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
            badge.title = t('alert_unread_title', 'New matching listings');
        });
    }

    async function refreshBadge() {
        if (window.isAuthenticated !== true) return;
        const res = await request('GET', '/api/alerts/unread/');
        if (res.ok && res.data.status === 'success') setBadge(res.data.unread);
    }

    function startPolling() {
        if (state.pollStarted || window.isAuthenticated !== true) return;
        state.pollStarted = true;
        refreshBadge();
        setInterval(() => { if (!document.hidden) refreshBadge(); }, POLL_MS);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadge(); });
    }

    /* ── Toast ─────────────────────────────────────────────────────────── */

    function toast(message, kind) {
        const box = document.createElement('div');
        box.className = `alert-toast alert-toast-${kind === 'error' ? 'error' : 'success'}`;
        box.setAttribute('role', 'status');
        const icon = document.createElement('i');
        icon.className = kind === 'error' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-bell';
        const text = document.createElement('span');
        text.textContent = message;
        box.append(icon, text);
        document.body.appendChild(box);
        setTimeout(() => box.classList.add('hide'), kind === 'error' ? 6000 : 3500);
        setTimeout(() => box.remove(), kind === 'error' ? 6500 : 4000);
    }

    /* ── Create (bell button, the form in the tab) ─────────────────────── */

    async function create(query) {
        query = (query || '').trim();
        if (!query) {
            toast(t('alert_describe_first', 'Describe what you are looking for first.'), 'error');
            return null;
        }
        const res = await request('POST', '/api/alerts/', { query });
        if (!res.ok) {
            toast(res.data.message || t('alert_save_failed', 'Could not save the alert.'), 'error');
            return null;
        }
        const preview = res.data.preview || {};
        const count = Number(preview.current || 0);
        toast(count
            ? `${t('alert_saved', 'Alert saved. New matching listings will appear in Alerts.')} ${t('alert_matching_now', 'Matching now:')} ${count}`
            : t('alert_saved', 'Alert saved. New matching listings will appear in Alerts.'), 'success');
        refreshBadge();
        return res.data.alert || null;
    }

    /* ── The tab ───────────────────────────────────────────────────────── */

    function conditionChips(alert, limit) {
        const chips = (alert.conditions || []).slice(0, limit || 99);
        return chips.map(chip => `
            <span class="alert-chip" title="${escapeHTML(chip.label)}">
                ${chip.field === 'near' ? '<i class="fa-solid fa-location-dot"></i>' : ''}
                <span class="alert-chip-label">${escapeHTML(chip.label)}:</span> ${escapeHTML(chip.text)}
            </span>`).join('');
    }

    function layout(container, prefill) {
        container.innerHTML = `
            <div class="alerts-page-container">
                <div class="alerts-sidebar">
                    <div class="alerts-sidebar-header">
                        <div class="alerts-sidebar-header-left">
                            <div class="alerts-sidebar-icon"><i class="fa-solid fa-bell"></i></div>
                            <div>
                                <div class="alerts-sidebar-title">${escapeHTML(t('my_alerts', 'My alerts'))}</div>
                                <div class="alerts-sidebar-subtitle">${escapeHTML(t('alerts_subtitle', 'New listings that match your description'))}</div>
                            </div>
                        </div>
                        <span class="alerts-count-badge" id="alerts-count">0</span>
                    </div>
                    <form class="alert-new-form" id="alert-new-form" novalidate>
                        <textarea id="alert-new-input" class="alert-new-input" rows="2" maxlength="500"
                            placeholder="${escapeHTML(t('alert_new_placeholder', 'e.g. 2 bedroom in Mission under $4000'))}"></textarea>
                        <button type="submit" class="alert-new-btn" id="alert-new-btn">
                            <i class="fa-regular fa-bell"></i> ${escapeHTML(t('alert_create', 'Create alert'))}
                        </button>
                        <div class="alert-new-error" id="alert-new-error" hidden></div>
                    </form>
                    <div class="alerts-list-container" id="alerts-list"></div>
                </div>
                <div class="alert-detail-view" id="alert-detail"></div>
            </div>`;
        const input = container.querySelector('#alert-new-input');
        if (prefill) input.value = prefill;

        container.querySelector('#alert-new-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = container.querySelector('#alert-new-btn');
            const errorBox = container.querySelector('#alert-new-error');
            const query = input.value.trim();
            errorBox.hidden = true;
            if (!query) {
                errorBox.textContent = t('alert_describe_first', 'Describe what you are looking for first.');
                errorBox.hidden = false;
                return;
            }
            button.disabled = true;
            const res = await request('POST', '/api/alerts/', { query });
            button.disabled = false;
            if (!res.ok) {
                errorBox.textContent = res.data.message || t('alert_save_failed', 'Could not save the alert.');
                errorBox.hidden = false;
                return;
            }
            input.value = '';
            const alert = res.data.alert;
            await loadAlerts(alert ? alert.id : null, res.data.preview);
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                container.querySelector('#alert-new-form').requestSubmit();
            }
        });
    }

    function renderList() {
        const list = state.container.querySelector('#alerts-list');
        const count = state.container.querySelector('#alerts-count');
        if (count) count.textContent = String(state.alerts.length);
        if (!list) return;
        if (!state.alerts.length) {
            list.innerHTML = `
                <div class="alerts-list-empty">
                    <i class="fa-regular fa-bell-slash"></i>
                    <p>${escapeHTML(t('no_alerts_saved', 'No alerts saved yet'))}</p>
                    <span>${escapeHTML(t('alerts_how', 'Describe a listing above, or press the bell next to the search box.'))}</span>
                </div>`;
            return;
        }
        list.innerHTML = '';
        state.alerts.forEach(alert => {
            const item = document.createElement('div');
            item.className = 'alert-item' + (alert.id === state.selectedId ? ' active' : '') + (alert.active ? '' : ' paused');
            item.dataset.alertId = alert.id;
            const status = !alert.active
                ? `<span class="alert-status-paused"><i class="fa-solid fa-pause"></i> ${escapeHTML(t('alert_paused', 'Paused'))}</span>`
                : (alert.last_match_at
                    ? `<i class="fa-regular fa-clock"></i> ${escapeHTML(formatDate(alert.last_match_at))}`
                    : `<i class="fa-regular fa-clock"></i> ${escapeHTML(t('alert_waiting', 'Waiting for new listings'))}`);
            item.innerHTML = `
                <div class="alert-item-header">
                    <div class="alert-item-prompt">${escapeHTML(alert.name || alert.query)}</div>
                    ${alert.unread ? `<span class="alert-unread-badge">${alert.unread > 99 ? '99+' : alert.unread}</span>` : ''}
                </div>
                <div class="alert-item-chips">${conditionChips(alert, 3)}</div>
                <div class="alert-item-time">${status}</div>`;
            item.addEventListener('click', () => {
                selectAlert(alert.id);
                const page = state.container.querySelector('.alerts-page-container');
                if (page) page.classList.add('mobile-detail-active');
            });
            list.appendChild(item);
        });
    }

    function renderEmptyDetail() {
        const detail = state.container.querySelector('#alert-detail');
        if (!detail) return;
        detail.innerHTML = `
            <div class="alert-detail-empty">
                <div class="alert-detail-empty-icon"><i class="fa-regular fa-bell"></i></div>
                <h3>${escapeHTML(t('alerts_empty_title', 'Get told about new listings'))}</h3>
                <p>${escapeHTML(t('alerts_empty_text', 'Write what you are looking for. When a newly found listing matches it, it appears here and the Alerts tab shows a number.'))}</p>
            </div>`;
    }

    async function loadAlerts(selectId, preview) {
        const res = await request('GET', '/api/alerts/');
        if (!res.ok) {
            const list = state.container.querySelector('#alerts-list');
            if (list) {
                list.innerHTML = `<div class="alerts-list-empty error"><i class="fa-solid fa-triangle-exclamation"></i>
                    <p>${escapeHTML(res.data.message || t('alerts_unavailable', 'Alerts are unavailable right now. Try again later.'))}</p></div>`;
            }
            return;
        }
        state.alerts = res.data.alerts || [];
        setBadge(res.data.unread || 0);
        const keep = state.alerts.find(alert => alert.id === (selectId || state.selectedId));
        const first = keep || state.alerts.find(alert => alert.unread) || state.alerts[0];
        state.selectedId = first ? first.id : null;
        renderList();
        if (first) selectAlert(first.id, preview);
        else renderEmptyDetail();
    }

    function selectAlert(alertId, preview) {
        state.selectedId = alertId;
        state.container.querySelectorAll('.alert-item').forEach(item => {
            item.classList.toggle('active', Number(item.dataset.alertId) === alertId);
        });
        const alert = state.alerts.find(item => item.id === alertId);
        if (alert) renderDetail(alert, preview);
    }

    function renderDetail(alert, preview) {
        const detail = state.container.querySelector('#alert-detail');
        if (!detail) return;
        const matchingNow = preview && preview.current != null
            ? `<div class="alert-preview-note"><i class="fa-solid fa-circle-info"></i>
                ${escapeHTML(t('alert_matching_now', 'Matching now:'))} ${escapeHTML(preview.current)}.
                ${escapeHTML(t('alert_only_new', 'You will be told only about listings that appear from now on.'))}</div>`
            : '';
        detail.innerHTML = `
            <div class="alert-detail-content-wrapper">
                <div class="mobile-sticky-header">
                    <button class="mobile-back-btn" id="mobile-alert-back" type="button">
                        <i class="fa-solid fa-chevron-left"></i> ${escapeHTML(t('back', 'Back'))}
                    </button>
                </div>
                <div class="alert-detail-header">
                    <div class="alert-detail-main">
                        <div class="alert-detail-header-info">
                            <div class="alert-detail-title-wrapper">
                                <input type="text" id="alert-prompt-input" class="alert-detail-title-input" maxlength="500"
                                    value="${escapeHTML(alert.query)}" readonly>
                                <button class="edit-prompt-btn" id="edit-alert-prompt-btn" type="button" title="${escapeHTML(t('alert_edit', 'Edit description'))}">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                            </div>
                            <div class="alert-detail-meta">
                                <span class="alert-detail-meta-item"><i class="fa-regular fa-calendar"></i> ${escapeHTML(formatDate(alert.created_at))}</span>
                                <span class="alert-detail-meta-item"><i class="fa-regular fa-bell"></i> ${escapeHTML(t('alert_matches', 'Matches'))}: ${escapeHTML(alert.matches || 0)}</span>
                                <span class="alert-detail-meta-item ${alert.active ? 'alert-on' : 'alert-off'}">
                                    <i class="fa-solid ${alert.active ? 'fa-circle-check' : 'fa-circle-pause'}"></i>
                                    ${escapeHTML(alert.active ? t('alert_active', 'Active') : t('alert_paused', 'Paused'))}
                                </span>
                            </div>
                        </div>
                        <div class="alert-conditions" title="${escapeHTML(t('alert_conditions_title', 'How the description was understood'))}">${conditionChips(alert)}</div>
                        ${alert.ignored ? `<div class="alert-ignored"><i class="fa-regular fa-circle-question"></i>
                            ${escapeHTML(t('alert_ignored', 'Not used as conditions:'))} <em>${escapeHTML(alert.ignored)}</em></div>` : ''}
                        <div class="alert-edit-error" id="alert-edit-error" hidden></div>
                        ${matchingNow}
                    </div>
                    <div class="alert-detail-actions">
                        <button class="alert-action-btn" id="alert-toggle-btn" type="button">
                            <i class="fa-solid ${alert.active ? 'fa-pause' : 'fa-play'}"></i>
                            ${escapeHTML(alert.active ? t('alert_pause', 'Pause') : t('alert_resume', 'Resume'))}
                        </button>
                        <button class="alert-action-btn alert-action-btn-search" id="re-search-btn" type="button">
                            <i class="fa-solid fa-magnifying-glass"></i> ${escapeHTML(t('alert_search_now', 'Search now'))}
                        </button>
                        <button class="alert-action-btn alert-action-btn-delete" id="delete-alert-btn" type="button">
                            <i class="fa-regular fa-trash-can"></i> ${escapeHTML(t('delete', 'Delete'))}
                        </button>
                    </div>
                </div>
                <div class="alert-products-section">
                    <div class="alert-products-title">${escapeHTML(t('alert_new_listings', 'New listings'))}</div>
                    <div class="alert-products-grid" id="alert-cards"></div>
                    <div class="alert-products-empty" id="alert-cards-empty" hidden>
                        <i class="fa-regular fa-hourglass"></i>
                        ${escapeHTML(t('alert_no_listings', 'No new matching listings yet. They will appear here as soon as they are found.'))}
                    </div>
                    <button class="alert-load-more" id="alert-load-more" type="button" hidden>${escapeHTML(t('alert_load_more', 'Show more'))}</button>
                </div>
            </div>`;

        detail.querySelector('#mobile-alert-back').addEventListener('click', () => {
            const page = state.container.querySelector('.alerts-page-container');
            if (page) page.classList.remove('mobile-detail-active');
        });
        detail.querySelector('#alert-toggle-btn').addEventListener('click', () => update(alert, { active: !alert.active }));
        detail.querySelector('#re-search-btn').addEventListener('click', () => searchNow(alert.query));
        bindDelete(detail.querySelector('#delete-alert-btn'), alert);
        bindEdit(detail, alert);
        loadNotifications(alert, null);
    }

    function bindDelete(button, alert) {
        let armed = false;
        button.addEventListener('click', async () => {
            if (!armed) {
                armed = true;
                button.classList.add('confirm');
                button.innerHTML = `<i class="fa-regular fa-trash-can"></i> ${escapeHTML(t('delete_alert_confirm', 'Delete this alert?'))}`;
                setTimeout(() => {
                    if (!armed) return;
                    armed = false;
                    button.classList.remove('confirm');
                    button.innerHTML = `<i class="fa-regular fa-trash-can"></i> ${escapeHTML(t('delete', 'Delete'))}`;
                }, 4000);
                return;
            }
            armed = false;
            button.disabled = true;
            const res = await request('DELETE', `/api/alerts/${alert.id}/`);
            if (!res.ok) {
                button.disabled = false;
                toast(res.data.message || t('alert_save_failed', 'Could not save the alert.'), 'error');
                return;
            }
            state.selectedId = null;
            await loadAlerts(null);
        });
    }

    function bindEdit(detail, alert) {
        const input = detail.querySelector('#alert-prompt-input');
        const button = detail.querySelector('#edit-alert-prompt-btn');
        const errorBox = detail.querySelector('#alert-edit-error');
        let editing = false;
        const save = async () => {
            const query = input.value.trim();
            if (!query || query === alert.query) {
                input.value = alert.query;
                stop();
                return;
            }
            button.disabled = true;
            const res = await request('PATCH', `/api/alerts/${alert.id}/`, { query });
            button.disabled = false;
            if (!res.ok) {
                errorBox.textContent = res.data.message || t('alert_save_failed', 'Could not save the alert.');
                errorBox.hidden = false;
                input.focus();
                return;
            }
            replaceAlert(res.data.alert);
        };
        const stop = () => {
            editing = false;
            input.setAttribute('readonly', 'true');
            input.classList.remove('editing');
            button.innerHTML = '<i class="fa-solid fa-pen"></i>';
        };
        button.addEventListener('click', () => {
            if (!editing) {
                editing = true;
                errorBox.hidden = true;
                input.removeAttribute('readonly');
                input.classList.add('editing');
                input.focus();
                button.innerHTML = '<i class="fa-solid fa-check"></i>';
            } else {
                save();
            }
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && editing) save();
            if (event.key === 'Escape' && editing) {
                input.value = alert.query;
                errorBox.hidden = true;
                stop();
            }
        });
    }

    function replaceAlert(updated) {
        if (!updated) return;
        const index = state.alerts.findIndex(item => item.id === updated.id);
        if (index >= 0) state.alerts[index] = updated;
        renderList();
        selectAlert(updated.id);
    }

    async function update(alert, changes) {
        const res = await request('PATCH', `/api/alerts/${alert.id}/`, changes);
        if (!res.ok) {
            toast(res.data.message || t('alert_save_failed', 'Could not save the alert.'), 'error');
            return;
        }
        replaceAlert(res.data.alert);
    }

    function searchNow(query) {
        const input = document.getElementById('user-input');
        const tabAll = document.getElementById('tab-all');
        if (input) {
            input.value = query;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (tabAll) tabAll.click();
        const send = document.getElementById('send-btn');
        if (send) setTimeout(() => send.click(), 0);
    }

    async function loadNotifications(alert, before) {
        const grid = state.container.querySelector('#alert-cards');
        const empty = state.container.querySelector('#alert-cards-empty');
        const more = state.container.querySelector('#alert-load-more');
        if (!grid) return;
        const params = new URLSearchParams({ alert_id: alert.id, limit: PAGE });
        if (before) params.set('before', before);
        const res = await request('GET', `/api/alerts/notifications/?${params}`);
        if (state.selectedId !== alert.id) return;            // another alert was opened meanwhile
        if (!res.ok) {
            empty.hidden = false;
            empty.textContent = res.data.message || t('alerts_unavailable', 'Alerts are unavailable right now. Try again later.');
            return;
        }
        const items = res.data.items || [];
        const build = window.FindleCards && window.FindleCards.buildGridCard;
        items.forEach(item => {
            const wrapper = document.createElement('div');
            wrapper.className = 'alert-card' + (item.seen ? '' : ' unseen');
            wrapper.innerHTML = (build ? build(item.card) : `<div class="sr-grid-card">${escapeHTML(item.card.title)}</div>`) +
                `<div class="alert-card-meta">${item.seen ? '' : `<span class="alert-new-dot">${escapeHTML(t('alert_new', 'New'))}</span>`}
                 <span>${escapeHTML(formatDate(item.matched_at))}</span></div>`;
            grid.appendChild(wrapper);
        });
        empty.hidden = grid.children.length > 0;
        more.hidden = !res.data.next_before;
        more.onclick = () => {
            more.hidden = true;
            loadNotifications(alert, res.data.next_before);
        };
        if (!before && alert.unread) markSeen(alert);
    }

    async function markSeen(alert) {
        const res = await request('POST', '/api/alerts/notifications/seen/', { alert_id: alert.id });
        if (!res.ok) return;
        alert.unread = 0;
        setBadge(res.data.unread || 0);
        renderList();
    }

    async function render(container, prefill) {
        if (!container) return;
        state.container = container;
        if (window.isAuthenticated !== true) {
            container.innerHTML = `
                <div class="alerts-page-container"><div class="alerts-empty-full">
                    <div class="alerts-empty-icon-wrapper"><i class="fa-regular fa-bell"></i></div>
                    <h3>${escapeHTML(t('alerts_sign_in', 'Sign in to use alerts'))}</h3>
                </div></div>`;
            return;
        }
        layout(container, prefill);
        await loadAlerts(null);
    }

    window.FindleAlerts = { create, render, refreshBadge, setBadge };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startPolling);
    } else {
        startPolling();
    }
})();
