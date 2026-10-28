// raniadrz.dev OS · Companion API (κοινό για Vercel και τοπικό server)
// TV  ⇄  /api/tv/*   (κλειδί συσκευής TV_KEY)
// Web ⇄  /api/*      (κωδικός σύνδεσης, προεπιλογή 1912, αλλάζει από τις Ρυθμίσεις)
import crypto from 'node:crypto';
import { pipeline, transaction, cmd, storeKind } from './store.js';
import * as ST from './smartthings.js';

const env = (k, d = '') => process.env[k] || d;
const GEMINI_MODEL = () => env('GEMINI_MODEL', 'gemini-3.5-flash-lite');

const THEMES = ['neon-dark', 'neon-light', 'soft-light', 'rose-gold'];
const STREAMING = ['Netflix', 'Prime Video', 'Disney+', 'Apple TV', 'YouTube', 'Plex'];
const DEFAULT_APPS = ['YouTube', 'Netflix', 'Prime Video', 'Disney+', 'Apple TV', 'Spotify', 'Plex', 'Internet', 'Media Player', 'Σειρές AI'];
const DEFAULT_SCENES = ['movie', 'kids', 'music', 'relax'];

const K = {
    state: 'tv:state', seen: 'tv:seen', queue: 'tv:q', web: 'web:active',
    pin: 'auth:pinhash', poll: 'poll', pollVer: 'poll:ver'
};
const TV_ONLINE_MS = 40000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------------- HTTP βοηθητικά ---------------- */
function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tv-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
}

function json(res, code, obj) {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(obj));
}

async function readBody(req) {
    if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
        if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8') || '{}'); } catch { return {}; } }
        return req.body;
    }
    const chunks = [];
    let size = 0;
    for await (const c of req) {
        size += c.length;
        if (size > 1e6) throw new Error('Πολύ μεγάλο αίτημα');
        chunks.push(c);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Μη έγκυρο JSON'); }
}

function clientIp(req) {
    return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

/* ---------------- Κωδικός σύνδεσης (PIN) ---------------- */
function secret() {
    return env('AUTH_SECRET') || ('dev-' + env('GEMINI_API_KEY', 'local'));
}
function hashPin(pin) {
    return crypto.createHmac('sha256', secret()).update('pin|' + String(pin)).digest('hex');
}
let pinCache = { hash: null, t: 0 };
async function currentPinHash() {
    if (pinCache.hash && Date.now() - pinCache.t < 15000) return pinCache.hash;
    const stored = await cmd('GET', K.pin);
    pinCache = { hash: stored || hashPin(env('COMPANION_PIN', '1912')), t: Date.now() };
    return pinCache.hash;
}
function sign(iat, ph) {
    return crypto.createHmac('sha256', secret()).update(iat + '|' + ph).digest('hex').slice(0, 40);
}
function makeToken(ph) {
    const iat = Date.now().toString(36);
    return `${iat}.${sign(iat, ph)}`;
}
function tokenValid(token, ph) {
    const [iat, sig] = String(token || '').split('.');
    if (!iat || !sig) return false;
    if (Date.now() - parseInt(iat, 36) > 180 * 864e5) return false;   // 6 μήνες
    const exp = sign(iat, ph);
    return exp.length === sig.length && crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(sig));
}
function requestToken(req, url) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/);
    return m ? m[1] : url.searchParams.get('token');
}
function tvKeyOk(req) {
    const key = env('TV_KEY');
    const got = String(req.headers['x-tv-key'] || '');
    return !!key && got.length === key.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key));
}
async function tooManyAttempts(ip) {
    const [n] = await pipeline([['INCR', 'rl:' + ip], ['EXPIRE', 'rl:' + ip, 60]]);
    return n > 5;
}

/* ---------------- Κατάσταση TV & εντολές ---------------- */
async function getTv() {
    const [state, seen] = await pipeline([['GET', K.state], ['GET', K.seen]]);
    return {
        state: state ? JSON.parse(state) : null,
        connected: !!seen && Date.now() - Number(seen) < TV_ONLINE_MS
    };
}

async function tvAppOnline() {
    const seen = await cmd('GET', K.seen);
    return !!seen && Date.now() - Number(seen) < TV_ONLINE_MS;
}

