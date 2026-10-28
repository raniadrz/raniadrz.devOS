// Samsung SmartThings: έλεγχος της TV από το cloud, ανεξάρτητα από το ποια εφαρμογή είναι ανοιχτή.
// Πρόσβαση: είτε SMARTTHINGS_TOKEN (Personal Access Token, λήγει σε 24 ώρες)
//           είτε OAuth με refresh token (μόνιμο, «Σύνδεση με Samsung» από τις Ρυθμίσεις).
import crypto from 'node:crypto';
import { cmd } from './store.js';

const API = 'https://api.smartthings.com/v1';
const AUTHORIZE_URL = 'https://api.smartthings.com/oauth/authorize';
const TOKEN_URL = 'https://auth-global.api.smartthings.com/oauth/token';
const SCOPES = ['r:devices:*', 'x:devices:*'];
const env = (k) => process.env[k] || '';

/* Samsung Tizen App IDs */
export const APP_IDS = {
    'YouTube': '111299001912',
    'Netflix': '3201907018807',
    'Prime Video': '3201910019365',
    'Disney+': '3201901017640',
    'Apple TV': '3201807016597',
    'Spotify': '3201606009684',
    'Plex': '3201512006963',
    'Internet': 'org.tizen.browser',
    'raniadrz.dev OS': 'RaniaDrzOS.Launcher'
};
export const LAUNCHER = 'raniadrz.dev OS';

const KEYS = {
    left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN', enter: 'OK', ok: 'OK',
    back: 'BACK', home: 'HOME', menu: 'MENU', exit: 'EXIT', play: 'PLAY', pause: 'PAUSE'
};

/* ---------------- Tokens ---------------- */
async function readJson(key) {
    const raw = await cmd('GET', key);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

async function clientCreds() {
    if (env('SMARTTHINGS_CLIENT_ID') && env('SMARTTHINGS_CLIENT_SECRET')) {
        return { id: env('SMARTTHINGS_CLIENT_ID'), secret: env('SMARTTHINGS_CLIENT_SECRET') };
    }
    return readJson('st:client');
}

async function tokenRequest(c, params) {
    const r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + Buffer.from(`${c.id}:${c.secret}`).toString('base64')
        },
        body: new URLSearchParams({ ...params, client_id: c.id }),
        signal: AbortSignal.timeout(15000)
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.access_token) throw new Error('SmartThings OAuth: ' + (d?.error_description || d?.error || `HTTP ${r.status}`));
    return d;
}

async function saveOauth(t, previous) {
    await cmd('SET', 'st:oauth', JSON.stringify({
        access_token: t.access_token,
        refresh_token: t.refresh_token || previous?.refresh_token,
        expires_at: Date.now() + (Number(t.expires_in) || 86400) * 1000
    }));
}

export async function accessToken() {
    const o = await readJson('st:oauth');
    if (o?.refresh_token) {
        if (o.access_token && Date.now() < o.expires_at - 120000) return o.access_token;
        const c = await clientCreds();
        if (c) {
            try {
                const t = await tokenRequest(c, { grant_type: 'refresh_token', refresh_token: o.refresh_token });
                await saveOauth(t, o);
                return t.access_token;
            } catch (e) {
                console.error('SmartThings refresh failed', e.message);
            }
        }
    }
    return env('SMARTTHINGS_TOKEN') || null;
}

export async function isConfigured() {
    if (env('SMARTTHINGS_TOKEN')) return true;
    return !!(await cmd('GET', 'st:oauth'));
}

/* ---------------- REST ---------------- */
async function st(path, opts = {}, token) {
    const tok = token || await accessToken();
    if (!tok) {
        const e = new Error('Το SmartThings δεν έχει συνδεθεί');
        e.code = 'not_configured';
        throw e;
    }
    const r = await fetch(API + path, {
        ...opts,
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers || {}) },
        signal: AbortSignal.timeout(15000)
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) {
        const msg = d?.error?.message || d?.message || `HTTP ${r.status}`;
        const e = new Error(r.status === 401 ? 'Το κλειδί SmartThings έληξε ή δεν ισχύει' : 'SmartThings: ' + msg);
        e.status = r.status;
        throw e;
    }
    return d;
}

export async function findTv() {
    const fixed = env('SMARTTHINGS_DEVICE_ID') || await cmd('GET', 'st:device');
    if (fixed) return fixed;
    const d = await st('/devices');
    const items = d?.items || [];
    const hasCap = (dev, cap) => (dev.components || []).some(c => (c.capabilities || []).some(x => x.id === cap));
    const isTv = (dev) => (dev.components || []).some(c => (c.categories || []).some(k => k.name === 'Television'));
    const tv = items.find(x => hasCap(x, 'samsungvd.remoteControl')) || items.find(isTv) || items.find(x => hasCap(x, 'tvChannel'));
    if (!tv) throw new Error('Δεν βρέθηκε TV στον λογαριασμό SmartThings');
    await cmd('SET', 'st:device', tv.deviceId);
    await cmd('SET', 'st:deviceName', tv.label || tv.name || 'Samsung TV');
    return tv.deviceId;
}

export async function commands(list) {
    const id = await findTv();
    return st(`/devices/${id}/commands`, {
        method: 'POST',
        body: JSON.stringify({ commands: list.map(c => ({ component: 'main', arguments: [], ...c })) })
    });
}

