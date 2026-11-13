/*
 * Usage monitoring: which buttons and links people click, and how long they actively use the page.
 *
 * Counts are kept in the page and sent to /api/usage/ about once a minute and when the page is
 * hidden or closed (chat/usage.py). The FindleBot Telegram bot (/web) shows them to the admin.
 *
 * Only a button's name is recorded: its data-track, id or class, or a link's site. Never what the
 * user typed, message text or full addresses. Time counts only while the page is visible and the
 * user did something in the last two minutes (reading a result without scrolling still counts).
 */
(function () {
    'use strict';

    var ENDPOINT = '/api/usage/';
    var TICK_SECONDS = 15;
    var IDLE_MS = 120000;
    var FLUSH_MS = 60000;
    var CLICKABLE = [
        'button', 'a', '[role="button"]', '[data-track]', '[data-tab]', '[data-page]',
        '[data-open-search]', '[data-goto-search]', '.sr-suggestion', '.sr-cite', '.popover-item',
        '.active-tag', '.history-item', '.alert-item', '.alert-card', '.mention-item', '.search-tag',
        'input[type="submit"]', 'input[type="button"]', 'input[type="checkbox"]'
    ].join(', ');
    // Classes that say how an element looks, not what it is
    var GENERIC = {
        'active': 1, 'auth-required': 1, 'btn': 1, 'dropdown-item': 1, 'selected': 1, 'open': 1, 'show': 1,
        'disabled': 1, 'hidden': 1, 'is-active': 1, 'fa-solid': 1, 'fa-regular': 1
    };

    var clicks = {};
    var seconds = 0;
    var lastActivity = Date.now();
    var visitor = visitorId();

    function visitorId() {
        var id = null;
        try {
            id = window.localStorage.getItem('findle_vid');
        } catch (e) { /* storage blocked: an id for this page only */ }
        if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
            id = randomId();
            try {
                window.localStorage.setItem('findle_vid', id);
            } catch (e) { /* ignore */ }
        }
        return id;
    }

    function randomId() {
        var bytes = new Uint8Array(12);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(bytes);
        } else {
            for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }

    function withoutNumbers(text) {
        // "#chat-123" and "#chat-124" are the same button
        return text.replace(/\d+/g, 'N');
    }

    function targetOf(el) {
        var explicit = el.getAttribute('data-track');
        if (explicit) return explicit;
        if (el.id) return withoutNumbers('#' + el.id);
        var tab = el.getAttribute('data-tab');
        if (tab) return 'tab ' + tab;
        if (el.hasAttribute('data-page')) return 'pager';
        if (el.hasAttribute('data-open-search')) return 'open search';
        if (el.hasAttribute('data-goto-search')) return 'go to search';
        if (el.tagName === 'A') {
            var href = el.getAttribute('href') || '';
            if (href && href.charAt(0) !== '#' && href.indexOf('javascript:') !== 0) {
                try {
                    var url = new URL(href, window.location.href);
                    if (url.origin !== window.location.origin) return 'link ' + url.hostname.replace(/^www\./, '');
                    return withoutNumbers('link ' + url.pathname);
                } catch (e) { /* not a URL */ }
            }
        }
        var names = [];
        for (var i = 0; i < el.classList.length; i++) {
            if (!GENERIC[el.classList[i]]) names.push(el.classList[i]);
        }
        if (names.length) return withoutNumbers('.' + names[0]);
        // A plain button or menu link: its label, never text inside content the user wrote
        if (el.tagName === 'BUTTON' || el.tagName === 'A') {
            var label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '')
                .replace(/\s+/g, ' ').trim().slice(0, 40);
            if (label) return el.tagName.toLowerCase() + ' "' + label + '"';
        }
        return el.tagName.toLowerCase();
    }

    function onClick(event) {
        var start = event.target;
        if (!start || !start.closest) return;
        var el = start.closest(CLICKABLE);
        if (!el) return;
        var target = targetOf(el).slice(0, 100);
        clicks[target] = (clicks[target] || 0) + 1;
    }

    function touched() {
        lastActivity = Date.now();
    }

    function tick() {
        if (document.visibilityState === 'visible' && Date.now() - lastActivity < IDLE_MS) {
            seconds += TICK_SECONDS;
        }
    }

    function csrfToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta && meta.content) return meta.content;
        var match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function flush() {
        var targets = Object.keys(clicks);
        if (!seconds && !targets.length) return;
        var token = csrfToken();
        if (!token) return;
        var body = new URLSearchParams();
        body.append('csrfmiddlewaretoken', token);
        body.append('data', JSON.stringify({ visitor: visitor, seconds: Math.min(seconds, 120), clicks: clicks }));
        clicks = {};
        seconds = 0;
        var sent = false;
        try {
            sent = navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body);
        } catch (e) { sent = false; }
        if (!sent && window.fetch) {
            window.fetch(ENDPOINT, { method: 'POST', body: body, credentials: 'same-origin', keepalive: true })
                .catch(function () { /* monitoring must never disturb the page */ });
        }
    }

    document.addEventListener('click', onClick, true);
    ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart', 'mousemove'].forEach(function (name) {
        window.addEventListener(name, touched, { passive: true, capture: true });
    });
    window.setInterval(tick, TICK_SECONDS * 1000);
    window.setInterval(flush, FLUSH_MS);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flush();
        else touched();
    });
    window.addEventListener('pagehide', flush);
})();