async function enqueueAndWait(c, timeoutMs) {
    const id = crypto.randomBytes(6).toString('hex');
    await pipeline([
        ['RPUSH', K.queue, JSON.stringify({ ...c, type: 'command', id })],
        ['EXPIRE', K.queue, 300],
        ['SET', K.web, '1', 'EX', 45]
    ]);
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        await sleep(700);
        const a = await cmd('GET', 'ack:' + id);
        if (a) return JSON.parse(a);
    }
    return { ok: true, info: 'στάλθηκε · η TV θα το εκτελέσει σε λίγο' };
}

/* Εντολή μόνο προς την εφαρμογή raniadrz.dev OS */
async function sendToApp(c, timeoutMs = 9000) {
    if (!(await tvAppOnline())) return { ok: false, info: 'Το raniadrz.dev OS δεν τρέχει στην TV' };
    return enqueueAndWait(c, timeoutMs);
}

/* Καθολική εντολή:
   - Πλήκτρα & εφαρμογές τρίτων → SmartThings (δουλεύουν μέσα σε Netflix, YouTube κ.λπ.)
   - Λειτουργίες του raniadrz.dev OS → η εφαρμογή· αν δεν τρέχει, την ανοίγει το SmartThings πρώτα */
async function sendToTv(c, timeoutMs = 9000) {
    const stOn = await ST.isConfigured().catch(() => false);
    if (stOn) {
        try {
            if (c.action === 'key') return await ST.sendKeys(c.keys || [c.key]);
            if (c.action === 'openApp' && ST.APP_IDS[c.app]) return await ST.launchApp(c.app);
            if (c.action === 'openLauncher') return await ST.launchApp(ST.LAUNCHER);
        } catch (e) {
            if (!(await tvAppOnline())) return { ok: false, info: e.message };
        }
    }
    if (await tvAppOnline()) return enqueueAndWait(c, timeoutMs);
    if (stOn) {
        try { await ST.launchApp(ST.LAUNCHER); } catch (e) { return { ok: false, info: e.message }; }
        if (c.action === 'home' || c.action === 'openLauncher') return { ok: true, info: 'άνοιξε το raniadrz.dev OS' };
        return enqueueAndWait(c, 20000);
    }
    return { ok: false, info: 'Η TV δεν είναι συνδεδεμένη' };
}

async function stSafe(fn) {
    try { return await fn(); } catch (e) { return { ok: false, info: e.message }; }
}

async function tvSync(b) {
    const before = [];
    if (b.state && typeof b.state === 'object') before.push(['SET', K.state, JSON.stringify({ ...b.state, syncedAt: Date.now() })]);
    for (const a of (Array.isArray(b.acks) ? b.acks : []).slice(0, 50)) {
        if (a && a.id) before.push(['SET', 'ack:' + String(a.id).slice(0, 24), JSON.stringify({ ok: a.ok !== false, info: String(a.info || '') }), 'EX', 60]);
    }
    before.push(['SET', K.seen, String(Date.now()), 'EX', 120]);
    before.push(['EXISTS', K.web]);
    before.push(['GET', K.pollVer]);
    const r = await pipeline(before);
    const webActive = Number(r[r.length - 2]) === 1;
    const pollVer = r[r.length - 1] || '0';

    const [queued] = await transaction([['LRANGE', K.queue, 0, -1], ['DEL', K.queue]]);
    const commands = (queued || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);

    const out = { commands, next: webActive ? 1500 : 10000, pollVer };
    if (String(pollVer) !== String(b.pollVer ?? '')) out.poll = await getPoll();
    return out;
}