export async function status() {
    if (!(await isConfigured())) return { configured: false };
    try {
        const id = await findTv();
        const s = await st(`/devices/${id}/status`);
        const m = s?.components?.main || {};
        return {
            configured: true,
            oauth: !!(await cmd('GET', 'st:oauth')),
            name: await cmd('GET', 'st:deviceName'),
            power: m.switch?.switch?.value || null,
            volume: m.audioVolume?.volume?.value ?? null,
            mute: m.audioMute?.mute?.value || null,
            input: m.mediaInputSource?.inputSource?.value || null
        };
    } catch (e) {
        return { configured: true, error: e.message };
    }
}

/* ---------------- Ενέργειες ---------------- */
export async function sendKeys(keys) {
    for (const k of keys.slice(0, 20)) {
        const v = KEYS[String(k).toLowerCase()] || String(k).toUpperCase();
        try {
            await commands([{ capability: 'samsungvd.remoteControl', command: 'send', arguments: [v, 'PRESS_AND_RELEASE'] }]);
        } catch (e) {
            if (e.status !== 422 && e.status !== 400) throw e;
            await commands([{ capability: 'samsungvd.remoteControl', command: 'send', arguments: [v] }]);
        }
    }
    return { ok: true, info: 'SmartThings' };
}

export async function launchApp(name) {
    const appId = APP_IDS[name] || name;
    await commands([{ capability: 'custom.launchapp', command: 'launchApp', arguments: [appId] }]);
    return { ok: true, info: `άνοιξε: ${name}` };
}

export async function power(on) {
    await commands([{ capability: 'switch', command: on ? 'on' : 'off' }]);
    return { ok: true, info: on ? 'άναμμα' : 'σβήσιμο' };
}

export async function volume(action, level) {
    if (action === 'up') await commands([{ capability: 'audioVolume', command: 'volumeUp' }]);
    else if (action === 'down') await commands([{ capability: 'audioVolume', command: 'volumeDown' }]);
    else if (action === 'set') await commands([{ capability: 'audioVolume', command: 'setVolume', arguments: [Math.max(0, Math.min(100, Number(level) || 0))] }]);
    else if (action === 'mute') await commands([{ capability: 'audioMute', command: 'mute' }]);
    else if (action === 'unmute') await commands([{ capability: 'audioMute', command: 'unmute' }]);
    else throw new Error('άγνωστη ενέργεια έντασης');
    return { ok: true, info: 'ένταση: ' + action };
}

export async function media(action) {
    const map = { play: 'play', pause: 'pause', stop: 'stop', forward: 'fastForward', rewind: 'rewind' };
    if (!map[action]) throw new Error('άγνωστη ενέργεια αναπαραγωγής');
    try {
        await commands([{ capability: 'mediaPlayback', command: map[action] }]);
    } catch (e) {
        if (action !== 'play' && action !== 'pause') throw e;
        await sendKeys([action]);
    }
    return { ok: true, info: action };
}

/* ---------------- Μόνιμη σύνδεση (OAuth) ---------------- */
async function ensureClient(redirectUri) {
    const existing = await clientCreds();
    if (existing) return existing;
    const pat = env('SMARTTHINGS_TOKEN');
    if (!pat) throw new Error('Βάλε πρώτα SMARTTHINGS_TOKEN στο Vercel για να δημιουργηθεί η μόνιμη σύνδεση');
    const body = {
        appName: 'raniadrz-os-' + crypto.randomBytes(3).toString('hex'),
        displayName: 'raniadrz.dev OS',
        description: 'Web companion για την Samsung TV',
        appType: 'API_ONLY',
        classifications: ['CONNECTED_SERVICE'],
        singleInstance: true,
        apiOnly: {},
        oauth: { clientName: 'raniadrz.dev OS', scope: SCOPES, redirectUris: [redirectUri] }
    };
    const d = await st('/apps?signatureType=ST_PADLOCK&requireConfirmation=false', { method: 'POST', body: JSON.stringify(body) }, pat);
    const c = { id: d?.oauthClientId, secret: d?.oauthClientSecret };
    if (!c.id || !c.secret) throw new Error('Δεν δημιουργήθηκε OAuth client στο SmartThings');
    await cmd('SET', 'st:client', JSON.stringify(c));
    return c;
}

export async function oauthStartUrl(redirectUri) {
    const c = await ensureClient(redirectUri);
    const state = crypto.randomBytes(16).toString('hex');
    await cmd('SET', 'st:state:' + state, '1', 'EX', 600);
    const q = new URLSearchParams({ client_id: c.id, response_type: 'code', redirect_uri: redirectUri, scope: SCOPES.join(' '), state });
    return `${AUTHORIZE_URL}?${q}`;
}

export async function oauthCallback(code, state, redirectUri) {
    if (!state || !(await cmd('GET', 'st:state:' + state))) throw new Error('Η σύνδεση έληξε · ξαναδοκίμασε');
    await cmd('DEL', 'st:state:' + state);
    const c = await clientCreds();
    if (!c) throw new Error('Λείπει ο OAuth client');
    const t = await tokenRequest(c, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    await saveOauth(t);
    await cmd('DEL', 'st:device');
}
