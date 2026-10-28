/* =========================================================
   raniadrz.dev OS — app.js
   Samsung Smart TV (Tizen 3.0+) · ES5 (Chromium 47 compatible)
   - AURA AI βοηθός μέσω Google Gemini API
   - Spatial focus system για τηλεχειριστήριο
   - Προφίλ χρηστών με προαιρετικό 4-ψήφιο PIN
   - LocalStorage: τελευταίο προφίλ (auto-login) + θέμα
   - Εκκίνηση Tizen εφαρμογών + ενσωματωμένος Media Player
   ========================================================= */
(function () {
    'use strict';

    /* ---------------- Σταθερές ---------------- */
    var KEY = {
        LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
        ENTER: 13,
        BACK: 10009,          // Samsung Return/Back
        BACKSPACE: 8,         // για δοκιμή σε υπολογιστή
        ESC: 27,              // για δοκιμή σε υπολογιστή
        PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252, STOP: 413,
        FAST_FORWARD: 417, REWIND: 412
    };

    var STORAGE = {
        PROFILES: 'raniadrzOS.profiles',
        LAST_PROFILE: 'raniadrzOS.lastProfile',
        THEME: 'raniadrzOS.theme',
        USAGE: 'raniadrzOS.usage',
        AI_MESSAGE: 'raniadrzOS.aiMessage',
        SETTINGS: 'raniadrzOS.settings',
        SERIES: 'raniadrzOS.series',
        RECS: 'raniadrzOS.recs',
        PROGRESS: 'raniadrzOS.progress',
        SCREEN: 'raniadrzOS.screenTime',
        WEATHER: 'raniadrzOS.weather'
    };

    /* ---------------- Ρύθμιση cloud (από το tv-config.js που φτιάχνει το npm run tv) ---------------- */
    var CONFIG = window.RANIADRZ_CONFIG || {};

    /* Google Gemini: το κλειδί μένει στο Vercel · η TV στέλνει τα αιτήματα στο /api/tv/gemini */
    var GEMINI = {
        TIMEOUT_MS: 60000,
        HISTORY_LIMIT: 12
    };

    var QUICK_PROMPTS = [
        'Τι να δω απόψε;',
        'Πρότεινέ μου μουσική',
        'Ιδέα για οικογενειακή βραδιά',
        'Πες μου ένα fun fact'
    ];

    var PIN_MAX_ATTEMPTS = 5;
    var PIN_LOCK_MS = 30000;

    var THEMES = [
        { id: 'neon-dark',  name: 'Pink Neon Dark' },
        { id: 'neon-light', name: 'Pink Neon Light' },
        { id: 'soft-light', name: 'Pink Soft Light' },
        { id: 'rose-gold',  name: 'Rose Gold' }
    ];
    var DEFAULT_THEME = 'neon-dark';

    // Ξεκινά χωρίς προφίλ: ο χρήστης δημιουργεί τα δικά του
    var DEFAULT_PROFILES = [];
    var MAX_PROFILES = 5;

    var SVG = {
        play: '<svg viewBox="0 0 24 24" width="56" height="56"><path fill="#fff" d="M8 5v14l11-7z"/></svg>',
        playSmall: '<svg viewBox="0 0 24 24" width="44" height="44"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
        pauseSmall: '<svg viewBox="0 0 24 24" width="44" height="44"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
        spotify: '<svg viewBox="0 0 64 64" width="84" height="84"><circle cx="32" cy="32" r="28" fill="#1ed760"/>' +
            '<path d="M17 24c10-3 22-2 31 3" stroke="#121212" stroke-width="5" fill="none" stroke-linecap="round"/>' +
            '<path d="M19 33c8-2 18-1 25 3" stroke="#121212" stroke-width="4" fill="none" stroke-linecap="round"/>' +
            '<path d="M21 41c6-1.5 13-1 18 2" stroke="#121212" stroke-width="3.4" fill="none" stroke-linecap="round"/></svg>',
        plex: '<svg viewBox="0 0 64 64" width="72" height="72"><path d="M20 8h14l14 24-14 24H20l14-24z" fill="#e5a00d"/></svg>',
        globe: '<svg viewBox="0 0 24 24" width="66" height="66"><path fill="#fff" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3zm.8 2h3a15.7 15.7 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.4-3.6C8.9 5.5 8.4 6.7 8.1 8zM12 20c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h3a8 8 0 0 1-4.4 3.6zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4z"/></svg>',
        film: '<svg viewBox="0 0 24 24" width="64" height="64"><path fill="#fff" d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm6.5 3-4.5 3V9l4.5 3zM18 17h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>',
        users: '<svg viewBox="0 0 24 24" width="66" height="66"><path fill="#fff" d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0h-1c1.2.9 2 2 2 3.5V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"/></svg>',
        sparkle: '<svg viewBox="0 0 24 24" width="66" height="66"><path fill="#fff" d="M10 2l2.2 6.3L18.5 10.5l-6.3 2.2L10 19l-2.2-6.3L1.5 10.5l6.3-2.2z"/><path fill="#fff" opacity=".85" d="M18.5 13l1.1 3.1 3.1 1.1-3.1 1.1-1.1 3.1-1.1-3.1-3.1-1.1 3.1-1.1z"/></svg>',
        lock: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z"/></svg>',
        check: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#fff" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>'
    };

    /* Samsung Tizen App IDs (ενδέχεται να διαφέρουν ανά περιοχή/μοντέλο) */
    var APPS = [
        { name: 'YouTube',      sub: 'Βίντεο',        icon: SVG.play,  iconCls: 'ic-youtube', tizenId: '111299001912' },
        { name: 'Netflix',      sub: 'Ταινίες & Σειρές', icon: 'N',    iconCls: 'ic-netflix', tizenId: '3201907018807' },
        { name: 'Prime Video',  sub: 'Ταινίες & Σειρές', icon: 'prime', iconCls: 'ic-prime',  tizenId: '3201910019365' },
        { name: 'Disney+',      sub: 'Οικογένεια',    icon: 'D+',      iconCls: 'ic-disney',  tizenId: '3201901017640' },
        { name: 'Apple TV',     sub: 'Ταινίες & Σειρές', icon: 'tv',   iconCls: 'ic-appletv', tizenId: '3201807016597' },
        { name: 'Spotify',      sub: 'Μουσική',       icon: SVG.spotify, iconCls: 'ic-spotify', tizenId: '3201606009684' },
        { name: 'Plex',         sub: 'Media Server',  icon: SVG.plex,  iconCls: 'ic-plex',    tizenId: '3201512006963' },
        { name: 'Internet',     sub: 'Browser',       icon: SVG.globe, iconCls: 'ic-browser', tizenId: 'org.tizen.browser', url: 'https://www.google.com' },
        { name: 'Media Player', sub: 'Ενσωματωμένο',  icon: SVG.film,  iconCls: 'ic-player',  internal: 'player' },
        { name: 'Σειρές AI',    sub: 'Προτάσεις για σένα', icon: SVG.sparkle, iconCls: 'ic-profiles', internal: 'series' }
    ];

    var VIDEOS = [
        { title: 'Big Buck Bunny',  sub: 'Blender Foundation · 9:56',  url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4' },
        { title: 'Elephants Dream', sub: 'Blender Foundation · 10:53', url: 'https://archive.org/download/ElephantsDream/ed_hd.mp4' },
        { title: 'Sintel',          sub: 'Blender Foundation · 14:48', url: 'https://archive.org/download/Sintel/sintel-2048-surround.mp4' },
        { title: 'Tears of Steel',  sub: 'Blender Foundation · 12:14', url: 'https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4' }
    ];

    var DAYS = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
    var MONTHS = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου',
        'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];

    /* AI Assistant: προτάσεις ανά ώρα της ημέρας */
    var PERIODS = {
        morning:   { label: 'ΠΡΩΙ',     picks: ['Spotify', 'YouTube', 'Internet'],
                     reason: 'Ιδανικό για το πρωί',
                     message: 'Καλημέρα! Ξεκίνα τη μέρα με λίγη μουσική ή τα νέα της ημέρας.' },
        afternoon: { label: 'ΑΠΟΓΕΥΜΑ', picks: ['YouTube', 'Disney+', 'Netflix'],
                     reason: 'Δημοφιλές το απόγευμα',
                     message: 'Ώρα για ένα διάλειμμα; Ετοίμασα προτάσεις για το απόγευμά σου.' },
        evening:   { label: 'ΒΡΑΔΥ',    picks: ['Netflix', 'Prime Video', 'Apple TV'],
                     reason: 'Ιδανικό για βραδινή ταινία',
                     message: 'Ιδανική βραδιά για ταινία. Διάλεξα τα καλύτερα για σένα.' },
        night:     { label: 'ΝΥΧΤΑ',    picks: ['YouTube', 'Spotify', 'Plex'],
                     reason: 'Χαλαρό για αργά το βράδυ',
                     message: 'Είναι αργά. Ίσως κάτι χαλαρό πριν τον ύπνο;' }
    };

    /* ---------------- State ---------------- */
    var state = {
        profiles: [],
        current: null,
        theme: DEFAULT_THEME,
        manageMode: false,
        actionsProfile: null
    };
    var focused = null;
    var dashboardFk = 'app-0';
    var modalStack = [];
    var pin = null;
    var pinLocks = {};      // { profileId: { fails: n, until: timestamp } }
    var toastTimer = null;
    var playerStateTimer = null;
    var playerIndex = 0;
    var typeTimer = null;
    var lastPeriod = null;
    var chat = { history: [], busy: false, started: false };
    var aiRequestKey = null;

    /* ---------------- Helpers ---------------- */
    function $(id) { return document.getElementById(id); }
    function toArray(list) { return Array.prototype.slice.call(list); }
    function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function hasTizen() { return typeof window.tizen !== 'undefined' && window.tizen !== null; }

    /* ---------------- LocalStorage ---------------- */
    var storage = {
        get: function (key, fallback) {
            try {
                var raw = window.localStorage.getItem(key);
                return raw === null ? fallback : JSON.parse(raw);
            } catch (e) {
                return fallback;
            }
        },
        set: function (key, value) {
            try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full / disabled */ }
        },
        remove: function (key) {
            try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
        }
    };

    function loadProfiles() {
        var saved = storage.get(STORAGE.PROFILES, null);
        if (!saved) {
            saved = clone(DEFAULT_PROFILES);
            storage.set(STORAGE.PROFILES, saved);
        }
        state.profiles = saved;
    }

    function saveProfiles() {
        storage.set(STORAGE.PROFILES, state.profiles);
        pushBridgeState();
    }

    function findProfile(id) {
        for (var i = 0; i < state.profiles.length; i++) {
            if (state.profiles[i].id === id) { return state.profiles[i]; }
        }
        return null;
    }

    /* Απλό hash για να μην αποθηκεύεται το PIN αυτούσιο (δεν είναι κρυπτογραφία) */
    function hashPin(value, salt) {
        var s = 'raniadrzOS|' + salt + '|' + value;
        var h1 = 5381, h2 = 52711, c;
        for (var i = 0; i < s.length; i++) {
            c = s.charCodeAt(i);
            h1 = ((h1 << 5) + h1) ^ c;
            h2 = ((h2 << 5) + h2) ^ (c * 31);
        }
        return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
    }

    /* ---------------- Tizen integration ---------------- */
    function registerKeys() {
        if (!hasTizen() || !tizen.tvinputdevice) { return; }
        var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        for (var i = 0; i < keys.length; i++) {
            try { tizen.tvinputdevice.registerKey(keys[i]); } catch (e) { /* key not supported */ }
        }
    }

    function exitApp() {
        try {
            if (hasTizen()) {
                tizen.application.getCurrentApplication().exit();
                return;
            }
        } catch (e) { /* fall through */ }
        showToast('Έξοδος εφαρμογής (διαθέσιμη μόνο στην TV)');
    }

    function launchApp(app) {
        trackUsage(app);
        if (app.internal === 'player') { openPlayer(); return; }
        if (app.internal === 'profiles') { openProfiles(); return; }
        if (app.internal === 'series') { openSeries(); return; }

        if (!hasTizen() || !tizen.application) {
            showToast(app.name + ': η εκκίνηση λειτουργεί μόνο σε Samsung TV');
            return;
        }
        showToast('Άνοιγμα ' + app.name + '…');
        try {
            tizen.application.launch(app.tizenId, function () { /* launched */ }, function () {
                if (app.url) { launchUrl(app); } else { showToast(app.name + ': η εφαρμογή δεν είναι εγκατεστημένη'); }
            });
        } catch (e) {
            if (app.url) { launchUrl(app); } else { showToast(app.name + ': αδυναμία εκκίνησης'); }
        }
    }

    function launchUrl(app) {
        try {
            var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', app.url, null, null, null);
            tizen.application.launchAppControl(control, null, function () { /* ok */ }, function () {
                showToast(app.name + ': αδυναμία εκκίνησης');
            }, null);
        } catch (e) {
            showToast(app.name + ': αδυναμία εκκίνησης');
        }
    }

    /* =========================================================
       FOCUS SYSTEM (spatial navigation)
       ========================================================= */
    function getScope() {
        return modalStack.length ? modalStack[modalStack.length - 1].el : $('dashboard');
    }

    function isVisible(el) {
        return el.offsetWidth > 0 && el.offsetHeight > 0;
    }

    function getFocusables(scope) {
        return toArray(scope.querySelectorAll('.focusable')).filter(isVisible);
    }

    function setFocus(el) {
        if (!el) { return; }
        if (focused && focused !== el) { focused.classList.remove('focused'); }
        focused = el;
        el.classList.add('focused');
        if (!modalStack.length) { dashboardFk = el.getAttribute('data-fk'); }
    }

    function focusByFk(scope, fk) {
        var list = getFocusables(scope);
        if (!list.length) { return; }
        if (fk) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].getAttribute('data-fk') === fk) { setFocus(list[i]); return; }
            }
        }
        setFocus(list[0]);
    }

    function moveFocus(dir) {
        var scope = getScope();
        var list = getFocusables(scope);
        if (!list.length) { return; }
        if (!focused || list.indexOf(focused) === -1) { setFocus(list[0]); return; }

        var a = focused.getBoundingClientRect();
        var ax = a.left + a.width / 2;
        var ay = a.top + a.height / 2;
        var best = null;
        var bestScore = Infinity;
        var loose = null;
        var looseScore = Infinity;
        var myRow = focused.closest ? focused.closest('[data-nav-row]') : null;

        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (el === focused) { continue; }
            var r = el.getBoundingClientRect();
            var bx = r.left + r.width / 2;
            var by = r.top + r.height / 2;
            var dx = bx - ax;
            var dy = by - ay;
            var main, cross;

            if (dir === 'left' || dir === 'right') {
                if (dir === 'left' && dx > -4) { continue; }
                if (dir === 'right' && dx < 4) { continue; }
                // Χωρίς οριζόντια επικάλυψη: κράτα το ως εναλλακτικό στόχο
                // μόνο αν ανήκει στην ίδια ζώνη (header / main / settings bar)
                if (r.bottom <= a.top + 4 || r.top >= a.bottom - 4) {
                    var elRow = el.closest ? el.closest('[data-nav-row]') : null;
                    if (elRow === myRow) {
                        var ls = Math.abs(dx) + Math.abs(dy) * 1.5;
                        if (ls < looseScore) { looseScore = ls; loose = el; }
                    }
                    continue;
                }
                main = Math.abs(dx);
                cross = Math.abs(dy);
            } else {
                if (dir === 'up' && dy > -4) { continue; }
                if (dir === 'down' && dy < 4) { continue; }
                // Χωρίς κάθετη επικάλυψη (άλλη στήλη): εναλλακτικός στόχος μόνο
                // όταν περνάμε σε άλλη ζώνη (π.χ. main → header) ή μέσα σε modal
                if (r.right <= a.left + 4 || r.left >= a.right - 4) {
                    var vRow = el.closest ? el.closest('[data-nav-row]') : null;
                    if (vRow !== myRow || myRow === null) {
                        var vs = Math.abs(dy) + Math.abs(dx) * 1.5;
                        if (vs < looseScore) { looseScore = vs; loose = el; }
                    }
                    continue;
                }
                main = Math.abs(dy);
                cross = Math.abs(dx);
            }

            var score = main + cross * 2.2;
            if (score < bestScore) { bestScore = score; best = el; }
        }

        if (best) { setFocus(best); } else if (loose) { setFocus(loose); }
    }

    /* ---------------- Modals ---------------- */
    function topModalId() {
        return modalStack.length ? modalStack[modalStack.length - 1].id : null;
    }

    function openModal(id, focusFk) {
        var el = $(id);
        el.classList.remove('hidden');
        modalStack.push({ id: id, el: el, prevFk: focused ? focused.getAttribute('data-fk') : null });
        focusByFk(el, focusFk || null);
        pushBridgeState();
    }

    function closeModal() {
        var entry = modalStack.pop();
        if (!entry) { return; }
        entry.el.classList.add('hidden');
        if (entry.id === 'player-modal') { stopPlayer(); }
        if (entry.id === 'pin-modal') { pin = null; }
        if (entry.id === 'profile-modal') { state.manageMode = false; }
        focusByFk(getScope(), entry.prevFk);
        pushBridgeState();
    }

    function closeAllModals() {
        while (modalStack.length) { closeModal(); }
        focusByFk($('dashboard'), dashboardFk);
    }

    /* ---------------- Toast ---------------- */
    function showToast(msg) {
        var t = $('toast');
        t.textContent = msg;
        t.classList.remove('hidden');
        // επανεκκίνηση animation
        t.style.animation = 'none';
        t.style.webkitAnimation = 'none';
        void t.offsetWidth;
        t.style.animation = '';
        t.style.webkitAnimation = '';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2800);
    }

    /* =========================================================
       THEMES
       ========================================================= */
    function isValidTheme(id) {
        for (var i = 0; i < THEMES.length; i++) { if (THEMES[i].id === id) { return true; } }
        return false;
    }

    function applyTheme(id, announce) {
        if (!isValidTheme(id)) { id = DEFAULT_THEME; }
        state.theme = id;
        applyBodyClass();
        storage.set(STORAGE.THEME, id);
        pushBridgeState();

        var chips = toArray(document.querySelectorAll('.theme-chip'));
        for (var i = 0; i < chips.length; i++) {
            chips[i].classList.toggle('active', chips[i].getAttribute('data-theme') === id);
        }
        if (announce) {
            for (var j = 0; j < THEMES.length; j++) {
                if (THEMES[j].id === id) { showToast('Θέμα: ' + THEMES[j].name); }
            }
        }
    }

    function renderThemeBar() {
        var html = '';
        for (var i = 0; i < THEMES.length; i++) {
            var t = THEMES[i];
            html += '<div class="theme-chip focusable" data-action="set-theme" data-theme="' + t.id + '" data-fk="theme-' + t.id + '">' +
                '<span class="swatch sw-' + t.id + '"></span>' +
                '<span>' + escapeHtml(t.name) + '</span>' +
                '<span class="chip-check">' + SVG.check + '</span>' +
                '</div>';
        }
        $('theme-bar').innerHTML = html;
    }

    /* =========================================================
       DASHBOARD
       ========================================================= */
    function renderApps() {
        var html = '';
        for (var i = 0; i < APPS.length; i++) {
            var app = APPS[i];
            html += '<div class="app-tile glass hud focusable" data-action="launch-app" data-index="' + i + '" data-fk="app-' + i + '">' +
                '<span class="shine"></span>' +
                '<div class="tile-index mono">' + pad2(i + 1) + '</div>' +
                '<div class="app-icon ' + app.iconCls + '">' + app.icon + '</div>' +
                '<div class="app-name">' + escapeHtml(app.name) + '</div>' +
                '<div class="app-sub muted">' + escapeHtml(app.sub) + '</div>' +
                '<span class="tile-bar"></span>' +
                '</div>';
        }
        $('apps-grid').innerHTML = html;
        $('apps-count').textContent = pad2(APPS.length) + ' APPS';
    }

    function avatarHtml(profile) {
        return '<span>' + escapeHtml(profile.name.charAt(0).toUpperCase()) + '</span>';
    }

    function setAvatar(el, profile, sizeCls) {
        if (profile) {
            el.className = 'avatar ' + sizeCls + ' av-' + profile.color;
            el.innerHTML = avatarHtml(profile);
        } else {
            el.className = 'avatar ' + sizeCls + ' av-none';
            el.innerHTML = '<span>?</span>';
        }
    }

    function renderBadge() {
        setAvatar($('badge-avatar'), state.current, 'avatar-sm');
        $('badge-name').textContent = state.current ? state.current.name : 'Σύνδεση';
    }

    function updateGreeting() {
        var h = new Date().getHours();
        var word;
        if (h >= 5 && h < 12) { word = 'Καλημέρα'; }
        else if (h >= 12 && h < 20) { word = 'Καλησπέρα'; }
        else { word = 'Καλό βράδυ'; }
        $('greeting-title').textContent = state.current ? word + ', ' + state.current.name : word;
    }

    function updateClock() {
        var d = new Date();
        $('clock-time').innerHTML = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) +
            (settings.seconds ? '<span class="clock-sec">' + pad2(d.getSeconds()) + '</span>' : '');
        $('clock-date').textContent = DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
        if (d.getSeconds() === 0) { updateGreeting(); }
        if (dayPeriod() !== lastPeriod) { renderAI(true); }
    }

    function startClock() {
        updateClock();
        setInterval(function () { updateClock(); tickSecond(); }, 1000);
    }

    /* =========================================================
       AI ASSISTANT (τοπικές έξυπνες προτάσεις)
       ========================================================= */
    function dayPeriod() {
        var h = new Date().getHours();
        if (h >= 5 && h < 12) { return 'morning'; }
        if (h >= 12 && h < 18) { return 'afternoon'; }
        if (h >= 18 && h < 23) { return 'evening'; }
        return 'night';
    }

    function getUsage() {
        var all = storage.get(STORAGE.USAGE, {});
        return (state.current && all[state.current.id]) || {};
    }

    function trackUsage(app) {
        if (!state.current || app.internal === 'profiles') { return; }
        var all = storage.get(STORAGE.USAGE, {});
        var mine = all[state.current.id] || {};
        mine[app.name] = (mine[app.name] || 0) + 1;
        all[state.current.id] = mine;
        storage.set(STORAGE.USAGE, all);
        renderSuggestions();
    }

    function timesText(n) {
        return n === 1 ? '1 φορά' : n + ' φορές';
    }

    function buildSuggestions() {
        var usage = getUsage();
        var period = PERIODS[dayPeriod()];
        var list = [];
        for (var i = 0; i < APPS.length; i++) {
            var app = APPS[i];
            if (app.internal === 'profiles') { continue; }
            var count = usage[app.name] || 0;
            var pickPos = period.picks.indexOf(app.name);
            var timeBonus = pickPos >= 0 ? (3 - pickPos) * 2 : 0;
            var reason;
            if (count >= 3) { reason = 'Αγαπημένο σου · ' + timesText(count); }
            else if (count > 0) { reason = 'Το άνοιξες ' + timesText(count); }
            else if (timeBonus) { reason = period.reason; }
            else { reason = 'Μπορεί να σου αρέσει'; }
            list.push({ index: i, app: app, count: count, score: count * 3 + timeBonus + (10 - i) * 0.01, reason: reason });
        }
        list.sort(function (a, b) { return b.score - a.score; });
        list = list.slice(0, 3);
        var max = list.length ? list[0].score : 1;
        for (var j = 0; j < list.length; j++) {
            list[j].match = Math.max(60, Math.min(99, Math.round(70 + (list[j].score / (max || 1)) * 28) - j * 3));
        }
        return list;
    }

    function renderSuggestions() {
        var prevFk = focused ? focused.getAttribute('data-fk') : null;
        var items = buildSuggestions();
        var html = '';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            html += '<div class="sug-item focusable" data-action="launch-app" data-index="' + it.index + '" data-fk="sug-' + i + '">' +
                '<div class="sug-icon ' + it.app.iconCls + '">' + it.app.icon + '</div>' +
                '<div class="sug-text"><div class="sug-name">' + escapeHtml(it.app.name) + '</div>' +
                '<div class="sug-reason muted">' + escapeHtml(it.reason) + '</div></div>' +
                '<div class="sug-score"><div class="sug-match mono">' + it.match + '%</div>' +
                '<div class="sug-meter"><i style="width:' + it.match + '%"></i></div></div>' +
                '</div>';
        }
        $('ai-suggestions').innerHTML = html;

        if (focused && !document.body.contains(focused)) {
            focused = null;
            if (!modalStack.length) { focusByFk($('dashboard'), prevFk); }
        }
        return items;
    }

    function typeMessage(text, animate) {
        var el = $('ai-text');
        clearInterval(typeTimer);
        if (!animate) { el.textContent = text; return; }
        var n = 0;
        el.textContent = '';
        typeTimer = setInterval(function () {
            n += 1;
            el.textContent = text.slice(0, n);
            if (n >= text.length) { clearInterval(typeTimer); }
        }, 28);
    }

    function renderAI(animate) {
        lastPeriod = dayPeriod();
        var period = PERIODS[lastPeriod];
        $('ai-period').textContent = period.label;
        var items = renderSuggestions();
        var msg = period.message;
        if (items.length && items[0].count > 0) {
            msg += ' Βλέπω ότι σου αρέσει το ' + items[0].app.name + '.';
        }
        var cont = continueWatching();
        if (cont) { msg = 'Έμεινες στο «' + cont.title + '» ' + progressLabel(cont) + '. Συνέχισε από εκεί που σταμάτησες!'; }
        typeMessage(msg, animate);
        refreshAiMessage(items);
    }

    /* =========================================================
       GEMINI API
       ========================================================= */
    function geminiText(data) {
        try {
            var parts = data.candidates[0].content.parts;
            var out = '';
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].text && !parts[i].thought) { out += parts[i].text; }
            }
            return out.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*[\*\-]\s+/gm, '• ').trim();
        } catch (e) {
            return '';
        }
    }

    function geminiRequest(contents, system, maxTokens, cb, extraConfig, extraBody) {
        var xhr = new XMLHttpRequest();
        var done = false;
        function finish(err, text) { if (done) { return; } done = true; cb(err, text); }

        var base = cloudBase();
        if (!base || !CONFIG.tvKey) { setTimeout(function () { finish('Το AI χρειάζεται σύνδεση με το cloud (Ρυθμίσεις → Web Companion)'); }, 0); return; }
        xhr.open('POST', base + '/api/tv/gemini', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('x-tv-key', CONFIG.tvKey);
        xhr.timeout = GEMINI.TIMEOUT_MS;
        xhr.onload = function () {
            var data = null;
            try { data = JSON.parse(xhr.responseText); } catch (e) { /* invalid json */ }
            if (xhr.status !== 200 || !data) {
                var msg = data && data.error && data.error.message ? data.error.message : 'HTTP ' + xhr.status;
                finish(msg);
                return;
            }
            var text = geminiText(data);
            if (text) { finish(null, text); } else { finish('Κενή απάντηση από το Gemini'); }
        };
        xhr.onerror = function () { finish('Δεν υπάρχει σύνδεση στο Internet'); };
        xhr.ontimeout = function () { finish('Το Gemini άργησε να απαντήσει'); };
        xhr.send(JSON.stringify({ body: mergeConfig({
            systemInstruction: { parts: [{ text: system }] },
            contents: contents,
            generationConfig: mergeConfig({ maxOutputTokens: maxTokens, temperature: 0.8 }, extraConfig)
        }, extraBody) }));
    }

    function favoriteApps() {
        var usage = getUsage();
        var names = [];
        for (var k in usage) { if (usage.hasOwnProperty(k)) { names.push(k); } }
        names.sort(function (a, b) { return usage[b] - usage[a]; });
        return names.slice(0, 3);
    }

    function auraSystemPrompt() {
        var d = new Date();
        var names = [];
        for (var i = 0; i < APPS.length; i++) { if (!APPS[i].internal || APPS[i].internal === 'player') { names.push(APPS[i].name); } }
        var fav = favoriteApps();
        return 'Είσαι η AURA, ο AI βοηθός του raniadrz.dev OS, ενός launcher σε Samsung Smart TV. ' +
            'Μιλάς πάντα ελληνικά, φιλικά και σύντομα (έως 4 προτάσεις), χωρίς markdown, χωρίς emoji και χωρίς λίστες με αστερίσκους. ' +
            'Ο χρήστης διαβάζει από απόσταση στην τηλεόραση, οπότε γράφε απλά και καθαρά. ' +
            'Χρήστης: ' + (state.current ? state.current.name : 'Επισκέπτης') + '. ' +
            'Τώρα είναι ' + DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ώρα ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + '. ' +
            'Εφαρμογές στην τηλεόραση: ' + names.join(', ') + '. ' +
            'Όταν προτείνεις κάτι να δει ή να ακούσει, ανέφερε με το ακριβές όνομα σε ποια από αυτές τις εφαρμογές θα το βρει.' +
            (fav.length ? ' Αγαπημένες εφαρμογές του χρήστη: ' + fav.join(', ') + '.' : '');
    }

    function setAiStatus(text) {
        $('ai-status-text').textContent = text;
    }

    /* Ζωντανό μήνυμα αρχικής οθόνης (1 κλήση ανά προφίλ / ημέρα / περίοδο, με cache) */
    var groundingOk = true;

    function refreshAiMessage(items) {
        if (!state.current) { setAiStatus('GEMINI · ΑΝΑΜΟΝΗ'); return; }
        if (!settings.aiGreeting) { setAiStatus('LOCAL · AI ΑΝΕΝΕΡΓΟ'); return; }
        var d = new Date();
        var cont = continueWatching();
        var favs = getFavs();
        var key = state.current.id + '|' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '|' + lastPeriod +
            '|' + (cont ? cont.title + progressLabel(cont) : '') + '|' + favs.join(',') + '|' + (weather.text ? 'w' : '');
        var cached = storage.get(STORAGE.AI_MESSAGE, null);
        if (cached && cached.key === key && cached.text) {
            setAiStatus('GEMINI · BRIEFING');
            typeMessage(cached.text, true);
            return;
        }
        if (aiRequestKey === key) { return; }
        aiRequestKey = key;
        setAiStatus('GEMINI · BRIEFING…');

        var prompt = 'Γράψε το ημερήσιο briefing της αρχικής οθόνης της τηλεόρασης: ΕΝΑ σύντομο, ζεστό μήνυμα (έως 130 χαρακτήρες). ' +
            'Χωρίς χαιρετισμό με το όνομα (υπάρχει ήδη), χωρίς εισαγωγικά, χωρίς emoji. Είναι ' + PERIODS[lastPeriod].label.toLowerCase() + '. ' +
            (weather.text ? 'Καιρός τώρα: ' + weather.text + '. ' : '') +
            (cont ? 'Ο χρήστης έμεινε στο «' + cont.title + '» ' + progressLabel(cont) + ': υπενθύμισέ του να συνεχίσει. ' : '') +
            (favs.length ? 'Αγαπημένες σειρές: ' + favs.join(', ') + '. ' : '') +
            (!cont && items && items.length ? 'Μπορείς να προτείνεις διακριτικά το ' + items[0].app.name + '. ' : '');
        // Νέα επεισόδια μόνο με αναζήτηση Google· χωρίς αυτήν το μοντέλο μπορεί να «μαντέψει» λάθος
        var contents = [{ role: 'user', parts: [{ text: prompt + 'Μην αναφέρεις νέες σεζόν ή επεισόδια.' }] }];
        var groundedContents = [{ role: 'user', parts: [{ text: prompt + 'Ψάξε στο web αν κάποια από τις αγαπημένες έχει νέα σεζόν ή επεισόδια αυτές τις μέρες και ανέφερέ το μόνο αν το επιβεβαιώνει η αναζήτηση.' }] }];

        function done(err, text) {
            if (aiRequestKey !== key) { return; }   // άλλαξε προφίλ/περίοδος στο μεταξύ
            aiRequestKey = null;
            if (err) { setAiStatus('LOCAL · OFFLINE'); return; }
            text = text.replace(/\[\d+(,\s*\d+)*\]/g, '').replace(/^["«]+|["»]+$/g, '').replace(/^\s+|\s+$/g, '');
            if (text.length > 160) { text = text.slice(0, 157) + '…'; }
            storage.set(STORAGE.AI_MESSAGE, { key: key, text: text });
            setAiStatus('GEMINI · BRIEFING');
            typeMessage(text, true);
        }

        // Πρώτα με αναζήτηση Google (αν το επιτρέπει το πλάνο του κλειδιού), αλλιώς χωρίς
        if (groundingOk && favs.length) {
            geminiRequest(groundedContents, auraSystemPrompt(), 500, function (err, text) {
                if (err) { groundingOk = false; geminiRequest(contents, auraSystemPrompt(), 400, done); return; }
                done(null, text);
            }, null, { tools: [{ google_search: {} }] });
        } else {
            geminiRequest(contents, auraSystemPrompt(), 400, done);
        }
    }

    /* =========================================================
       AURA CHAT
       ========================================================= */
    function resetChat() {
        chat.history = [];
        chat.busy = false;
        chat.started = false;
        $('chat-log').innerHTML = '';
    }

    function renderQuickPrompts() {
        var html = '';
        for (var i = 0; i < QUICK_PROMPTS.length; i++) {
            html += '<div class="quick-chip focusable" data-action="chat-quick" data-index="' + i + '" data-fk="quick-' + i + '">' +
                escapeHtml(QUICK_PROMPTS[i]) + '</div>';
        }
        $('chat-quick').innerHTML = html;
    }

    function openChat() {
        renderQuickPrompts();
        if (!chat.started) {
            chat.started = true;
            appendChatMessage('ai', 'Γεια σου' + (state.current ? ', ' + state.current.name : '') +
                '! Είμαι η AURA. Ρώτα με ό,τι θέλεις ή διάλεξε μία από τις γρήγορες ερωτήσεις.');
        }
        openModal('chat-modal', 'quick-0');
        scrollChat();
    }

    function scrollChat() {
        var log = $('chat-log');
        log.scrollTop = log.scrollHeight;
    }

    function setChatState(text) {
        $('chat-state').textContent = text;
    }

    function removeChatActions() {
        var old = toArray($('chat-log').querySelectorAll('.chat-actions'));
        for (var i = 0; i < old.length; i++) {
            if (focused && old[i].contains(focused)) { focused = null; focusByFk($('chat-modal'), 'chat-input'); }
            old[i].parentNode.removeChild(old[i]);
        }
    }

    function appendChatMessage(who, text, isError) {
        var row = document.createElement('div');
        row.className = 'msg-row ' + who;
        var meta = who === 'user' ? (state.current ? state.current.name : 'Εσύ') : 'AURA';
        row.innerHTML = '<div class="msg-meta tech ' + (who === 'ai' ? 'hud-label' : 'muted') + '">' + escapeHtml(meta.toUpperCase()) + '</div>' +
            '<div class="msg ' + (who === 'user' ? 'msg-user' : 'msg-ai') + (isError ? ' msg-error' : '') + '"></div>';
        row.querySelector('.msg').textContent = text;
        $('chat-log').appendChild(row);
        scrollChat();
        return row;
    }

    /* Κουμπιά «Άνοιγμα X» για εφαρμογές που αναφέρει η απάντηση */
    function appendAppActions(row, text) {
        var lower = text.toLowerCase();
        var html = '';
        var found = 0;
        for (var i = 0; i < APPS.length && found < 3; i++) {
            var app = APPS[i];
            if (app.internal === 'profiles') { continue; }
            if (lower.indexOf(app.name.toLowerCase()) !== -1) {
                html += '<div class="btn btn-sm focusable" data-action="launch-app" data-index="' + i + '" data-fk="chat-open-' + i + '">▶ Άνοιγμα ' + escapeHtml(app.name) + '</div>';
                found++;
            }
        }
        if (html) {
            var box = document.createElement('div');
            box.className = 'chat-actions';
            box.innerHTML = html;
            row.appendChild(box);
            scrollChat();
        }
    }

    function sendChat(text) {
        var input = $('chat-input');
        text = (text || input.value || '').replace(/^\s+|\s+$/g, '');
        if (!text || chat.busy) { return; }
        input.value = '';
        removeChatActions();
        appendChatMessage('user', text);
        chat.history.push({ role: 'user', parts: [{ text: text }] });
        chat.busy = true;
        setChatState('ΣΚΕΦΤΕΤΑΙ…');

        var typing = document.createElement('div');
        typing.className = 'msg-row ai';
        typing.innerHTML = '<div class="msg-meta tech hud-label">AURA</div><div class="msg msg-ai typing"><i></i><i></i><i></i></div>';
        $('chat-log').appendChild(typing);
        scrollChat();

        geminiRequest(chat.history.slice(-GEMINI.HISTORY_LIMIT), auraSystemPrompt(), 700, function (err, reply) {
            chat.busy = false;
            if (typing.parentNode) { typing.parentNode.removeChild(typing); }
            if (err) {
                chat.history.pop();
                setChatState('ΣΦΑΛΜΑ');
                appendChatMessage('ai', 'Δεν μπόρεσα να απαντήσω: ' + err, true);
                return;
            }
            chat.history.push({ role: 'model', parts: [{ text: reply }] });
            setChatState('ΕΤΟΙΜΗ');
            appendAppActions(appendChatMessage('ai', reply), reply);
        });
    }

    /* =========================================================
       PROFILES
       ========================================================= */
    function openProfiles() {
        state.manageMode = false;
        renderProfiles();
        openModal('profile-modal', state.current ? 'profile-' + state.current.id : null);
    }

    function renderProfiles() {
        var prevFk = focused ? focused.getAttribute('data-fk') : null;
        var empty = !state.profiles.length;
        var manage = state.manageMode && !empty;
        state.manageMode = manage;
        var html = '';

        for (var i = 0; i < state.profiles.length; i++) {
            var p = state.profiles[i];
            var isCurrent = state.current && state.current.id === p.id;
            var meta;
            if (manage) {
                meta = p.pinHash ? SVG.lock + 'PIN · Διαγραφή' : 'PIN · Διαγραφή';
            } else {
                meta = (p.pinHash ? SVG.lock + 'Με PIN' : 'Χωρίς PIN') + (p.limit ? ' · ' + remainingLabel(p) : '');
            }
            html += '<div class="profile-card focusable" data-action="pick-profile" data-id="' + p.id + '" data-fk="profile-' + p.id + '">' +
                (isCurrent && !manage ? '<span class="profile-current">ΕΝΕΡΓΟ</span>' : '') +
                '<div class="avatar avatar-lg av-' + p.color + '">' + avatarHtml(p) + '</div>' +
                '<div class="profile-name">' + escapeHtml(p.name) + '</div>' +
                '<div class="profile-meta muted">' + meta + '</div>' +
                '</div>';
        }
        if (!manage && state.profiles.length < MAX_PROFILES) {
            html += '<div class="profile-card profile-add focusable" data-action="add-profile" data-fk="profile-add">' +
                '<div class="add-plus">+</div>' +
                '<div class="profile-name">Νέο προφίλ</div>' +
                '<div class="profile-meta muted">Δημιουργία</div>' +
                '</div>';
        }
        $('profiles-list').innerHTML = html;

        $('profile-modal-title').textContent = manage ? 'Διαχείριση προφίλ' : (empty ? 'Καλώς ήρθες!' : 'Ποιος βλέπει;');
        $('profile-modal-sub').textContent = manage ?
            'Επίλεξε προφίλ για να ορίσεις / αλλάξεις PIN ή να το διαγράψεις' :
            (empty ? 'Δημιούργησε το πρώτο σου προφίλ για να ξεκινήσεις' : 'Επίλεξε το προφίλ σου');
        $('btn-manage').textContent = manage ? 'Τέλος διαχείρισης' : 'Διαχείριση προφίλ';
        $('btn-manage').classList.toggle('hidden', empty);
        $('btn-close-profiles').classList.toggle('hidden', !state.current);

        // Αν τα κουμπιά ξαναδημιουργήθηκαν, επανέφερε το focus
        if (topModalId() === 'profile-modal' && focused && !document.body.contains(focused)) {
            focused = null;
            focusByFk($('profile-modal'), prevFk);
        }
    }

    function setManageMode(on) {
        state.manageMode = on;
        renderProfiles();
    }

    function pickProfile(profile) {
        if (!profile) { return; }
        if (state.manageMode) { manageProfile(profile); return; }

        if (limitReached(profile)) { showToast('Το «' + profile.name + '» έφτασε το ημερήσιο όριο των ' + profile.limit + '′'); return; }
        if (state.current && state.current.id === profile.id) { closeModal(); return; }

        if (profile.pinHash) {
            openPin({
                mode: 'verify',
                profile: profile,
                title: profile.name,
                subtitle: 'Πληκτρολόγησε το PIN σου',
                onSuccess: function () { login(profile); }
            });
        } else {
            login(profile);
        }
    }

    function login(profile) {
        if (!state.current || state.current.id !== profile.id) { resetChat(); }
        state.current = profile;
        storage.set(STORAGE.LAST_PROFILE, profile.id);
        renderBadge();
        updateGreeting();
        renderAI(true);
        closeAllModals();
        pushBridgeState();
        showToast('Καλώς ήρθες, ' + profile.name + '!');
    }

    function manageProfile(profile) {
        if (profile.pinHash) {
            openPin({
                mode: 'verify',
                profile: profile,
                title: 'Επαλήθευση PIN',
                subtitle: 'Πληκτρολόγησε το τρέχον PIN του προφίλ «' + profile.name + '»',
                onSuccess: function () { openPinActions(profile); }
            });
        } else {
            openPinActions(profile);
        }
    }

    function startNewPin(profile) {
        openPin({
            mode: 'new',
            profile: profile,
            title: 'Νέο PIN',
            subtitle: 'Όρισε 4-ψήφιο PIN για «' + profile.name + '»',
            onSuccess: function (value) {
                profile.pinHash = hashPin(value, profile.id);
                saveProfiles();
                renderProfiles();
                showToast('Το PIN ορίστηκε για «' + profile.name + '»');
            }
        });
    }

    function openPinActions(profile, confirmDelete, keepFk) {
        state.actionsProfile = profile;
        setAvatar($('actions-avatar'), profile, 'avatar-md');
        $('actions-title').textContent = profile.name;
        var buttons = [];
        if (confirmDelete) {
            $('actions-sub').textContent = 'Σίγουρα; Το προφίλ «' + profile.name + '» θα διαγραφεί μαζί με το PIN και το ιστορικό του.';
            buttons.push(['delete-yes', 'Ναι, διαγραφή', true]);
            buttons.push(['cancel', 'Άκυρο']);
        } else {
            $('actions-sub').textContent = 'Τι θέλεις να κάνεις με αυτό το προφίλ;';
            if (profile.pinHash) {
                buttons.push(['change', 'Αλλαγή PIN']);
                buttons.push(['remove', 'Αφαίρεση PIN']);
            } else {
                buttons.push(['set', 'Ορισμός PIN']);
            }
            buttons.push(['limit', 'Ημερήσιο όριο: ' + limitLabel(profile.limit)]);
            buttons.push(['delete', 'Διαγραφή προφίλ', true]);
            buttons.push(['cancel', 'Άκυρο']);
        }
        var html = '';
        for (var i = 0; i < buttons.length; i++) {
            html += '<div class="btn btn-wide focusable' + (buttons[i][2] ? ' btn-danger' : '') + '" data-action="pin-action" data-op="' +
                buttons[i][0] + '" data-fk="act-' + buttons[i][0] + '">' + escapeHtml(buttons[i][1]) + '</div>';
        }
        $('actions-list').innerHTML = html;
        if (topModalId() === 'pin-actions-modal') {
            focused = null;
            focusByFk($('pin-actions-modal'), confirmDelete ? 'act-cancel' : (keepFk || null));
        } else {
            openModal('pin-actions-modal', null);
        }
    }

    function handlePinAction(op) {
        var profile = state.actionsProfile;
        if (!profile) { closeModal(); return; }
        if (op === 'delete') { openPinActions(profile, true); return; }
        if (op === 'limit') { cycleLimit(profile); openPinActions(profile, false, 'act-limit'); return; }
        closeModal();
        state.actionsProfile = null;
        if (op === 'change' || op === 'set') {
            startNewPin(profile);
        } else if (op === 'remove') {
            profile.pinHash = null;
            saveProfiles();
            renderProfiles();
            showToast('Το PIN αφαιρέθηκε από «' + profile.name + '»');
        } else if (op === 'delete-yes') {
            deleteProfile(profile);
        }
    }

    function deleteProfile(profile) {
        var list = [];
        for (var i = 0; i < state.profiles.length; i++) {
            if (state.profiles[i].id !== profile.id) { list.push(state.profiles[i]); }
        }
        state.profiles = list;
        saveProfiles();

        var usage = storage.get(STORAGE.USAGE, {});
        delete usage[profile.id];
        storage.set(STORAGE.USAGE, usage);
        delete pinLocks[profile.id];
        removeSeriesData(profile.id);

        if (state.current && state.current.id === profile.id) {
            state.current = null;
            storage.remove(STORAGE.LAST_PROFILE);
            resetChat();
            renderBadge();
            updateGreeting();
            renderAI(false);
        }
        renderProfiles();
        showToast('Το προφίλ «' + profile.name + '» διαγράφηκε');
    }

    /* ---------------- Νέο προφίλ ---------------- */
    var npColor = 1;

    function openNewProfile() {
        if (state.profiles.length >= MAX_PROFILES) {
            showToast('Μπορείς να έχεις έως ' + MAX_PROFILES + ' προφίλ');
            return;
        }
        $('np-name').value = '';
        $('np-error').textContent = '';
        npColor = (state.profiles.length % 4) + 1;
        updateNpPreview();
        openModal('new-profile-modal', 'np-input');
    }

    function updateNpPreview() {
        var name = $('np-name').value.replace(/^\s+/, '');
        var av = $('np-avatar');
        av.className = 'avatar avatar-lg av-' + npColor;
        av.innerHTML = '<span>' + escapeHtml(name ? name.charAt(0).toUpperCase() : '?') + '</span>';
        var colors = toArray(document.querySelectorAll('.np-color'));
        for (var i = 0; i < colors.length; i++) {
            colors[i].classList.toggle('selected', parseInt(colors[i].getAttribute('data-color'), 10) === npColor);
        }
    }

    function createProfile() {
        var name = $('np-name').value.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
        if (!name) { $('np-error').textContent = 'Γράψε ένα όνομα για το προφίλ'; return; }
        for (var i = 0; i < state.profiles.length; i++) {
            if (state.profiles[i].name.toLowerCase() === name.toLowerCase()) {
                $('np-error').textContent = 'Υπάρχει ήδη προφίλ με αυτό το όνομα';
                return;
            }
        }
        var profile = { id: 'p' + Date.now().toString(36), name: name, color: npColor, pinHash: null };
        state.profiles.push(profile);
        saveProfiles();
        closeModal();
        renderProfiles();
        focusByFk($('profile-modal'), 'profile-' + profile.id);
        showToast('Δημιουργήθηκε το προφίλ «' + name + '» · πάτα OK για είσοδο');
    }

    /* =========================================================
       PIN PAD
       ========================================================= */
    function openPin(cfg) {
        pin = { cfg: cfg, buffer: '', step: 1, first: '', busy: false };
        setAvatar($('pin-avatar'), cfg.profile, 'avatar-md');
        $('pin-title').textContent = cfg.title;
        $('pin-sub').textContent = cfg.subtitle;
        setPinError('');
        renderPinDots();
        openModal('pin-modal', 'pk-1');
        checkPinLock();
    }

    function renderPinDots() {
        var dots = toArray($('pin-dots').querySelectorAll('.pin-dot'));
        var len = pin ? pin.buffer.length : 0;
        for (var i = 0; i < dots.length; i++) {
            dots[i].classList.toggle('filled', i < len);
        }
    }

    function setPinError(msg) {
        $('pin-error').textContent = msg;
    }

    function getLock(profileId) {
        if (!pinLocks[profileId]) { pinLocks[profileId] = { fails: 0, until: 0 }; }
        return pinLocks[profileId];
    }

    /* Επιστρέφει true αν το προφίλ είναι προσωρινά κλειδωμένο */
    function checkPinLock() {
        if (!pin || pin.cfg.mode !== 'verify') { return false; }
        var lock = getLock(pin.cfg.profile.id);
        var left = lock.until - Date.now();
        if (left > 0) {
            setPinError('Πολλές λάθος προσπάθειες. Δοκίμασε σε ' + Math.ceil(left / 1000) + '″');
            return true;
        }
        return false;
    }

    function handlePinKey(key) {
        if (!pin) { return; }
        if (key === 'cancel') { closeModal(); return; }
        if (key === 'del') {
            if (pin.busy) { return; }
            pin.buffer = pin.buffer.slice(0, -1);
            renderPinDots();
            return;
        }
        pinInput(key);
    }

    function pinInput(digit) {
        if (!pin || pin.busy || pin.buffer.length >= 4) { return; }
        if (checkPinLock()) { return; }
        pin.buffer += digit;
        setPinError('');
        renderPinDots();
        if (pin.buffer.length === 4) {
            pin.busy = true;
            setTimeout(submitPin, 220);
        }
    }

    function submitPin() {
        if (!pin) { return; }
        var cfg = pin.cfg;
        var entered = pin.buffer;

        if (cfg.mode === 'verify') {
            var lock = getLock(cfg.profile.id);
            if (hashPin(entered, cfg.profile.id) === cfg.profile.pinHash) {
                lock.fails = 0;
                closeModal();
                cfg.onSuccess();
            } else {
                lock.fails++;
                if (lock.fails >= PIN_MAX_ATTEMPTS) {
                    lock.fails = 0;
                    lock.until = Date.now() + PIN_LOCK_MS;
                    pinFail('Πολλές λάθος προσπάθειες. Δοκίμασε σε ' + (PIN_LOCK_MS / 1000) + '″');
                } else {
                    pinFail('Λάθος PIN · απομένουν ' + (PIN_MAX_ATTEMPTS - lock.fails) + ' προσπάθειες');
                }
            }
            return;
        }

        // mode === 'new'
        if (pin.step === 1) {
            pin.first = entered;
            pin.step = 2;
            pin.buffer = '';
            pin.busy = false;
            $('pin-title').textContent = 'Επιβεβαίωση PIN';
            $('pin-sub').textContent = 'Πληκτρολόγησε ξανά το ίδιο PIN';
            renderPinDots();
            return;
        }

        if (entered === pin.first) {
            closeModal();
            cfg.onSuccess(entered);
        } else {
            pin.step = 1;
            pin.first = '';
            $('pin-title').textContent = cfg.title;
            $('pin-sub').textContent = cfg.subtitle;
            pinFail('Τα PIN δεν ταιριάζουν. Ξεκίνα από την αρχή.');
        }
    }

    function pinFail(msg) {
        var dots = $('pin-dots');
        setPinError(msg);
        dots.classList.remove('shake');
        void dots.offsetWidth;
        dots.classList.add('shake');
        setTimeout(function () {
            dots.classList.remove('shake');
            if (!pin) { return; }
            pin.buffer = '';
            pin.busy = false;
            renderPinDots();
        }, 450);
    }

    function digitFromKey(code) {
        if (code >= 48 && code <= 57) { return code - 48; }   // 0-9 (τηλεχειριστήριο / πληκτρολόγιο)
        if (code >= 96 && code <= 105) { return code - 96; }  // numpad
        return null;
    }

    /* =========================================================
       MEDIA PLAYER
       ========================================================= */
    function video() { return $('player-video'); }

    function renderPlaylist() {
        var html = '';
        for (var i = 0; i < VIDEOS.length; i++) {
            html += '<div class="playlist-item focusable' + (i === playerIndex ? ' playing' : '') + '" data-action="play-video" data-index="' + i + '" data-fk="video-' + i + '">' +
                '<div class="pl-title">' + escapeHtml(VIDEOS[i].title) + '</div>' +
                '<div class="pl-sub muted">' + escapeHtml(VIDEOS[i].sub) + '</div>' +
                '</div>';
        }
        $('playlist').innerHTML = html;
    }

    function openPlayer() {
        renderPlaylist();
        openModal('player-modal', 'ctrl-toggle');
        playVideo(playerIndex);
    }

    function playVideo(index) {
        var v = video();
        playerIndex = index;
        var items = toArray($('playlist').querySelectorAll('.playlist-item'));
        for (var i = 0; i < items.length; i++) { items[i].classList.toggle('playing', i === index); }
        $('player-title').textContent = VIDEOS[index].title;
        $('player-cur').textContent = '0:00';
        $('player-dur').textContent = '0:00';
        $('player-progress').style.width = '0%';
        v.src = VIDEOS[index].url;
        v.load();
        safePlay();
        flashPlayerState('Φόρτωση…', true);
    }

    function safePlay() {
        var p = video().play();
        if (p && typeof p.then === 'function') {
            p.then(null, function () { /* autoplay blocked or aborted */ });
        }
    }

    function stopPlayer() {
        var v = video();
        try {
            v.pause();
            v.removeAttribute('src');
            v.load();
        } catch (e) { /* ignore */ }
    }

    function playerControl(op) {
        var v = video();
        switch (op) {
        case 'toggle':
            if (v.paused) { safePlay(); } else { v.pause(); }
            break;
        case 'rw':
            v.currentTime = Math.max(0, v.currentTime - 10);
            flashPlayerState('-10″');
            break;
        case 'ff':
            if (!isNaN(v.duration)) { v.currentTime = Math.min(v.duration - 1, v.currentTime + 10); }
            flashPlayerState('+10″');
            break;
        case 'close':
            closeModal();
            break;
        }
    }

    function formatTime(sec) {
        if (isNaN(sec) || !isFinite(sec)) { return '0:00'; }
        sec = Math.floor(sec);
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = sec % 60;
        return h > 0 ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
    }

    function flashPlayerState(text, sticky) {
        var el = $('player-state');
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(playerStateTimer);
        if (!sticky) {
            playerStateTimer = setTimeout(function () { el.classList.remove('show'); }, 900);
        }
    }

    function updateToggleIcon() {
        $('ctrl-toggle-icon').innerHTML = video().paused ? SVG.playSmall : SVG.pauseSmall;
    }

    function bindPlayer() {
        var v = video();
        updateToggleIcon();
        v.addEventListener('timeupdate', function () {
            $('player-cur').textContent = formatTime(v.currentTime);
            if (v.duration) { $('player-progress').style.width = (v.currentTime / v.duration * 100) + '%'; }
        });
        v.addEventListener('loadedmetadata', function () { $('player-dur').textContent = formatTime(v.duration); });
        v.addEventListener('playing', function () { $('player-state').classList.remove('show'); updateToggleIcon(); });
        v.addEventListener('play', updateToggleIcon);
        v.addEventListener('pause', function () {
            updateToggleIcon();
            if (topModalId() === 'player-modal' && v.currentTime > 0 && !v.ended) { flashPlayerState('Παύση', true); }
        });
        v.addEventListener('waiting', function () { flashPlayerState('Φόρτωση…', true); });
        v.addEventListener('ended', function () {
            renderPlaylist();
            playVideo((playerIndex + 1) % VIDEOS.length);
        });
        v.addEventListener('error', function () {
            if (topModalId() !== 'player-modal' || !v.getAttribute('src')) { return; }
            flashPlayerState('Σφάλμα αναπαραγωγής');
            showToast('Δεν ήταν δυνατή η αναπαραγωγή. Έλεγξε τη σύνδεση στο Internet.');
        });
    }

    function handleMediaKey(code) {
        var v = video();
        switch (code) {
        case KEY.PLAY: safePlay(); return true;
        case KEY.PAUSE: v.pause(); return true;
        case KEY.PLAY_PAUSE: playerControl('toggle'); return true;
        case KEY.FAST_FORWARD: playerControl('ff'); return true;
        case KEY.REWIND: playerControl('rw'); return true;
        case KEY.STOP: closeModal(); return true;
        }
        return false;
    }

    /* =========================================================
       ACTIONS / INPUT
       ========================================================= */
    function activate(el) {
        if (!el) { return; }
        var action = el.getAttribute('data-action');

        el.classList.add('pressed');
        setTimeout(function () { el.classList.remove('pressed'); }, 140);

        switch (action) {
        case 'open-profiles': openProfiles(); break;
        case 'launch-app': launchApp(APPS[parseInt(el.getAttribute('data-index'), 10)]); break;
        case 'set-theme': applyTheme(el.getAttribute('data-theme'), true); break;
        case 'pick-profile': pickProfile(findProfile(el.getAttribute('data-id'))); break;
        case 'toggle-manage': setManageMode(!state.manageMode); break;
        case 'add-profile': openNewProfile(); break;
        case 'np-input': $('np-name').focus(); break;
        case 'np-color': npColor = parseInt(el.getAttribute('data-color'), 10); updateNpPreview(); break;
        case 'np-create': createProfile(); break;
        case 'open-settings': openSettings(); break;
        case 'toggle-setting': setSetting(el.getAttribute('data-key'), !settings[el.getAttribute('data-key')]); break;
        case 'bridge-input': $('bridge-input').focus(); break;
        case 'bridge-connect': saveBridgeFromInput(); break;
        case 'fav-input': $('fav-input').focus(); break;
        case 'fav-remove': removeFavorite(el.getAttribute('data-title')); break;
        case 'rec-open': openRec(parseInt(el.getAttribute('data-index'), 10)); break;
        case 'rec-add': if (recs.list[parseInt(el.getAttribute('data-index'), 10)]) { addFavorite(recs.list[parseInt(el.getAttribute('data-index'), 10)].title); } break;
        case 'recs-refresh': loadRecs(true); break;
        case 'fav-open': openFavActions(el.getAttribute('data-title')); break;
        case 'fa-op': favAction(el.getAttribute('data-op')); break;
        case 'run-scene': runScene(el.getAttribute('data-scene')); break;
        case 'sleep-cycle': cycleSleep(); break;
        case 'city-input': $('city-input').focus(); break;
        case 'save-city': saveCityFromInput(); break;
        case 'poll-open-winner': openPollWinner(); break;
        case 'close-modal': closeModal(); break;
        case 'pin-key': handlePinKey(el.getAttribute('data-key')); break;
        case 'pin-action': handlePinAction(el.getAttribute('data-op')); break;
        case 'play-video': playVideo(parseInt(el.getAttribute('data-index'), 10)); break;
        case 'player-ctrl': playerControl(el.getAttribute('data-op')); break;
        case 'open-chat': openChat(); break;
        case 'chat-quick': sendChat(QUICK_PROMPTS[parseInt(el.getAttribute('data-index'), 10)]); break;
        case 'chat-input': $('chat-input').focus(); break;
        case 'chat-send': sendChat(); break;
        case 'chat-clear': resetChat(); chat.started = true; appendChatMessage('ai', 'Καθάρισα τη συζήτηση. Τι θέλεις να μάθεις;'); setChatState('ΕΤΟΙΜΗ'); break;
        }
    }

    function handleBack() {
        var top = topModalId();
        if (!top) { exitApp(); return; }

        if (top === 'profile-modal') {
            if (state.manageMode) { setManageMode(false); return; }
            if (!state.current) { exitApp(); return; }   // κανένας χρήστης: δεν υπάρχει dashboard για επιστροφή
        }
        closeModal();
    }

    function onKeyDown(e) {
        var code = e.keyCode;
        var top = topModalId();
        var active = document.activeElement;
        if (sleepState.sleeping) { wakeUp(); if (e.preventDefault) { e.preventDefault(); } return; }

        // Πληκτρολόγηση στο chat (Samsung IME: Done = 65376, Cancel = 65385)
        if (active && active.tagName === 'INPUT') {
            if (code === KEY.ENTER || code === 65376) {
                e.preventDefault();
                active.blur();
                if (active.id === 'chat-input') { sendChat(); }
                else if (active.id === 'np-name') { updateNpPreview(); focusByFk($('new-profile-modal'), 'np-create'); }
                else if (active.id === 'fav-input') { addFavFromInput(); }
                else if (active.id === 'bridge-input') { saveBridgeFromInput(); }
                else if (active.id === 'city-input') { saveCityFromInput(); }
                return;
            }
            if (code === 65385 || code === KEY.BACK || code === KEY.ESC) { e.preventDefault(); active.blur(); return; }
            if (code === KEY.UP || code === KEY.DOWN) { active.blur(); } else { return; }
        }

        // Αριθμητικά πλήκτρα στο PIN pad
        if (top === 'pin-modal') {
            var digit = digitFromKey(code);
            if (digit !== null) { pinInput(String(digit)); e.preventDefault(); return; }
            if (code === KEY.BACKSPACE) { handlePinKey('del'); e.preventDefault(); return; }
        }

        // Media keys στον player
        if (top === 'player-modal' && handleMediaKey(code)) { e.preventDefault(); return; }

        switch (code) {
        case KEY.LEFT: moveFocus('left'); break;
        case KEY.UP: moveFocus('up'); break;
        case KEY.RIGHT: moveFocus('right'); break;
        case KEY.DOWN: moveFocus('down'); break;
        case KEY.ENTER: activate(focused); break;
        case KEY.BACK:
        case KEY.BACKSPACE:
        case KEY.ESC:
            handleBack();
            break;
        default:
            return;
        }
        e.preventDefault();
    }

    /* Υποστήριξη ποντικιού/pointer (Smart Remote ή δοκιμές σε PC) */
    function bindPointer() {
        document.addEventListener('mouseover', function (e) {
            var el = e.target.closest ? e.target.closest('.focusable') : null;
            if (el && getScope().contains(el)) { setFocus(el); }
        });
        document.addEventListener('click', function (e) {
            var el = e.target.closest ? e.target.closest('.focusable') : null;
            if (el && getScope().contains(el)) { setFocus(el); activate(el); }
            if (e.target && e.target.tagName === 'INPUT') { e.target.focus(); }
        });
    }

    /* =========================================================
       ΡΥΘΜΙΣΕΙΣ
       ========================================================= */
    var DEFAULT_BRIDGE = CONFIG.cloudUrl || '';
    var settings = { effects: true, seconds: true, aiGreeting: true, bridge: DEFAULT_BRIDGE, city: 'Αθήνα' };
    var SETTING_LABELS = {
        effects: 'Εφέ & animations',
        seconds: 'Δευτερόλεπτα στο ρολόι',
        aiGreeting: 'AI μήνυμα αρχικής'
    };

    function loadSettings() {
        var saved = storage.get(STORAGE.SETTINGS, null);
        if (saved) {
            for (var k in settings) {
                if (settings.hasOwnProperty(k) && saved.hasOwnProperty(k)) { settings[k] = saved[k]; }
            }
        }
        // Μετάβαση από την παλιά τοπική γέφυρα (IP:4545) στο cloud
        if (CONFIG.cloudUrl && (!settings.bridge || /^(http:\/\/)?\d+\.\d+\.\d+\.\d+(:\d+)?\/?$/.test(settings.bridge))) {
            settings.bridge = CONFIG.cloudUrl;
        }
    }

    function saveSettings() {
        storage.set(STORAGE.SETTINGS, settings);
        pushBridgeState();
    }

    function applyBodyClass() {
        document.body.className = 'theme-' + state.theme + (settings.effects ? '' : ' no-fx');
    }

    function mergeConfig(base, extra) {
        if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) { base[k] = extra[k]; } } }
        return base;
    }

    function renderSettingsThemes() {
        var html = '';
        for (var i = 0; i < THEMES.length; i++) {
            var t = THEMES[i];
            html += '<div class="theme-chip focusable" data-action="set-theme" data-theme="' + t.id + '" data-fk="set-theme-' + t.id + '">' +
                '<span class="swatch sw-' + t.id + '"></span><span>' + escapeHtml(t.name) + '</span>' +
                '<span class="chip-check">' + SVG.check + '</span></div>';
        }
        $('set-themes').innerHTML = html;
    }

    function renderSettingToggles() {
        var els = toArray(document.querySelectorAll('.set-toggle'));
        for (var i = 0; i < els.length; i++) {
            var key = els[i].getAttribute('data-key');
            els[i].textContent = SETTING_LABELS[key] + ': ' + (settings[key] ? 'ΝΑΙ' : 'ΟΧΙ');
            els[i].classList.toggle('on', !!settings[key]);
        }
    }

    function setSetting(key, value) {
        if (!SETTING_LABELS.hasOwnProperty(key)) { return false; }
        settings[key] = !!value;
        saveSettings();
        applyBodyClass();
        updateClock();
        if (key === 'aiGreeting') { renderAI(false); }
        renderSettingToggles();
        return true;
    }

    function openSettings() {
        renderSettingToggles();
        $('bridge-input').value = settings.bridge || '';
        openSettingsExtras();
        renderBridgeStatus();
        openModal('settings-modal', 'set-theme-' + state.theme);
    }

    /* =========================================================
       ΣΕΙΡΕΣ AI (αγαπημένα + προτάσεις Gemini)
       ========================================================= */
    var MAX_FAVS = 8;
    var STREAMING = ['Netflix', 'Prime Video', 'Disney+', 'Apple TV', 'YouTube', 'Plex'];
    var recs = { list: [], busy: false };

    function cleanTitle(t) {
        return String(t || '').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ').slice(0, 40);
    }

    function getFavs() {
        if (!state.current) { return []; }
        var all = storage.get(STORAGE.SERIES, {});
        return all[state.current.id] || [];
    }

    function setFavs(list) {
        if (!state.current) { return; }
        var all = storage.get(STORAGE.SERIES, {});
        all[state.current.id] = list;
        storage.set(STORAGE.SERIES, all);
        pushBridgeState();
    }

    function removeSeriesData(profileId) {
        var all = storage.get(STORAGE.SERIES, {});
        delete all[profileId];
        storage.set(STORAGE.SERIES, all);
        var r = storage.get(STORAGE.RECS, {});
        delete r[profileId];
        storage.set(STORAGE.RECS, r);
    }

    function addFavorite(title) {
        title = cleanTitle(title);
        if (!title) { return 'empty'; }
        if (!state.current) { showToast('Επίλεξε πρώτα προφίλ'); return 'no-profile'; }
        var list = getFavs();
        for (var i = 0; i < list.length; i++) {
            if (list[i].toLowerCase() === title.toLowerCase()) { showToast('Το «' + title + '» υπάρχει ήδη στα αγαπημένα'); return 'exists'; }
        }
        if (list.length >= MAX_FAVS) { showToast('Έως ' + MAX_FAVS + ' αγαπημένες σειρές · αφαίρεσε κάποια πρώτα'); return 'full'; }
        list.push(title);
        setFavs(list);
        renderFavs();
        showToast('Το «' + title + '» μπήκε στα αγαπημένα');
        return 'ok';
    }

    function removeFavorite(title) {
        title = cleanTitle(title);
        var list = getFavs();
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].toLowerCase() !== title.toLowerCase()) { out.push(list[i]); }
        }
        if (out.length === list.length) { return false; }
        deleteProgress(title);
        setFavs(out);
        renderFavs();
        showToast('Το «' + title + '» αφαιρέθηκε');
        return true;
    }

    function addFavFromInput() {
        var input = $('fav-input');
        var r = addFavorite(input.value);
        if (r === 'ok' || r === 'exists' || r === 'empty') { input.value = ''; }
    }

    function refocusIn(modalId, prevFk) {
        if (topModalId() === modalId && focused && !document.body.contains(focused)) {
            focused = null;
            focusByFk($(modalId), prevFk);
        }
    }

    function renderFavs() {
        var prevFk = focused ? focused.getAttribute('data-fk') : null;
        var list = getFavs();
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var pg = getProgress(list[i]);
            html += '<div class="fav-item focusable" data-action="fav-open" data-title="' + escapeHtml(list[i]) + '" data-fk="fav-' + i + '">' +
                '<span class="fav-title">' + escapeHtml(list[i]) + '</span><span class="fav-x ' + (pg ? 'hud-label' : 'muted') + '">' +
                (pg ? progressLabel(pg) : 'OK · ΕΠΙΛΟΓΕΣ') + '</span></div>';
        }
        if (!list.length) {
            html = '<div class="fav-empty muted">Πρόσθεσε σειρές που σου αρέσουν και η AURA θα σου προτείνει παρόμοιες.</div>';
        }
        $('fav-list').innerHTML = html;
        $('fav-count').textContent = list.length + '/' + MAX_FAVS;
        refocusIn('series-modal', prevFk);
    }

    function appByName(name) {
        var n = String(name || '').toLowerCase().replace(/^\s+|\s+$/g, '');
        if (!n) { return null; }
        for (var i = 0; i < APPS.length; i++) { if (APPS[i].name.toLowerCase() === n) { return APPS[i]; } }
        for (var k = 0; k < APPS.length; k++) {
            var a = APPS[k].name.toLowerCase();
            if (a.indexOf(n) !== -1 || n.indexOf(a) !== -1) { return APPS[k]; }
        }
        return null;
    }

    function setSeriesState(text) {
        $('series-state').textContent = text;
    }

    function recsKey() {
        return state.current ? state.current.id + '|' + getFavs().join('|').toLowerCase() : '';
    }

    function openSeries() {
        if (!state.current) { showToast('Επίλεξε πρώτα προφίλ'); openProfiles(); return; }
        renderFavs();
        var cached = storage.get(STORAGE.RECS, {})[state.current.id];
        if (topModalId() !== 'series-modal') { openModal('series-modal', 'fav-input'); }
        if (cached && cached.key === recsKey() && cached.list && cached.list.length) {
            recs.list = cached.list;
            setSeriesState('GEMINI · ΑΠΟΘΗΚΕΥΜΕΝΕΣ');
            renderRecs();
        } else {
            recs.list = [];
            loadRecs(false);
        }
    }

    function renderRecs(loading, errorMsg) {
        var prevFk = focused ? focused.getAttribute('data-fk') : null;
        var html = '';
        if (loading) {
            html = '<div class="rec-loading muted"><span class="typing"><i></i><i></i><i></i></span>Η AURA ψάχνει σειρές για σένα…</div>';
        } else if (errorMsg) {
            html = '<div class="rec-loading muted">' + escapeHtml(errorMsg) + '</div>';
        } else {
            for (var i = 0; i < recs.list.length; i++) {
                var r = recs.list[i];
                var app = appByName(r.platform) || APPS[0];
                html += '<div class="rec-item">' +
                    '<div class="rec-open focusable" data-action="rec-open" data-index="' + i + '" data-fk="rec-' + i + '">' +
                    '<div class="rec-icon ' + app.iconCls + '">' + app.icon + '</div>' +
                    '<div class="rec-text"><div class="rec-title">' + escapeHtml(r.title) +
                    (r.year ? ' <span class="muted">(' + escapeHtml(r.year) + ')</span>' : '') + '</div>' +
                    '<div class="rec-reason muted">' + escapeHtml(r.reason || '') + '</div></div>' +
                    '<div class="rec-platform tech hud-label">' + escapeHtml(app.name) + '</div></div>' +
                    '<div class="rec-add focusable" data-action="rec-add" data-index="' + i + '" data-fk="rec-add-' + i + '">+</div>' +
                    '</div>';
            }
        }
        $('rec-list').innerHTML = html;
        refocusIn('series-modal', prevFk);
    }

    function loadRecs(force) {
        if (recs.busy || !state.current) { return; }
        recs.busy = true;
        setSeriesState('GEMINI · ΣΚΕΦΤΕΤΑΙ…');
        var previous = [];
        for (var i = 0; i < recs.list.length; i++) { previous.push(recs.list[i].title); }
        renderRecs(true);

        var favs = getFavs();
        var pid = state.current.id;
        var key = recsKey();
        var prompt = (favs.length ?
            'Αγαπημένες σειρές του χρήστη: ' + favs.join(', ') + '. Πρότεινε 6 ΑΛΛΕΣ σειρές (όχι αυτές) που θα του αρέσουν, με παρόμοιο ύφος, θέματα ή ατμόσφαιρα.' :
            'Ο χρήστης δεν έχει δηλώσει ακόμα αγαπημένες σειρές. Πρότεινε 6 δημοφιλείς και πολύ καλές σειρές διαφορετικών ειδών.') +
            ' Για κάθε σειρά δώσε: title (ο γνωστός τίτλος), year (έτος πρεμιέρας), platform (μία από: ' + STREAMING.join(', ') +
            ', όπου είναι πιο πιθανό να υπάρχει), reason (μία σύντομη πρόταση στα ελληνικά, έως 80 χαρακτήρες, γιατί ταιριάζει).' +
            (force && previous.length ? ' Μην προτείνεις: ' + previous.join(', ') + '.' : '');
        var schema = {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    title: { type: 'STRING' },
                    year: { type: 'STRING' },
                    platform: { type: 'STRING', 'enum': STREAMING },
                    reason: { type: 'STRING' }
                },
                required: ['title', 'platform', 'reason']
            }
        };
        var system = 'Είσαι η AURA, ειδική σε τηλεοπτικές σειρές. Απαντάς μόνο με το ζητούμενο JSON. Οι εξηγήσεις (reason) είναι στα ελληνικά.';

        geminiRequest([{ role: 'user', parts: [{ text: prompt }] }], system, 1500, function (err, text) {
            recs.busy = false;
            if (!state.current || state.current.id !== pid) { return; }
            var list = null;
            if (!err) { try { list = JSON.parse(text); } catch (e) { list = null; } }
            if (err || !list || !list.length) {
                setSeriesState('ΣΦΑΛΜΑ');
                renderRecs(false, 'Δεν ήρθαν προτάσεις: ' + (err || 'μη έγκυρη απάντηση') + '. Πάτα «Νέες προτάσεις» για να ξαναδοκιμάσεις.');
                return;
            }
            var clean = [];
            for (var k = 0; k < list.length && clean.length < 6; k++) {
                if (list[k] && list[k].title) {
                    clean.push({ title: cleanTitle(list[k].title), year: String(list[k].year || ''), platform: list[k].platform || 'Netflix', reason: String(list[k].reason || '') });
                }
            }
            recs.list = clean;
            var all = storage.get(STORAGE.RECS, {});
            all[pid] = { key: key, list: clean };
            storage.set(STORAGE.RECS, all);
            setSeriesState('GEMINI · ΕΤΟΙΜΟ');
            renderRecs();
            pushBridgeState();
        }, { responseMimeType: 'application/json', responseSchema: schema, temperature: force ? 1.0 : 0.8 });
    }

    function openRec(index) {
        var r = recs.list[index];
        if (!r) { return; }
        var app = appByName(r.platform);
        if (!app) { showToast('Δεν βρέθηκε η εφαρμογή ' + r.platform); return; }
        launchApp(app);
        setTimeout(function () { showToast('Αναζήτησε «' + r.title + '» στο ' + app.name); }, 1200);
    }

    /* =========================================================
       WEB COMPANION (cloud: Vercel · HTTPS polling)
       ========================================================= */
    var bridge = { connected: false, status: '', code: '' };
    var cloud = { timer: null, busy: false, again: false, dirty: true, acks: [], pollVer: '', fails: 0 };
    var REMOTE_KEYS = { left: 37, up: 38, right: 39, down: 40, enter: 13, back: 10009 };

    function cloudBase() {
        var a = String(settings.bridge || '').replace(/^\s+|\s+$/g, '').replace(/\/+$/, '');
        if (!a) { return ''; }
        if (!/^https?:\/\//.test(a)) { a = (/^\d+\.\d+\.\d+\.\d+/.test(a) ? 'http://' : 'https://') + a; }
        return a;
    }

    function renderBridgeStatus() {
        var el = $('bridge-status');
        if (el) { el.textContent = bridge.status || (bridge.connected ? 'ΣΥΝΔΕΔΕΜΕΝΟ' : 'ΑΠΟΣΥΝΔΕΔΕΜΕΝΟ'); }
    }

    function setBridgeStatus(text, on) {
        var changed = bridge.connected !== on || bridge.status !== text;
        bridge.connected = on;
        bridge.status = text;
        if (!changed) { return; }
        $('companion-chip-text').textContent = on ? 'COMPANION ONLINE' : 'COMPANION OFFLINE';
        $('companion-dot').classList.toggle('off', !on);
        renderBridgeStatus();
    }

    function scheduleSync(ms) {
        clearTimeout(cloud.timer);
        cloud.timer = setTimeout(syncNow, ms);
    }

    function connectBridge() {
        cloud.fails = 0;
        cloud.dirty = true;
        cloud.pollVer = '';
        if (!cloudBase()) { setBridgeStatus('ΧΩΡΙΣ ΔΙΕΥΘΥΝΣΗ', false); return; }
        if (!CONFIG.tvKey) { setBridgeStatus('ΛΕΙΠΕΙ ΚΛΕΙΔΙ ΣΥΣΚΕΥΗΣ', false); return; }
        setBridgeStatus('ΣΥΝΔΕΣΗ…', false);
        scheduleSync(50);
    }

    function syncFailed(text, body) {
        cloud.busy = false;
        if (body.state) { cloud.dirty = true; }
        if (body.acks) { cloud.acks = body.acks.concat(cloud.acks); }
        cloud.fails += 1;
        setBridgeStatus(text, false);
        scheduleSync(Math.min(60000, 5000 * cloud.fails));
    }

    function syncNow() {
        if (cloud.busy) { cloud.again = true; return; }
        var base = cloudBase();
        if (!base || !CONFIG.tvKey) { return; }
        cloud.busy = true;
        cloud.again = false;
        var body = { pollVer: cloud.pollVer };
        if (cloud.dirty) { body.state = tvState(); cloud.dirty = false; }
        if (cloud.acks.length) { body.acks = cloud.acks; cloud.acks = []; }

        var xhr = new XMLHttpRequest();
        xhr.open('POST', base + '/api/tv/sync', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('x-tv-key', CONFIG.tvKey);
        xhr.timeout = 20000;
        xhr.onload = function () {
            if (xhr.status === 401) { syncFailed('ΛΑΘΟΣ ΚΛΕΙΔΙ ΣΥΣΚΕΥΗΣ', body); return; }
            var data = null;
            try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
            if (xhr.status !== 200 || !data) { syncFailed('ΣΦΑΛΜΑ CLOUD (' + xhr.status + ')', body); return; }
            cloud.busy = false;
            cloud.fails = 0;
            setBridgeStatus('ΣΥΝΔΕΔΕΜΕΝΟ', true);
            if (data.poll) {
                pollState = data.poll;
                if (topModalId() === 'poll-modal') { renderPoll(); }
            }
            if (data.pollVer !== undefined) { cloud.pollVer = data.pollVer; }
            var cmds = data.commands || [];
            for (var i = 0; i < cmds.length; i++) { handleRemoteCommand(cmds[i]); }
            var next = data.next || 10000;
            if (cmds.length || cloud.again || cloud.acks.length) { next = 250; }
            scheduleSync(next);
        };
        xhr.onerror = function () { syncFailed('ΧΩΡΙΣ ΣΥΝΔΕΣΗ · ΝΕΑ ΠΡΟΣΠΑΘΕΙΑ', body); };
        xhr.ontimeout = function () { syncFailed('ΤΟ CLOUD ΑΡΓΕΙ · ΝΕΑ ΠΡΟΣΠΑΘΕΙΑ', body); };
        xhr.send(JSON.stringify(body));
    }

    function saveBridgeFromInput() {
        settings.bridge = $('bridge-input').value.replace(/^\s+|\s+$/g, '');
        saveSettings();
        connectBridge();
    }

    /* Οι επιβεβαιώσεις εντολών φεύγουν με το επόμενο sync */
    function sendBridge(obj) {
        if (obj && obj.type === 'ack') {
            cloud.acks.push({ id: obj.id, ok: obj.ok, info: obj.info });
            if (!cloud.busy) { scheduleSync(150); } else { cloud.again = true; }
        }
    }

    function tvState() {
        var profiles = [];
        for (var i = 0; i < state.profiles.length; i++) {
            var p = state.profiles[i];
            profiles.push({ id: p.id, name: p.name, color: p.color, hasPin: !!p.pinHash, limit: p.limit || 0, used: getScreenMin(p.id) });
        }
        var apps = [];
        for (var k = 0; k < APPS.length; k++) { apps.push(APPS[k].name); }
        return {
            theme: state.theme,
            themes: THEMES,
            profile: state.current ? { id: state.current.id, name: state.current.name, color: state.current.color } : null,
            profiles: profiles,
            favorites: getFavs(),
            progress: favProgressMap(),
            scenes: sceneList(),
            sleepMinutes: sleepRemainingMin(),
            city: settings.city,
            weather: weather.text ? $('weather-chip-text').textContent : '',
            recommendations: recs.list,
            apps: apps,
            settings: { effects: settings.effects, seconds: settings.seconds, aiGreeting: settings.aiGreeting },
            screen: topModalId() || 'dashboard',
            time: Date.now()
        };
    }

    function sendBridgeState() {
        cloud.dirty = true;
        if (!cloud.busy) { scheduleSync(300); } else { cloud.again = true; }
    }

    function pushBridgeState() {
        cloud.dirty = true;
        if (!bridge.connected) { return; }
        if (!cloud.busy) { scheduleSync(400); } else { cloud.again = true; }
    }

    function profileByName(name) {
        var n = String(name || '').toLowerCase().replace(/^\s+|\s+$/g, '');
        for (var i = 0; i < state.profiles.length; i++) {
            if (state.profiles[i].name.toLowerCase() === n) { return state.profiles[i]; }
        }
        return null;
    }

    function handleRemoteCommand(msg) {
        if (!msg || msg.type !== 'command') { return; }
        var res = { ok: true, info: '' };
        try {
            switch (msg.action) {
            case 'key':
                var keys = msg.keys || [msg.key];
                for (var i = 0; i < keys.length && i < 20; i++) {
                    var code = REMOTE_KEYS[keys[i]];
                    if (code) { onKeyDown({ keyCode: code, preventDefault: function () {} }); }
                }
                break;
            case 'setTheme':
                if (isValidTheme(msg.theme)) { applyTheme(msg.theme, true); } else { res = { ok: false, info: 'άγνωστο θέμα' }; }
                break;
            case 'openApp':
                var app = appByName(msg.app);
                if (app) { launchApp(app); res.info = app.name; } else { res = { ok: false, info: 'δεν βρέθηκε εφαρμογή' }; }
                break;
            case 'toast':
                showToast(String(msg.text || '').slice(0, 160));
                break;
            case 'say':
                var text = String(msg.text || '').slice(0, 200);
                typeMessage(text, true);
                showToast(text);
                break;
            case 'addFavorite':
                res.info = addFavorite(msg.title);
                res.ok = res.info === 'ok';
                break;
            case 'removeFavorite':
                res.ok = removeFavorite(msg.title);
                break;
            case 'openSeries':
                openSeries();
                break;
            case 'refreshRecs':
                if (topModalId() !== 'series-modal') { openSeries(); }
                loadRecs(true);
                break;
            case 'setSetting':
                res.ok = setSetting(msg.key, msg.value);
                break;
            case 'switchProfile':
                var p = profileByName(msg.name);
                if (!p) { res = { ok: false, info: 'δεν βρέθηκε προφίλ' }; }
                else if (state.current && state.current.id === p.id) { res.info = 'ήδη ενεργό'; }
                else if (limitReached(p)) { res = { ok: false, info: 'έφτασε το ημερήσιο όριο χρόνου' }; }
                else if (p.pinHash) { closeAllModals(); openProfiles(); pickProfile(p); res.info = 'ζητήθηκε PIN στην TV'; }
                else { login(p); }
                break;
            case 'openChat':
                openChat();
                if (msg.text) { sendChat(String(msg.text)); }
                break;
            case 'home':
                closeAllModals();
                break;
            case 'runScene':
                res.ok = runScene(msg.scene);
                if (!res.ok) { res.info = 'άγνωστη σκηνή'; }
                break;
            case 'setProgress':
                res.ok = setProgress(msg.title, msg.season, msg.episode);
                if (!res.ok) { res.info = 'χρειάζεται ενεργό προφίλ'; }
                break;
            case 'search':
                res = searchOnTv(msg.query, msg.platform);
                break;
            case 'sleep':
                setSleep(parseInt(msg.minutes, 10) || 0);
                break;
            case 'setCity':
                settings.city = cleanTitle(msg.city) || 'Αθήνα';
                saveSettings();
                loadWeather(true);
                break;
            case 'showPoll':
                if (msg.poll) { pollState = msg.poll; }
                openPoll();
                break;
            case 'getState':
                break;
            default:
                res = { ok: false, info: 'άγνωστη εντολή' };
            }
        } catch (e) {
            res = { ok: false, info: String(e && e.message ? e.message : e) };
        }
        sendBridge({ type: 'ack', id: msg.id, ok: res.ok, info: res.info });
        pushBridgeState();
    }

    /* =========================================================
       ΣΚΗΝΕΣ
       ========================================================= */
    var SCENES = [
        { id: 'movie', name: 'Βραδινή ταινία', theme: 'neon-dark', set: { effects: false }, app: 'Netflix' },
        { id: 'kids', name: 'Παιδιά', profile: 'Παιδιά', theme: 'soft-light', set: { effects: true }, app: 'Disney+' },
        { id: 'music', name: 'Μουσική', theme: 'neon-light', set: { effects: true }, app: 'Spotify' },
        { id: 'relax', name: 'Χαλάρωση', theme: 'rose-gold', set: { effects: true }, app: null }
    ];

    function sceneList() {
        var out = [];
        for (var i = 0; i < SCENES.length; i++) { out.push({ id: SCENES[i].id, name: SCENES[i].name, app: SCENES[i].app, theme: SCENES[i].theme }); }
        return out;
    }

    function renderScenes() {
        var html = '';
        for (var i = 0; i < SCENES.length; i++) {
            var s = SCENES[i];
            html += '<div class="theme-chip focusable" data-action="run-scene" data-scene="' + s.id + '" data-fk="scene-' + s.id + '">' +
                '<span class="scene-dot sc-' + s.id + '"></span><span>' + escapeHtml(s.name) + '</span></div>';
        }
        $('scene-bar').innerHTML = html;
    }

    function runScene(id) {
        var scene = null;
        for (var i = 0; i < SCENES.length; i++) { if (SCENES[i].id === id) { scene = SCENES[i]; } }
        if (!scene) { return false; }
        if (scene.profile) {
            var p = profileByName(scene.profile);
            if (!p) {
                showToast('Φτιάξε ένα προφίλ «' + scene.profile + '» για να δουλέψει πλήρως η σκηνή');
            } else if (!state.current || state.current.id !== p.id) {
                if (limitReached(p)) { showToast('Το «' + p.name + '» έφτασε το ημερήσιο όριο'); return true; }
                if (p.pinHash) { closeAllModals(); openProfiles(); pickProfile(p); showToast('Βάλε το PIN και ξανατρέξε τη σκηνή'); return true; }
                login(p);
            }
        }
        closeAllModals();
        applyTheme(scene.theme, false);
        for (var k in scene.set) { if (scene.set.hasOwnProperty(k)) { settings[k] = scene.set[k]; } }
        saveSettings();
        applyBodyClass();
        showToast('Σκηνή: ' + scene.name);
        if (scene.app) {
            var app = appByName(scene.app);
            if (app) { setTimeout(function () { launchApp(app); }, 900); }
        }
        return true;
    }

    /* =========================================================
       WATCHLIST: ΠΡΟΟΔΟΣ ΣΕΖΟΝ / ΕΠΕΙΣΟΔΙΟ
       ========================================================= */
    var faTitle = null;

    function progressKey(title) { return cleanTitle(title).toLowerCase(); }

    function getProgress(title) {
        if (!state.current) { return null; }
        var all = storage.get(STORAGE.PROGRESS, {});
        var mine = all[state.current.id] || {};
        return mine[progressKey(title)] || null;
    }

    function progressLabel(p) {
        return p ? 'S' + p.s + ' · E' + p.e : '';
    }

    function setProgress(title, season, episode) {
        title = cleanTitle(title);
        if (!title || !state.current) { return false; }
        var s = Math.max(1, parseInt(season, 10) || 1);
        var e = Math.max(1, parseInt(episode, 10) || 1);
        var favs = getFavs();
        var inFavs = false;
        for (var i = 0; i < favs.length; i++) { if (favs[i].toLowerCase() === title.toLowerCase()) { inFavs = true; title = favs[i]; } }
        if (!inFavs && favs.length < MAX_FAVS) { favs.push(title); setFavs(favs); }
        var all = storage.get(STORAGE.PROGRESS, {});
        var mine = all[state.current.id] || {};
        mine[progressKey(title)] = { title: title, s: s, e: e, t: Date.now() };
        all[state.current.id] = mine;
        storage.set(STORAGE.PROGRESS, all);
        if (topModalId() === 'series-modal') { renderFavs(); }
        if (topModalId() === 'fav-actions-modal') { renderFavActions(); }
        renderAI(false);
        pushBridgeState();
        return true;
    }

    function deleteProgress(title) {
        if (!state.current) { return; }
        var all = storage.get(STORAGE.PROGRESS, {});
        if (all[state.current.id]) { delete all[state.current.id][progressKey(title)]; storage.set(STORAGE.PROGRESS, all); }
    }

    function favProgressMap() {
        var favs = getFavs();
        var out = {};
        for (var i = 0; i < favs.length; i++) {
            var p = getProgress(favs[i]);
            if (p) { out[favs[i]] = { season: p.s, episode: p.e }; }
        }
        return out;
    }

    /* Η σειρά που είδες πιο πρόσφατα (για την υπενθύμιση στην αρχική) */
    function continueWatching() {
        var favs = getFavs();
        var best = null;
        for (var i = 0; i < favs.length; i++) {
            var p = getProgress(favs[i]);
            if (p && (!best || p.t > best.t)) { best = p; }
        }
        return best;
    }

    function openFavActions(title) {
        faTitle = title;
        renderFavActions();
        openModal('fav-actions-modal', 'fa-next-ep');
    }

    function renderFavActions() {
        var p = getProgress(faTitle);
        $('fa-title').textContent = faTitle;
        $('fa-season').textContent = p ? p.s : '—';
        $('fa-episode').textContent = p ? p.e : '—';
    }

    function favAction(op) {
        if (!faTitle) { return; }
        var p = getProgress(faTitle) || { s: 1, e: 0 };
        if (op === 'next-ep') { setProgress(faTitle, p.s, p.e + 1); showToast(faTitle + ' · S' + p.s + ' · E' + (p.e + 1)); }
        else if (op === 'prev-ep') { setProgress(faTitle, p.s, Math.max(1, p.e - 1)); }
        else if (op === 'next-season') { setProgress(faTitle, p.s + 1, 1); showToast(faTitle + ' · νέα σεζόν ' + (p.s + 1)); }
        else if (op === 'trailer') { searchOnTv(faTitle + ' trailer', 'YouTube'); }
        else if (op === 'remove') { var t = faTitle; closeModal(); removeFavorite(t); faTitle = null; }
    }

    /* =========================================================
       ΑΝΑΖΗΤΗΣΗ ΜΕΣΑ ΣΤΙΣ ΕΦΑΡΜΟΓΕΣ
       ========================================================= */
    function openUrlOnTv(url, label) {
        if (!hasTizen()) { showToast(label + ' (λειτουργεί στην TV)'); return; }
        launchUrl({ name: label, url: url });
    }

    function searchOnTv(query, platform) {
        query = String(query || '').replace(/^\s+|\s+$/g, '').slice(0, 120);
        if (!query) { return { ok: false, info: 'κενή αναζήτηση' }; }
        var app = platform ? appByName(platform) : null;
        var name = app ? app.name : 'YouTube';
        if (name === 'YouTube') {
            openUrlOnTv('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), 'YouTube: «' + query + '»');
            return { ok: true, info: 'YouTube αναζήτηση μέσω browser' };
        }
        if (name === 'Internet') {
            openUrlOnTv('https://www.google.com/search?q=' + encodeURIComponent(query), 'Google: «' + query + '»');
            return { ok: true, info: 'Google αναζήτηση' };
        }
        // Netflix / Prime / Disney+ κ.λπ. δεν δέχονται αναζήτηση απ' έξω: άνοιγμα + υπενθύμιση
        launchApp(app);
        setTimeout(function () { showToast('Αναζήτησε «' + query + '» στο ' + app.name); }, 1200);
        return { ok: true, info: 'άνοιξε το ' + app.name + ' (η αναζήτηση γίνεται μέσα στην εφαρμογή)' };
    }

    /* =========================================================
       ΚΑΙΡΟΣ (Open-Meteo, χωρίς κλειδί)
       ========================================================= */
    var weather = { text: '', t: 0, loading: false };

    function xhrJson(url, cb) {
        var x = new XMLHttpRequest();
        x.open('GET', url, true);
        x.timeout = 15000;
        x.onload = function () { var data = null; try { data = JSON.parse(x.responseText); } catch (e) { /* ignore */ } cb(x.status === 200 && data ? null : 'error', data); };
        x.onerror = function () { cb('error'); };
        x.ontimeout = function () { cb('timeout'); };
        x.send();
    }

    function upperNoAccents(s) {
        s = String(s || '');
        try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* old engine */ }
        return s.toUpperCase();
    }

    function weatherDesc(code) {
        if (code === 0) { return 'ΑΙΘΡΙΟΣ'; }
        if (code <= 2) { return 'ΛΙΓΑ ΣΥΝΝΕΦΑ'; }
        if (code === 3) { return 'ΣΥΝΝΕΦΙΑ'; }
        if (code === 45 || code === 48) { return 'ΟΜΙΧΛΗ'; }
        if (code >= 51 && code <= 57) { return 'ΨΙΧΑΛΕΣ'; }
        if (code >= 61 && code <= 67) { return 'ΒΡΟΧΗ'; }
        if ((code >= 71 && code <= 77) || code === 85 || code === 86) { return 'ΧΙΟΝΙ'; }
        if (code >= 80 && code <= 82) { return 'ΜΠΟΡΕΣ'; }
        if (code >= 95) { return 'ΚΑΤΑΙΓΙΔΑ'; }
        return '';
    }

    function renderWeather(w) {
        $('weather-chip-text').textContent = w ? Math.round(w.temp) + '° ' + upperNoAccents(w.city) + (w.desc ? ' · ' + w.desc : '') : 'ΚΑΙΡΟΣ: —';
        weather.text = w ? Math.round(w.temp) + '°C, ' + (w.desc ? w.desc.toLowerCase() : '') + ' στην πόλη ' + w.city : '';
    }

    function loadWeather(force) {
        var city = settings.city || 'Αθήνα';
        var cached = storage.get(STORAGE.WEATHER, null);
        if (!force && cached && cached.city === city && Date.now() - cached.t < 30 * 60000) {
            weather.t = cached.t;
            renderWeather(cached);
            return;
        }
        weather.loading = true;
        weather.t = Date.now();
        xhrJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=el&name=' + encodeURIComponent(city), function (err, geo) {
            var place = !err && geo && geo.results && geo.results[0];
            if (!place) { weather.loading = false; renderWeather(null); if (force) { showToast('Δεν βρέθηκε η πόλη «' + city + '»'); } return; }
            xhrJson('https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code&timezone=auto&latitude=' + place.latitude + '&longitude=' + place.longitude, function (err2, f) {
                weather.loading = false;
                if (err2 || !f || !f.current) { renderWeather(null); return; }
                var w = { city: place.name, temp: f.current.temperature_2m, desc: weatherDesc(f.current.weather_code), t: Date.now() };
                storage.set(STORAGE.WEATHER, w);
                renderWeather(w);
                pushBridgeState();
                if (force) { showToast('Καιρός: ' + Math.round(w.temp) + '° ' + w.city); }
            });
        });
    }

    function saveCityFromInput() {
        settings.city = cleanTitle($('city-input').value) || 'Αθήνα';
        saveSettings();
        loadWeather(true);
    }

    /* =========================================================
       ΧΡΟΝΟΔΙΑΚΟΠΤΗΣ ΥΠΝΟΥ
       ========================================================= */
    var SLEEP_OPTIONS = [0, 15, 30, 60, 90, 120];
    var sleepState = { until: 0, warned: false, sleeping: false, minutes: 0 };

    function sleepRemainingMin() {
        return sleepState.until ? Math.max(0, Math.ceil((sleepState.until - Date.now()) / 60000)) : 0;
    }

    function renderSleepBtn() {
        var el = $('sleep-btn');
        if (el) {
            el.textContent = sleepState.until ? 'Ύπνος σε ' + sleepRemainingMin() + '′' : 'Χρονοδιακόπτης ύπνου: ΟΧΙ';
            el.classList.toggle('on', !!sleepState.until);
        }
    }

    function setSleep(minutes) {
        sleepState.minutes = minutes;
        sleepState.warned = false;
        sleepState.until = minutes > 0 ? Date.now() + minutes * 60000 : 0;
        renderSleepBtn();
        showToast(minutes > 0 ? 'Χρονοδιακόπτης ύπνου: ' + minutes + ' λεπτά' : 'Ο χρονοδιακόπτης ύπνου ακυρώθηκε');
        pushBridgeState();
    }

    function cycleSleep() {
        var idx = SLEEP_OPTIONS.indexOf(sleepState.until ? sleepState.minutes : 0);
        setSleep(SLEEP_OPTIONS[(idx + 1) % SLEEP_OPTIONS.length]);
    }

    function checkSleep(now) {
        if (!sleepState.until) { return; }
        if (!sleepState.warned && now >= sleepState.until - 60000) {
            sleepState.warned = true;
            showToast('Λειτουργία ύπνου σε 1 λεπτό · άλλαξέ το από τις Ρυθμίσεις');
        }
        if (now >= sleepState.until) { enterSleep(); }
        else if (topModalId() === 'settings-modal') { renderSleepBtn(); }
    }

    function enterSleep() {
        sleepState.until = 0;
        sleepState.sleeping = true;
        try { video().pause(); } catch (e) { /* ignore */ }
        closeAllModals();
        $('sleep-overlay').classList.remove('hidden');
        pushBridgeState();
    }

    function wakeUp() {
        sleepState.sleeping = false;
        $('sleep-overlay').classList.add('hidden');
        renderSleepBtn();
        showToast('Καλώς ήρθες πίσω');
    }

    /* =========================================================
       ΗΜΕΡΗΣΙΟ ΟΡΙΟ ΧΡΟΝΟΥ ΑΝΑ ΠΡΟΦΙΛ
       ========================================================= */
    var LIMIT_OPTIONS = [0, 30, 60, 90, 120, 180];
    var screenAcc = 0;
    var hiddenAt = 0;
    var limitWarned = {};

    function todayKey() {
        var d = new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }

    function getScreenMin(pid) {
        var all = storage.get(STORAGE.SCREEN, {});
        var e = all[pid];
        return e && e.day === todayKey() ? e.min : 0;
    }

    function addScreenTime(pid, minutes) {
        var all = storage.get(STORAGE.SCREEN, {});
        var e = all[pid];
        if (!e || e.day !== todayKey()) { e = { day: todayKey(), min: 0 }; }
        e.min += minutes;
        all[pid] = e;
        storage.set(STORAGE.SCREEN, all);
    }

    function limitLabel(limit) {
        if (!limit) { return 'ΚΑΝΕΝΑ'; }
        return limit >= 60 ? (limit / 60) + ' ώρ' + (limit === 60 ? 'α' : 'ες') : limit + '′';
    }

    function remainingLabel(p) {
        var left = Math.max(0, (p.limit || 0) - getScreenMin(p.id));
        return left ? left + '′ ακόμα' : 'τέλος χρόνου';
    }

    function limitReached(p) {
        return !!(p && p.limit && getScreenMin(p.id) >= p.limit);
    }

    /* Όρια αλλάζουν μόνο από γονέα: αν υπάρχει προφίλ με PIN, πρέπει να είναι ενεργό ένα προφίλ με PIN */
    function canEditLimits() {
        var anyPin = false;
        for (var i = 0; i < state.profiles.length; i++) { if (state.profiles[i].pinHash) { anyPin = true; } }
        return !anyPin || !!(state.current && state.current.pinHash);
    }

    function cycleLimit(profile) {
        if (!canEditLimits()) { showToast('Τα όρια αλλάζουν μόνο από προφίλ γονέα με PIN'); return; }
        var idx = LIMIT_OPTIONS.indexOf(profile.limit || 0);
        profile.limit = LIMIT_OPTIONS[(idx + 1) % LIMIT_OPTIONS.length];
        saveProfiles();
        renderProfiles();
        showToast('«' + profile.name + '» · ημερήσιο όριο: ' + limitLabel(profile.limit));
    }

    function checkLimit() {
        var p = state.current;
        if (!p || !p.limit) { return; }
        var left = p.limit - getScreenMin(p.id);
        if (left <= 5 && left > 0 && limitWarned[p.id] !== todayKey()) {
            limitWarned[p.id] = todayKey();
            showToast('«' + p.name + '»: απομένουν ' + left + ' λεπτά για σήμερα');
        }
        if (left <= 0) {
            state.current = null;
            storage.remove(STORAGE.LAST_PROFILE);
            resetChat();
            renderBadge();
            updateGreeting();
            closeAllModals();
            openProfiles();
            $('profile-modal-sub').textContent = 'Τέλος χρόνου για σήμερα για «' + p.name + '». Τα λέμε αύριο!';
            showToast('Τέλος χρόνου για σήμερα για «' + p.name + '»');
            pushBridgeState();
        }
    }

    function tickSecond() {
        var now = Date.now();
        if (state.current && !document.hidden && !sleepState.sleeping) {
            screenAcc += 1;
            if (screenAcc >= 60) { screenAcc = 0; addScreenTime(state.current.id, 1); checkLimit(); }
        }
        checkSleep(now);
        if (!weather.loading && now - weather.t > 30 * 60000) { loadWeather(false); }
    }

    /* Επιστροφή από άλλη εφαρμογή (Netflix κ.λπ.): προσθήκη του χρόνου που πέρασε */
    function onResume() {
        var now = Date.now();
        if (hiddenAt && state.current) {
            var mins = Math.min(240, Math.floor((now - hiddenAt) / 60000));
            if (mins > 0) { addScreenTime(state.current.id, mins); }
        }
        hiddenAt = 0;
        checkLimit();
        checkSleep(now);
        if (!bridge.connected) { connectBridge(); }
    }

    /* =========================================================
       ΤΙ ΒΛΕΠΟΥΜΕ ΑΠΟΨΕ (ψηφοφορία από τα κινητά)
       ========================================================= */
    var pollState = null;

    function sortedPoll() {
        var items = (pollState && pollState.items) ? pollState.items.slice() : [];
        items.sort(function (a, b) { return (b.votes || []).length - (a.votes || []).length; });
        return items;
    }

    function renderPoll() {
        var items = sortedPoll();
        var max = items.length ? Math.max(1, (items[0].votes || []).length) : 1;
        var html = '';
        for (var i = 0; i < items.length && i < 6; i++) {
            var n = (items[i].votes || []).length;
            html += '<div class="poll-item"><span class="poll-bar" style="width:' + Math.round(n / max * 100) + '%"></span>' +
                '<span class="poll-title">' + (i === 0 && n ? '★ ' : '') + escapeHtml(items[i].title) +
                (items[i].platform ? ' <span class="muted">· ' + escapeHtml(items[i].platform) + '</span>' : '') + '</span>' +
                '<span class="poll-votes">' + n + ' ψήφ' + (n === 1 ? 'ος' : 'οι') + '</span></div>';
        }
        if (!items.length) { html = '<div class="poll-empty muted">Δεν υπάρχουν προτάσεις ακόμα. Προσθέστε από το κινητό.</div>'; }
        $('poll-list').innerHTML = html;
    }

    function openPoll() {
        renderPoll();
        if (topModalId() !== 'poll-modal') { openModal('poll-modal', 'poll-win'); }
    }

    function openPollWinner() {
        var items = sortedPoll();
        if (!items.length || !(items[0].votes || []).length) { showToast('Δεν υπάρχει νικητής ακόμα'); return; }
        var w = items[0];
        closeModal();
        if (w.platform && appByName(w.platform)) { searchOnTv(w.title, w.platform); }
        else { showToast('Απόψε βλέπουμε: «' + w.title + '»'); }
    }

    function openSettingsExtras() {
        $('city-input').value = settings.city || '';
        renderSleepBtn();
    }

    /* =========================================================
       INIT
       ========================================================= */
    function init() {
        registerKeys();
        loadSettings();
        loadProfiles();
        applyTheme(storage.get(STORAGE.THEME, DEFAULT_THEME), false);
        renderApps();
        renderScenes();
        renderSettingsThemes();
        applyTheme(state.theme, false);   // σήμανση ενεργού chip
        bindPlayer();
        bindPointer();
        $('np-name').addEventListener('input', updateNpPreview);
        document.addEventListener('keydown', onKeyDown);

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { try { video().pause(); } catch (e) { /* ignore */ } hiddenAt = Date.now(); }
            else { onResume(); }
        });

        // Auto-login στο τελευταίο προφίλ
        var lastId = storage.get(STORAGE.LAST_PROFILE, null);
        state.current = lastId ? findProfile(lastId) : null;
        if (!state.current) { storage.remove(STORAGE.LAST_PROFILE); }

        renderBadge();
        updateGreeting();
        startClock();
        focusByFk($('dashboard'), 'app-0');

        if (!state.current) { openProfiles(); }
        connectBridge();
        loadWeather(false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