/* ---------------- Ψηφοφορία ---------------- */
async function getPoll() {
    const raw = await cmd('GET', K.poll);
    return raw ? JSON.parse(raw) : { items: [], created: Date.now() };
}
async function savePoll(poll) {
    await pipeline([['SET', K.poll, JSON.stringify(poll)], ['INCR', K.pollVer]]);
    return poll;
}
function cleanText(t, max = 60) {
    return String(t || '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function voteIn(poll, id, voter, forceOn = false) {
    voter = cleanText(voter, 20);
    if (!voter) throw new Error('Γράψε το όνομά σου για να ψηφίσεις');
    const item = poll.items.find(i => i.id === id);
    if (!item) throw new Error('Δεν βρέθηκε η επιλογή');
    const had = item.votes.includes(voter);
    for (const i of poll.items) i.votes = i.votes.filter(v => v !== voter);
    if (!had || forceOn) item.votes.push(voter);
}
async function pollAdd(title, platform, voter) {
    title = cleanText(title);
    if (!title) throw new Error('Γράψε τίτλο');
    const poll = await getPoll();
    let item = poll.items.find(i => i.title.toLowerCase() === title.toLowerCase());
    if (!item) {
        if (poll.items.length >= 12) throw new Error('Έως 12 επιλογές');
        item = { id: crypto.randomBytes(4).toString('hex'), title, platform: cleanText(platform, 20), by: cleanText(voter, 20), votes: [] };
        poll.items.push(item);
    }
    if (cleanText(voter)) voteIn(poll, item.id, voter, true);
    return savePoll(poll);
}

/* ---------------- Gemini ---------------- */
async function gemini(body) {
    const key = env('GEMINI_API_KEY');
    if (!key) throw new Error('Λείπει το GEMINI_API_KEY');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(55000)
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
        const err = new Error(data?.error?.message || `Gemini HTTP ${r.status}`);
        err.status = r.status;
        throw err;
    }
    return data;
}

function textOf(parts = []) {
    return parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
}

function plain(text) {
    return String(text || '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/(^|[\s(«"])\*(\S[^*\n]*?)\*(?=$|[\s.,!?;:)»"])/g, '$1$2')
        .replace(/^\s*[*-]\s+/gm, '• ')
        .trim();
}

function tvSummary(tv, poll) {
    const s = tv.state;
    if (!s) return { connected: tv.connected };
    return {
        connected: tv.connected,
        theme: s.theme,
        profile: s.profile?.name || null,
        profiles: (s.profiles || []).map(p => p.name + (p.hasPin ? ' (PIN)' : '') + (p.limit ? ` (όριο ${p.limit}′, χρήση ${p.used}′)` : '')),
        favorites: s.favorites,
        progress: s.progress,
        apps: s.apps,
        settings: s.settings,
        screen: s.screen,
        scenes: s.scenes,
        sleepMinutes: s.sleepMinutes,
        weather: s.weather,
        city: s.city,
        pollOptions: (poll.items || []).map(i => `${i.title} (${i.votes.length} ψήφοι)`)
    };
}

function tools(state) {
    const apps = state?.apps?.length ? state.apps : DEFAULT_APPS;
    const scenes = state?.scenes?.length ? state.scenes.map(x => x.id) : DEFAULT_SCENES;
    return [{
        functionDeclarations: [
            { name: 'set_theme', description: 'Αλλάζει το θέμα της TV. neon-dark=Pink Neon Dark, neon-light=Pink Neon Light, soft-light=Pink Soft Light (παστέλ), rose-gold=Rose Gold.',
                parameters: { type: 'OBJECT', properties: { theme: { type: 'STRING', enum: THEMES } }, required: ['theme'] } },
            { name: 'open_app', description: 'Ανοίγει μια εφαρμογή στην TV.',
                parameters: { type: 'OBJECT', properties: { app: { type: 'STRING', enum: apps } }, required: ['app'] } },
            { name: 'press_keys', description: 'Πατάει πλήκτρα του τηλεχειριστηρίου με τη σειρά.',
                parameters: { type: 'OBJECT', properties: { keys: { type: 'ARRAY', items: { type: 'STRING', enum: ['left', 'right', 'up', 'down', 'enter', 'back'] } } }, required: ['keys'] } },
            { name: 'show_message', description: 'Δείχνει σύντομο μήνυμα στην οθόνη της TV (AURA).',
                parameters: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] } },
            { name: 'add_favorite_series', description: 'Προσθέτει σειρά στα αγαπημένα του ενεργού προφίλ.',
                parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' } }, required: ['title'] } },
            { name: 'remove_favorite_series', description: 'Αφαιρεί σειρά από τα αγαπημένα.',
                parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' } }, required: ['title'] } },
            { name: 'open_series_recommendations', description: 'Ανοίγει στην TV τις «Σειρές AI». refresh=true για νέες προτάσεις.',
                parameters: { type: 'OBJECT', properties: { refresh: { type: 'BOOLEAN' } } } },
            { name: 'switch_profile', description: 'Αλλάζει προφίλ στην TV. Αν έχει PIN, η TV το ζητά στην οθόνη.',
                parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] } },
            { name: 'set_setting', description: 'Ρύθμιση TV: effects (εφέ), seconds (δευτερόλεπτα ρολογιού), aiGreeting (AI briefing).',
                parameters: { type: 'OBJECT', properties: { key: { type: 'STRING', enum: ['effects', 'seconds', 'aiGreeting'] }, value: { type: 'BOOLEAN' } }, required: ['key', 'value'] } },
            { name: 'go_home', description: 'Κλείνει όλα τα παράθυρα στην TV και γυρίζει στην αρχική.' },
            { name: 'run_scene', description: 'Σκηνή: movie=Βραδινή ταινία, kids=Παιδιά, music=Μουσική, relax=Χαλάρωση.',
                parameters: { type: 'OBJECT', properties: { scene: { type: 'STRING', enum: scenes } }, required: ['scene'] } },
            { name: 'set_progress', description: 'Αποθηκεύει σε ποια σεζόν/επεισόδιο έμεινε ο χρήστης σε μια σειρά.',
                parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, season: { type: 'INTEGER' }, episode: { type: 'INTEGER' } }, required: ['title', 'season', 'episode'] } },
            { name: 'search_on_tv', description: 'Αναζήτηση στην TV. YouTube: αποτελέσματα (π.χ. trailer). Internet: Google. Άλλες πλατφόρμες: ανοίγει την εφαρμογή.',
                parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' }, platform: { type: 'STRING', enum: apps } }, required: ['query'] } },
            { name: 'set_sleep_timer', description: 'Χρονοδιακόπτης ύπνου σε λεπτά (0 = ακύρωση).',
                parameters: { type: 'OBJECT', properties: { minutes: { type: 'INTEGER' } }, required: ['minutes'] } },
            { name: 'add_poll_option', description: 'Προσθέτει επιλογή στην ψηφοφορία «Τι βλέπουμε απόψε;».',
                parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, platform: { type: 'STRING' } }, required: ['title'] } },
            { name: 'show_poll', description: 'Δείχνει την ψηφοφορία «Τι βλέπουμε απόψε;» στην TV.' },
            { name: 'tv_power', description: 'Ανάβει ή σβήνει την τηλεόραση (SmartThings).',
                parameters: { type: 'OBJECT', properties: { on: { type: 'BOOLEAN' } }, required: ['on'] } },
            { name: 'tv_volume', description: 'Ένταση της TV (SmartThings): up, down, mute, unmute ή set με level 0-100.',
                parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['up', 'down', 'mute', 'unmute', 'set'] }, level: { type: 'INTEGER' } }, required: ['action'] } },
            { name: 'tv_media', description: 'Έλεγχος αναπαραγωγής σε οποιαδήποτε εφαρμογή (SmartThings).',
                parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['play', 'pause', 'stop', 'forward', 'rewind'] } }, required: ['action'] } },
            { name: 'open_raniadrz_os', description: 'Ανοίγει την εφαρμογή raniadrz.dev OS στην TV (π.χ. όταν ο χρήστης είναι στο Netflix).' }
        ]
    }];
}

async function execTool(name, args = {}) {
    switch (name) {
        case 'set_theme': return sendToTv({ action: 'setTheme', theme: args.theme });
        case 'open_app': return sendToTv({ action: 'openApp', app: args.app });
        case 'press_keys': return sendToTv({ action: 'key', keys: args.keys || [] });
        case 'show_message': return sendToTv({ action: 'say', text: args.text });
        case 'add_favorite_series': return sendToTv({ action: 'addFavorite', title: args.title });
        case 'remove_favorite_series': return sendToTv({ action: 'removeFavorite', title: args.title });
        case 'open_series_recommendations': return sendToTv({ action: args.refresh ? 'refreshRecs' : 'openSeries' });
        case 'switch_profile': return sendToTv({ action: 'switchProfile', name: args.name });
        case 'set_setting': return sendToTv({ action: 'setSetting', key: args.key, value: args.value });
        case 'go_home': return sendToTv({ action: 'home' });
        case 'run_scene': return sendToTv({ action: 'runScene', scene: args.scene });
        case 'set_progress': return sendToTv({ action: 'setProgress', title: args.title, season: args.season, episode: args.episode });
        case 'search_on_tv': return sendToTv({ action: 'search', query: args.query, platform: args.platform });
        case 'set_sleep_timer': return sendToTv({ action: 'sleep', minutes: args.minutes });
        case 'add_poll_option':
            try { await pollAdd(args.title, args.platform, ''); return { ok: true, info: 'προστέθηκε' }; } catch (e) { return { ok: false, info: e.message }; }
        case 'show_poll': return sendToTv({ action: 'showPoll', poll: await getPoll() });
        case 'tv_power': return stSafe(() => ST.power(!!args.on));
        case 'tv_volume': return stSafe(() => ST.volume(args.action, args.level));
        case 'tv_media': return stSafe(() => ST.media(args.action));
        case 'open_raniadrz_os': return sendToTv({ action: 'openLauncher' });
        default: return { ok: false, info: 'άγνωστο εργαλείο' };
    }
}

async function aiChat(messages) {
    const [tv, poll, stOn] = await Promise.all([getTv(), getPoll(), ST.isConfigured().catch(() => false)]);
    const contents = messages.slice(-14).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(m.text || '').slice(0, 2000) }]
    }));
    const system =
        'Είσαι η AURA, ο AI βοηθός του raniadrz.dev OS (launcher σε Samsung Smart TV). ' +
        'Μιλάς πάντα ελληνικά, φιλικά και σύντομα, χωρίς markdown. Ελέγχεις την TV μέσω των εργαλείων σου: ' +
        'όταν ο χρήστης ζητά κάτι για την TV, κάλεσε το σωστό εργαλείο (μπορείς πολλά στη σειρά) και μετά επιβεβαίωσε τι έγινε. ' +
        'Για προτάσεις σειρών βασίσου στα αγαπημένα και στο πού έμεινε (progress). Αν πει «είμαι στη σεζόν Χ επεισόδιο Υ», αποθήκευσέ το με set_progress. ' +
        (stOn ? 'Το SmartThings είναι συνδεδεμένο: πλήκτρα, εφαρμογές, ένταση, αναπαραγωγή και άναμμα/σβήσιμο δουλεύουν ακόμα κι αν ο χρήστης είναι μέσα στο Netflix ή το YouTube· οι λειτουργίες του raniadrz.dev OS ανοίγουν την εφαρμογή αυτόματα. '
            : 'Αν η TV δεν είναι συνδεδεμένη, εξήγησε ότι πρέπει να ανοίξει το raniadrz.dev OS στην TV ή να συνδέσει το SmartThings. ') +
        'Τρέχουσα κατάσταση TV: ' + JSON.stringify(tvSummary(tv, poll));

    const actions = [];
    for (let round = 0; round < 5; round++) {
        const data = await gemini({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            tools: tools(tv.state),
            generationConfig: { temperature: 0.6, maxOutputTokens: 1200 }
        });
        const content = data.candidates?.[0]?.content;
        const parts = content?.parts || [];
        const calls = parts.filter(p => p.functionCall);
        if (!calls.length) return { reply: plain(textOf(parts)) || 'Έγινε!', actions };

        contents.push(content);
        const responses = [];
        for (const c of calls) {
            const { name, args = {}, id } = c.functionCall;
            const result = await execTool(name, args);
            actions.push({ name, args, ok: result.ok, info: result.info });
            const fr = { name, response: { ok: result.ok, info: result.info || '' } };
            if (id) fr.id = id;
            responses.push({ functionResponse: fr });
        }
        contents.push({ role: 'user', parts: responses });
    }
    return { reply: 'Ολοκλήρωσα τις ενέργειες.', actions };
}

async function aiSeries({ favorites, exclude = [] }) {
    const favs = Array.isArray(favorites) ? favorites.slice(0, 20) : ((await getTv()).state?.favorites || []);
    const prompt = (favs.length
        ? `Αγαπημένες σειρές του χρήστη: ${favs.join(', ')}. Πρότεινε 8 ΑΛΛΕΣ σειρές (όχι αυτές) που θα του αρέσουν, με παρόμοιο ύφος, θέματα ή ατμόσφαιρα.`
        : 'Ο χρήστης δεν έχει ακόμα αγαπημένες σειρές. Πρότεινε 8 δημοφιλείς, πολύ καλές σειρές διαφορετικών ειδών.') +
        ` Για κάθε σειρά: title, year, platform (μία από: ${STREAMING.join(', ')}), genre (στα ελληνικά, 1-2 λέξεις), reason (μία πρόταση στα ελληνικά, έως 110 χαρακτήρες).` +
        (exclude.length ? ` Μην προτείνεις: ${exclude.slice(0, 20).join(', ')}.` : '');
    const data = await gemini({
        systemInstruction: { parts: [{ text: 'Είσαι η AURA, ειδική σε τηλεοπτικές σειρές. Απαντάς μόνο με το ζητούμενο JSON.' }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: exclude.length ? 1.0 : 0.8,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'ARRAY',
                items: {
                    type: 'OBJECT',
                    properties: {
                        title: { type: 'STRING' }, year: { type: 'STRING' },
                        platform: { type: 'STRING', enum: STREAMING }, genre: { type: 'STRING' }, reason: { type: 'STRING' }
                    },
                    required: ['title', 'platform', 'reason']
                }
            }
        }
    });
    const list = JSON.parse(textOf(data.candidates?.[0]?.content?.parts) || '[]');
    return { recs: list.filter(r => r && r.title).slice(0, 8) };
}

/* Η TV ζητά Gemini μέσω του server: το κλειδί δεν υπάρχει πια μέσα στην εφαρμογή της TV */
async function tvGemini(b) {
    const body = b && typeof b.body === 'object' ? b.body : null;
    if (!body) return [400, { error: { message: 'Λείπει το αίτημα' } }];
    try {
        return [200, await gemini(body)];
    } catch (e) {
        return [e.status || 502, { error: { message: e.message } }];
    }
}

function stRedirectUri(req) {
    const base = env('CLOUD_URL') || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
    return base.replace(/\/+$/, '') + '/api/st/oauth/callback';
}

/* ---------------- Router ---------------- */
export async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname.replace(/\/+$/, '');
    cors(res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

    try {
        /* ----- TV ----- */
        if (p.startsWith('/api/tv/')) {
            if (!tvKeyOk(req)) return json(res, 401, { error: 'Λάθος κλειδί συσκευής' });
            if (p === '/api/tv/sync' && req.method === 'POST') return json(res, 200, await tvSync(await readBody(req)));
            if (p === '/api/tv/gemini' && req.method === 'POST') {
                const [code, data] = await tvGemini(await readBody(req));
                return json(res, code, data);
            }
            return json(res, 404, { error: 'Not found' });
        }

        /* ----- SmartThings OAuth επιστροφή (χωρίς κωδικό web, προστατεύεται με state) ----- */
        if (p === '/api/st/oauth/callback' && req.method === 'GET') {
            try {
                await ST.oauthCallback(url.searchParams.get('code'), url.searchParams.get('state'), stRedirectUri(req));
                res.statusCode = 302;
                res.setHeader('Location', '/?st=ok');
            } catch (e) {
                res.statusCode = 302;
                res.setHeader('Location', '/?st=error&msg=' + encodeURIComponent(e.message));
            }
            return res.end();
        }

        /* ----- Σύνδεση web ----- */
        if (p === '/api/login' && req.method === 'POST') {
            if (await tooManyAttempts(clientIp(req))) return json(res, 429, { error: 'Πολλές προσπάθειες · περίμενε 1 λεπτό' });
            const { pin } = await readBody(req);
            const ph = await currentPinHash();
            if (hashPin(String(pin || '').trim()) !== ph) return json(res, 401, { error: 'Λάθος κωδικός' });
            return json(res, 200, { token: makeToken(ph) });
        }

        const ph = await currentPinHash();
        const authed = tokenValid(requestToken(req, url), ph);
        if (p === '/api/auth') return json(res, 200, { ok: authed });
        if (!p.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
        if (!authed) return json(res, 401, { error: 'Χρειάζεται κωδικός σύνδεσης' });

        if (p === '/api/pin' && req.method === 'POST') {
            const { current, next } = await readBody(req);
            if (hashPin(String(current || '').trim()) !== ph) return json(res, 400, { error: 'Ο τωρινός κωδικός είναι λάθος' });
            if (!/^\d{4,8}$/.test(String(next || ''))) return json(res, 400, { error: 'Ο νέος κωδικός πρέπει να έχει 4 έως 8 ψηφία' });
            const nh = hashPin(next);
            await cmd('SET', K.pin, nh);
            pinCache = { hash: nh, t: Date.now() };
            return json(res, 200, { token: makeToken(nh), persistent: storeKind === 'redis' });
        }

        if (p === '/api/state' && req.method === 'GET') {
            const [state, seen, , poll] = await pipeline([['GET', K.state], ['GET', K.seen], ['SET', K.web, '1', 'EX', 45], ['GET', K.poll]]);
            return json(res, 200, {
                tvConnected: !!seen && Date.now() - Number(seen) < TV_ONLINE_MS,
                state: state ? JSON.parse(state) : null,
                poll: poll ? JSON.parse(poll) : { items: [] },
                ai: !!env('GEMINI_API_KEY'),
                store: storeKind
            });
        }
        if (p === '/api/command' && req.method === 'POST') return json(res, 200, await sendToTv(await readBody(req)));

        if (p === '/api/st/status' && req.method === 'GET') return json(res, 200, await ST.status());
        if (p === '/api/st/command' && req.method === 'POST') {
            const b = await readBody(req);
            const run = {
                power: () => ST.power(b.value === true || b.value === 'on'),
                volume: () => ST.volume(b.value, b.level),
                media: () => ST.media(b.value),
                key: () => ST.sendKeys(Array.isArray(b.value) ? b.value : [b.value]),
                app: () => ST.launchApp(b.value)
            }[b.type];
            if (!run) return json(res, 400, { ok: false, info: 'άγνωστη εντολή' });
            return json(res, 200, await stSafe(run));
        }
        if (p === '/api/st/oauth/start' && req.method === 'POST') {
            try { return json(res, 200, { url: await ST.oauthStartUrl(stRedirectUri(req)) }); }
            catch (e) { return json(res, 400, { error: e.message }); }
        }
        if (p === '/api/ai/chat' && req.method === 'POST') {
            const b = await readBody(req);
            return json(res, 200, await aiChat(Array.isArray(b.messages) ? b.messages : []));
        }
        if (p === '/api/ai/series' && req.method === 'POST') return json(res, 200, await aiSeries(await readBody(req)));

        if (p === '/api/poll' && req.method === 'GET') return json(res, 200, { poll: await getPoll() });
        if (p === '/api/poll/add' && req.method === 'POST') {
            const b = await readBody(req);
            return json(res, 200, { poll: await pollAdd(b.title, b.platform, b.voter) });
        }
        if (p === '/api/poll/vote' && req.method === 'POST') {
            const b = await readBody(req);
            const poll = await getPoll();
            voteIn(poll, b.id, b.voter);
            return json(res, 200, { poll: await savePoll(poll) });
        }
        if (p === '/api/poll/remove' && req.method === 'POST') {
            const b = await readBody(req);
            const poll = await getPoll();
            poll.items = poll.items.filter(i => i.id !== b.id);
            return json(res, 200, { poll: await savePoll(poll) });
        }
        if (p === '/api/poll/reset' && req.method === 'POST') return json(res, 200, { poll: await savePoll({ items: [], created: Date.now() }) });
        if (p === '/api/poll/show' && req.method === 'POST') return json(res, 200, await sendToTv({ action: 'showPoll', poll: await getPoll() }));

        return json(res, 404, { error: 'Not found' });
    } catch (e) {
        console.error('API error', p, e);
        return json(res, 500, { error: e.message || 'Σφάλμα' });
    }
}
