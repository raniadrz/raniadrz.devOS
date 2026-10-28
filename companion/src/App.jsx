import { useCallback, useEffect, useRef, useState } from 'react';

const THEMES = [
    { id: 'neon-dark', name: 'Pink Neon Dark', sw: ['#12051c', '#ff2d95'] },
    { id: 'neon-light', name: 'Pink Neon Light', sw: ['#ffd6ec', '#ff1493'] },
    { id: 'soft-light', name: 'Pink Soft Light', sw: ['#fff5f9', '#f2a7c3'] },
    { id: 'rose-gold', name: 'Rose Gold', sw: ['#241216', '#e8b89a'] }
];

const SCENES = [
    { id: 'movie', name: 'Βραδινή ταινία', icon: '🎬', desc: 'Σκούρο θέμα · χωρίς εφέ · Netflix' },
    { id: 'kids', name: 'Παιδιά', icon: '🧸', desc: 'Προφίλ «Παιδιά» · Disney+' },
    { id: 'music', name: 'Μουσική', icon: '🎧', desc: 'Φωτεινό θέμα · Spotify' },
    { id: 'relax', name: 'Χαλάρωση', icon: '🌙', desc: 'Rose Gold · αρχική' }
];

const SETTINGS = [
    { key: 'effects', label: 'Εφέ & animations', hint: 'Κλείσ’ τα αν η TV «κολλάει»' },
    { key: 'seconds', label: 'Δευτερόλεπτα στο ρολόι', hint: 'Εμφάνιση :SS δίπλα στην ώρα' },
    { key: 'aiGreeting', label: 'AI briefing αρχικής', hint: 'Καιρός, πού έμεινες, νέα επεισόδια (Gemini)' }
];

const PLATFORMS = ['Netflix', 'Prime Video', 'Disney+', 'Apple TV', 'YouTube', 'Plex'];
const SLEEP = [0, 15, 30, 60, 90, 120];

const QUICK_AI = [
    'Τρέξε τη σκηνή «Βραδινή ταινία»',
    'Άνοιξε το Netflix και χαμήλωσε την ένταση',
    'Είμαι στη σεζόν 2 επεισόδιο 5 του Dark',
    'Πρότεινέ μου μια σειρά σαν τα αγαπημένα μου',
    'Βάλε χρονοδιακόπτη ύπνου 30 λεπτά',
    'Δείξε μου το trailer του Severance στην TV',
    'Βάλε Rose Gold και γράψε «Καληνύχτα!» στην TV'
];

const TABS = [
    { id: 'home', label: 'Τηλεχειριστήριο', icon: '◎' },
    { id: 'ai', label: 'AURA AI', icon: '✦' },
    { id: 'series', label: 'Σειρές', icon: '▤' },
    { id: 'poll', label: 'Απόψε', icon: '★' },
    { id: 'settings', label: 'Ρυθμίσεις', icon: '⚙' }
];

/* ---------------- Auth + API ---------------- */
const TOKEN_KEY = 'companion.token';
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

let onUnauthorized = () => {};

async function api(url, body) {
    const r = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) { onUnauthorized(); throw new Error(data.error || 'Χρειάζεται κωδικός'); }
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
}

/* ---------------- Ζωντανή κατάσταση (polling κάθε 2″ · Vercel δεν κρατά WebSockets) ---------------- */
function useLive(authed) {
    const [snap, setSnap] = useState({ tvConnected: false, state: null, ai: false, store: '' });
    const [poll, setPoll] = useState({ items: [] });
    const [online, setOnline] = useState(false);

    useEffect(() => {
        if (!authed) return undefined;
        let alive = true;
        let timer;
        const tick = async () => {
            if (!alive) return;
            if (document.hidden) { timer = setTimeout(tick, 4000); return; }
            try {
                const r = await api('/api/state');
                setSnap({ tvConnected: r.tvConnected, state: r.state, ai: r.ai, store: r.store });
                if (r.poll) setPoll(r.poll);
                setOnline(true);
            } catch {
                setOnline(false);
            }
            if (alive) timer = setTimeout(tick, 2000);
        };
        tick();
        const wake = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
        document.addEventListener('visibilitychange', wake);
        return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); };
    }, [authed]);

    return { ...snap, online, poll, setPoll };
}

/* ---------------- SmartThings κατάσταση ---------------- */
function useSmartThings(authed) {
    const [st, setSt] = useState({ configured: false, loaded: false });
    const reload = useCallback(async () => {
        try { setSt({ ...(await api('/api/st/status')), loaded: true }); } catch { /* ignore */ }
    }, []);
    useEffect(() => {
        if (!authed) return undefined;
        reload();
        const t = setInterval(reload, 30000);
        return () => clearInterval(t);
    }, [authed, reload]);
    return [st, reload];
}

/* ---------------- App ---------------- */
export default function App() {
    const [authed, setAuthed] = useState(null);
    const logout = useCallback(() => { setToken(''); setAuthed(false); }, []);
    onUnauthorized = logout;

    useEffect(() => {
        if (!getToken()) { setAuthed(false); return; }
        api('/api/auth').then(r => setAuthed(!!r.ok)).catch(() => setAuthed(false));
    }, []);

    const tv = useLive(authed);
    const [st, reloadSt] = useSmartThings(authed);
    const [tab, setTab] = useState(() => { try { return localStorage.getItem('companion.tab') || 'home'; } catch { return 'home'; } });
    const [toast, setToast] = useState(null);
    const theme = tv.state?.theme || 'neon-dark';

    useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
    useEffect(() => { try { localStorage.setItem('companion.tab', tab); } catch { /* ignore */ } }, [tab]);

    const notify = useCallback((text, ok = true) => setToast({ text, ok, id: Date.now() }), []);
    useEffect(() => {
        if (!toast) return undefined;
        const t = setTimeout(() => setToast(null), 2600);
        return () => clearTimeout(t);
    }, [toast]);

    const send = useCallback(async (body, okText) => {
        try {
            const r = await api('/api/command', body);
            if (r.ok) { if (okText) notify(okText); } else notify(r.info || 'Η εντολή απέτυχε', false);
            return r;
        } catch (e) {
            notify(e.message, false);
            return { ok: false };
        }
    }, [notify]);

    const stCmd = useCallback(async (type, value, okText) => {
        try {
            const r = await api('/api/st/command', { type, value });
            if (r.ok) { if (okText) notify(okText); } else notify(r.info || 'Η εντολή απέτυχε', false);
            setTimeout(reloadSt, 1500);
            return r;
        } catch (e) {
            notify(e.message, false);
            return { ok: false };
        }
    }, [notify, reloadSt]);

    // Επιστροφή από τη σύνδεση Samsung (OAuth)
    useEffect(() => {
        const q = new URLSearchParams(location.search);
        if (!q.get('st')) return;
        if (q.get('st') === 'ok') { notify('SmartThings: μόνιμη σύνδεση ✓'); reloadSt(); }
        else notify('SmartThings: ' + (q.get('msg') || 'η σύνδεση απέτυχε'), false);
        history.replaceState(null, '', location.pathname);
    }, [notify, reloadSt]);

    if (authed === null) return <div className="shell"><p className="muted center-text">Φόρτωση…</p></div>;
    if (!authed) return <Login onDone={() => setAuthed(true)} />;

    const ctx = { tv, send, notify, logout, st, stCmd, reloadSt };

    return (
        <div className="shell">
            <div className="bg-grid" aria-hidden="true" />
            <header className="topbar glass">
                <div className="brand">
                    <span className="brand-mark">▶</span>
                    <span className="brand-text">raniadrz<b>.dev</b></span>
                    <span className="brand-tag">OS · COMPANION</span>
                </div>
                <Status tv={tv} st={st} />
            </header>

            <nav className="tabs">
                {TABS.map(t => (
                    <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                        <span className="tab-icon">{t.icon}</span>
                        <span>{t.label}</span>
                    </button>
                ))}
            </nav>

            <main className="content">
                {tv.store === 'memory' && location.hostname.endsWith('vercel.app') && (
                    <section className="card glass warn">
                        <h3>Λείπει η βάση δεδομένων</h3>
                        <p>Στο Vercel: <b>Storage → Create → Upstash Redis</b> και σύνδεσέ τη με αυτό το project. Χωρίς αυτήν η TV και το web δεν «βλέπονται» σταθερά.</p>
                    </section>
                )}
                {!tv.tvConnected && !(st.configured && !st.error) && <ConnectHelp online={tv.online} />}
                {tab === 'home' && <HomeTab {...ctx} />}
                {tab === 'ai' && <AiTab {...ctx} />}
                {tab === 'series' && <SeriesTab {...ctx} />}
                {tab === 'poll' && <PollTab {...ctx} />}
                {tab === 'settings' && <SettingsTab {...ctx} />}
            </main>

            {toast && <div key={toast.id} className={`toast glass ${toast.ok ? '' : 'bad'}`}>{toast.text}</div>}
        </div>
    );
}

/* ---------------- Είσοδος με κωδικό ---------------- */
function Login({ onDone }) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || 'Λάθος κωδικός');
            setToken(data.token);
            onDone();
        } catch (err) {
            setError(err.message);
            setPin('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="shell login-shell">
            <div className="bg-grid" aria-hidden="true" />
            <form className="card glass login" onSubmit={submit}>
                <span className="brand-mark big">▶</span>
                <h1>raniadrz<b>.dev</b> OS</h1>
                <p className="muted">Γράψε τον κωδικό σύνδεσης για να ελέγξεις την τηλεόραση.</p>
                <input className="pin-input" type="password" inputMode="numeric" autoComplete="current-password" maxLength={8} value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" autoFocus />
                {error && <p className="bad-text">{error}</p>}
                <button className="btn primary wide" disabled={busy || pin.length < 4}>{busy ? 'Σύνδεση…' : 'Σύνδεση'}</button>
            </form>
        </div>
    );
}

function Status({ tv, st }) {
    const p = tv.state?.profile;
    return (
        <div className="status">
            {tv.state?.weather && <span className="pill on weather">{tv.state.weather}</span>}
            <span className={`pill ${tv.online ? 'on' : ''}`}><i /> SERVER</span>
            <span className={`pill ${tv.tvConnected ? 'on' : ''}`} title="Εφαρμογή raniadrz.dev OS"><i /> TV</span>
            <span className={`pill ${st?.configured && !st?.error ? 'on' : ''}`} title="SmartThings"><i /> ST</span>
            <span className={`pill ${tv.ai ? 'on' : ''}`}><i /> AI</span>
            {p && <span className={`avatar av-${p.color}`} title={p.name}>{p.name.charAt(0).toUpperCase()}</span>}
        </div>
    );
}

function ConnectHelp({ online }) {
    return (
        <section className="card glass warn">
            <h3>{online ? 'Η TV δεν είναι συνδεδεμένη' : 'Χάθηκε η σύνδεση με τον server'}</h3>
            {online ? (
                <ol>
                    <li>Άνοιξε το <b>raniadrz.dev OS</b> στην τηλεόραση: συνδέεται μόνο του στο <code>{location.origin}</code>.</li>
                    <li>Αν όχι: στην TV <b>⚙ Ρυθμίσεις → Web Companion</b>, έλεγξε τη διεύθυνση και πάτα «Σύνδεση».</li>
                    <li>Η ένδειξη <b>TV</b> πάνω δεξιά θα γίνει πράσινη σε λίγα δευτερόλεπτα.</li>
                </ol>
            ) : <p>Έλεγξε τη σύνδεσή σου στο Internet.</p>}
        </section>
    );
}

/* ---------------- Τηλεχειριστήριο ---------------- */
function HomeTab({ tv, send, st, stCmd }) {
    const [msg, setMsg] = useState('');
    const [query, setQuery] = useState('');
    const [platform, setPlatform] = useState('YouTube');
    const s = tv.state;
    const key = (k) => send({ action: 'key', key: k });

    useEffect(() => {
        const onKey = (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'enter', Backspace: 'back', Escape: 'back' };
            if (map[e.key]) { e.preventDefault(); key(map[e.key]); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    return (
        <>
            <section className="card glass">
                <h2>Σκηνές</h2>
                <div className="scenes">
                    {SCENES.map(sc => (
                        <button key={sc.id} className="scene" onClick={() => send({ action: 'runScene', scene: sc.id }, `Σκηνή: ${sc.name}`)}>
                            <span className="scene-icon">{sc.icon}</span>
                            <b>{sc.name}</b>
                            <small className="muted">{sc.desc}</small>
                        </button>
                    ))}
                </div>
            </section>

            <div className="grid two">
                <section className="card glass">
                    <h2>Τηλεχειριστήριο</h2>
                    <p className="muted small">Πάτα τα κουμπιά ή χρησιμοποίησε τα βελάκια / Enter / Backspace του πληκτρολογίου.</p>
                    <div className="dpad">
                        <button className="dp up" onClick={() => key('up')} aria-label="Πάνω">▲</button>
                        <button className="dp left" onClick={() => key('left')} aria-label="Αριστερά">◀</button>
                        <button className="dp ok" onClick={() => key('enter')}>OK</button>
                        <button className="dp right" onClick={() => key('right')} aria-label="Δεξιά">▶</button>
                        <button className="dp down" onClick={() => key('down')} aria-label="Κάτω">▼</button>
                    </div>
                    <div className="row center">
                        <button className="btn" onClick={() => key('back')}>↩ Back</button>
                        <button className="btn" onClick={() => send({ action: 'home' }, 'Αρχική raniadrz.dev OS')}>⌂ Αρχική</button>
                        {st.configured && <button className="btn" onClick={() => stCmd('key', 'home')}>Samsung Home</button>}
                    </div>

                    {st.configured ? (
                        <>
                            <div className="row center">
                                <button className="btn" onClick={() => stCmd('power', st.power === 'on' ? 'off' : 'on', st.power === 'on' ? 'Σβήσιμο TV' : 'Άναμμα TV')}>
                                    ⏻ {st.power === 'on' ? 'Σβήσιμο' : 'Άναμμα'}
                                </button>
                                <button className="btn" onClick={() => stCmd('volume', 'down')} aria-label="Χαμήλωμα έντασης">🔉</button>
                                <span className="vol">{st.volume ?? '–'}</span>
                                <button className="btn" onClick={() => stCmd('volume', 'up')} aria-label="Δυνάμωμα έντασης">🔊</button>
                                <button className="btn" onClick={() => stCmd('volume', st.mute === 'muted' ? 'unmute' : 'mute')} aria-label="Σίγαση">{st.mute === 'muted' ? '🔈' : '🔇'}</button>
                            </div>
                            <div className="row center">
                                <button className="btn" onClick={() => stCmd('media', 'rewind')} aria-label="Πίσω">⏪</button>
                                <button className="btn" onClick={() => stCmd('media', 'play')} aria-label="Αναπαραγωγή">▶</button>
                                <button className="btn" onClick={() => stCmd('media', 'pause')} aria-label="Παύση">⏸</button>
                                <button className="btn" onClick={() => stCmd('media', 'forward')} aria-label="Μπροστά">⏩</button>
                            </div>
                            <button className="btn primary wide" onClick={() => send({ action: 'openLauncher' }, 'Άνοιγμα raniadrz.dev OS')}>▶ Άνοιγμα raniadrz.dev OS</button>
                            <p className="muted small">SmartThings {st.error ? `⚠ ${st.error}` : `✓ ${st.name || 'TV'}`} · το τηλεχειριστήριο δουλεύει και μέσα σε Netflix, YouTube κ.λπ.</p>
                        </>
                    ) : (
                        <p className="muted small">💡 Σύνδεσε το <b>SmartThings</b> για να δουλεύει το τηλεχειριστήριο και μέσα σε Netflix/YouTube, να ανοίγεις το raniadrz.dev OS, ένταση και άναμμα/σβήσιμο.</p>
                    )}

                    <h3>Χρονοδιακόπτης ύπνου {s?.sleepMinutes ? <span className="tag">σε {s.sleepMinutes}′</span> : null}</h3>
                    <div className="row">
                        {SLEEP.map(m => (
                            <button key={m} className={`btn small ${m && s?.sleepMinutes && Math.abs(s.sleepMinutes - m) < 1 ? 'primary' : ''}`}
                                onClick={() => send({ action: 'sleep', minutes: m }, m ? `Ύπνος σε ${m} λεπτά` : 'Ακυρώθηκε')}>
                                {m ? `${m}′` : 'Όχι'}
                            </button>
                        ))}
                    </div>
                </section>

                <section className="card glass">
                    <h2>Τώρα στην TV</h2>
                    <dl className="facts">
                        <dt>Προφίλ</dt><dd>{s?.profile?.name || '—'}</dd>
                        <dt>Θέμα</dt><dd>{THEMES.find(t => t.id === s?.theme)?.name || '—'}</dd>
                        <dt>Οθόνη</dt><dd>{screenName(s?.screen)}</dd>
                        <dt>Καιρός</dt><dd>{s?.weather || '—'}</dd>
                    </dl>

                    <h3>Αναζήτηση στην TV</h3>
                    <form className="row" onSubmit={(e) => { e.preventDefault(); if (query.trim()) send({ action: 'search', query: query.trim(), platform }, `Αναζήτηση: ${query.trim()}`); }}>
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="π.χ. Dune trailer" maxLength={120} />
                        <select value={platform} onChange={e => setPlatform(e.target.value)}>
                            {['YouTube', 'Internet', ...PLATFORMS.filter(p => p !== 'YouTube')].map(p => <option key={p}>{p}</option>)}
                        </select>
                        <button className="btn primary" type="submit">Ψάξε</button>
                    </form>
                    <p className="muted small">Το YouTube και το Internet ανοίγουν κατευθείαν στα αποτελέσματα. Netflix, Prime κ.λπ. δεν δέχονται αναζήτηση απ’ έξω, οπότε ανοίγουν και σου θυμίζουν τι να ψάξεις.</p>

                    <h3>Άνοιγμα εφαρμογής</h3>
                    <div className="apps">
                        {(s?.apps || []).map(a => (
                            <button key={a} className="app" onClick={() => send({ action: 'openApp', app: a }, `Άνοιγμα ${a}`)}>{a}</button>
                        ))}
                    </div>

                    <h3>Μήνυμα στην TV</h3>
                    <form className="row" onSubmit={(e) => { e.preventDefault(); if (msg.trim()) { send({ action: 'say', text: msg.trim() }, 'Στάλθηκε'); setMsg(''); } }}>
                        <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="π.χ. Το φαγητό είναι έτοιμο!" maxLength={160} />
                        <button className="btn primary" type="submit">Αποστολή</button>
                    </form>
                </section>
            </div>
        </>
    );
}

function screenName(id) {
    return {
        dashboard: 'Αρχική', 'profile-modal': 'Επιλογή προφίλ', 'pin-modal': 'PIN', 'chat-modal': 'AURA chat', 'series-modal': 'Σειρές AI',
        'settings-modal': 'Ρυθμίσεις', 'player-modal': 'Media Player', 'new-profile-modal': 'Νέο προφίλ', 'poll-modal': 'Ψηφοφορία',
        'fav-actions-modal': 'Πρόοδος σειράς', 'pin-actions-modal': 'Διαχείριση προφίλ'
    }[id] || (id ? id : '—');
}

/* ---------------- AURA AI (+ φωνή) ---------------- */
const TOOL_LABEL = {
    set_theme: 'Θέμα', open_app: 'Άνοιγμα', press_keys: 'Πλήκτρα', show_message: 'Μήνυμα', add_favorite_series: '+ Αγαπημένα',
    remove_favorite_series: '− Αγαπημένα', open_series_recommendations: 'Σειρές AI', switch_profile: 'Προφίλ', set_setting: 'Ρύθμιση',
    go_home: 'Αρχική', run_scene: 'Σκηνή', tv_power: 'Ρεύμα', tv_volume: 'Ένταση', tv_media: 'Αναπαραγωγή', open_raniadrz_os: 'raniadrz.dev OS', set_progress: 'Πρόοδος', search_on_tv: 'Αναζήτηση', set_sleep_timer: 'Ύπνος',
    add_poll_option: '+ Ψηφοφορία', show_poll: 'Ψηφοφορία'
};

function useSpeech(onFinal) {
    const [listening, setListening] = useState(false);
    const [interim, setInterim] = useState('');
    const recRef = useRef(null);
    const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    const supported = !!SR && window.isSecureContext;

    const start = () => {
        if (!supported || listening) return;
        const rec = new SR();
        rec.lang = 'el-GR';
        rec.interimResults = true;
        rec.continuous = false;
        rec.onresult = (e) => {
            let text = '';
            let final = false;
            for (let i = e.resultIndex; i < e.results.length; i++) {
                text += e.results[i][0].transcript;
                if (e.results[i].isFinal) final = true;
            }
            setInterim(text);
            if (final) { setInterim(''); onFinal(text.trim()); }
        };
        rec.onerror = () => { setListening(false); setInterim(''); };
        rec.onend = () => { setListening(false); };
        recRef.current = rec;
        setListening(true);
        rec.start();
    };
    const stop = () => { recRef.current && recRef.current.stop(); };

    return { supported, hasApi: !!SR, listening, interim, start, stop };
}

function AiTab({ tv }) {
    const [messages, setMessages] = useState(() => [{
        role: 'model',
        text: 'Γεια! Είμαι η AURA. Πες μου ή γράψε μου τι θέλεις να κάνω στην τηλεόραση: σκηνές, εφαρμογές, σειρές, πού έμεινες, ύπνο, μηνύματα…'
    }]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const logRef = useRef(null);
    const busyRef = useRef(false);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

    const ask = async (text) => {
        text = (text || '').trim();
        if (!text || busyRef.current) return;
        const next = [...messagesRef.current, { role: 'user', text }];
        setMessages(next);
        setInput('');
        setBusy(true);
        busyRef.current = true;
        try {
            const r = await api('/api/ai/chat', { messages: next.filter(m => !m.error) });
            setMessages(m => [...m, { role: 'model', text: r.reply, actions: r.actions }]);
        } catch (e) {
            setMessages(m => [...m, { role: 'model', text: 'Κάτι πήγε στραβά: ' + e.message, error: true }]);
        } finally {
            setBusy(false);
            busyRef.current = false;
        }
    };

    const speech = useSpeech(ask);

    return (
        <section className="card glass chat">
            <div className="chat-head">
                <span className={`orb ${speech.listening ? 'listening' : ''}`} />
                <div>
                    <h2>AURA</h2>
                    <p className="muted small">AI βοηθός με πρόσβαση στην TV · Gemini {tv.ai ? '' : '(ανενεργό)'}</p>
                </div>
            </div>
            <div className="chat-log" ref={logRef}>
                {messages.map((m, i) => (
                    <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'} ${m.error ? 'error' : ''}`}>
                        <div className="bubble">{m.text}</div>
                        {m.actions?.length > 0 && (
                            <div className="actions">
                                {m.actions.map((a, k) => (
                                    <span key={k} className={`chip ${a.ok ? 'ok' : 'bad'}`} title={a.info}>
                                        {a.ok ? '✓' : '✕'} {TOOL_LABEL[a.name] || a.name}{actionDetail(a)}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {speech.interim && <div className="msg user"><div className="bubble interim">{speech.interim}…</div></div>}
                {busy && <div className="msg ai"><div className="bubble typing"><i /><i /><i /></div></div>}
            </div>
            <div className="quick">
                {QUICK_AI.map(q => <button key={q} className="chip-btn" disabled={busy} onClick={() => ask(q)}>{q}</button>)}
            </div>
            <form className="row" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
                <button type="button" className={`btn mic ${speech.listening ? 'on' : ''}`} disabled={!speech.supported || busy}
                    onClick={() => (speech.listening ? speech.stop() : speech.start())}
                    title={speech.supported ? 'Μίλα στην AURA' : 'Η φωνή χρειάζεται HTTPS'}>
                    {speech.listening ? '■' : '🎤'}
                </button>
                <input value={input} onChange={e => setInput(e.target.value)} placeholder={speech.listening ? 'Σε ακούω…' : 'Γράψε ή μίλα στην AURA…'} disabled={busy} />
                <button className="btn primary" type="submit" disabled={busy || !input.trim()}>Αποστολή</button>
            </form>
            {!speech.supported && (
                <p className="muted small">
                    🎤 Για φωνητικές εντολές {speech.hasApi ? <>άνοιξε τη σελίδα από <b>https://</b> (π.χ. τη διεύθυνση του Vercel).</> : <>χρησιμοποίησε Chrome ή Safari, ή πάτα το 🎤 του πληκτρολογίου του κινητού.</>}
                </p>
            )}
        </section>
    );
}

function actionDetail(a) {
    const g = a.args || {};
    const v = g.scene || g.theme || g.app || g.query || g.title || g.name || g.key ||
        (g.minutes !== undefined ? `${g.minutes}′` : '') || (g.keys ? g.keys.join(' ') : '');
    const extra = g.season ? ` S${g.season}·E${g.episode}` : '';
    return v ? `: ${v}${extra}` : '';
}

/* ---------------- Σειρές + πρόοδος ---------------- */
function SeriesTab({ tv, send, notify }) {
    const favs = tv.state?.favorites || [];
    const progress = tv.state?.progress || {};
    const [title, setTitle] = useState('');
    const [recs, setRecs] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = async (fresh) => {
        setBusy(true);
        setError('');
        try {
            const r = await api('/api/ai/series', { favorites: favs, exclude: fresh ? recs.map(x => x.title) : [] });
            setRecs(r.recs || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const add = async (t) => {
        const r = await send({ action: 'addFavorite', title: t });
        if (r.ok) notify(`«${t}» στα αγαπημένα`);
    };
    const setProg = (t, s, e) => send({ action: 'setProgress', title: t, season: Math.max(1, s), episode: Math.max(1, e) });

    return (
        <div className="grid two">
            <section className="card glass">
                <h2>Τα αγαπημένα μου</h2>
                <p className="muted small">Προφίλ <b>{tv.state?.profile?.name || '—'}</b>. Βάλε πού έμεινες και η AURA θα σου το θυμίζει στην αρχική της TV.</p>
                <form className="row" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { add(title.trim()); setTitle(''); } }}>
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="π.χ. Stranger Things" maxLength={40} />
                    <button className="btn primary" type="submit">Προσθήκη</button>
                </form>
                <ul className="favs">
                    {favs.map(f => {
                        const p = progress[f];
                        const s = p?.season || 1;
                        const e = p?.episode || 0;
                        return (
                            <li key={f} className="fav">
                                <div className="fav-main">
                                    <b>{f}</b>
                                    <span className="muted small">{p ? `Έμεινες στο S${s} · E${e}` : 'Δεν έχεις ξεκινήσει'}</span>
                                </div>
                                <div className="stepper" aria-label="Σεζόν">
                                    <button onClick={() => setProg(f, s - 1, 1)} disabled={s <= 1}>−</button>
                                    <span>S{s}</span>
                                    <button onClick={() => setProg(f, s + 1, 1)}>+</button>
                                </div>
                                <div className="stepper" aria-label="Επεισόδιο">
                                    <button onClick={() => setProg(f, s, e - 1)} disabled={e <= 1}>−</button>
                                    <span>E{e || '–'}</span>
                                    <button onClick={() => setProg(f, s, e + 1)}>+</button>
                                </div>
                                <button className="icon" title="Trailer στην TV" onClick={() => send({ action: 'search', query: `${f} trailer`, platform: 'YouTube' }, 'Trailer στην TV')}>🎬</button>
                                <button className="icon" onClick={() => send({ action: 'removeFavorite', title: f }, `Αφαιρέθηκε: ${f}`)} aria-label={`Αφαίρεση ${f}`}>✕</button>
                            </li>
                        );
                    })}
                    {!favs.length && <li className="muted empty">Δεν υπάρχουν ακόμα αγαπημένες σειρές.</li>}
                </ul>
                <button className="btn wide" onClick={() => send({ action: 'openSeries' }, 'Άνοιξαν οι Σειρές AI στην TV')}>📺 Δείξε τις προτάσεις στην TV</button>
            </section>

            <section className="card glass">
                <div className="row between">
                    <h2>Προτάσεις AI</h2>
                    <button className="btn primary" disabled={busy} onClick={() => load(recs.length > 0)}>
                        {busy ? 'Σκέφτεται…' : recs.length ? '↻ Νέες προτάσεις' : '✦ Πρότεινέ μου'}
                    </button>
                </div>
                {error && <p className="bad-text">{error}</p>}
                {!recs.length && !busy && !error && <p className="muted">Πάτα «Πρότεινέ μου»: η AURA θα διαλέξει σειρές με βάση τα αγαπημένα σου.</p>}
                {busy && <div className="typing big"><i /><i /><i /></div>}
                <div className="recs">
                    {recs.map(r => (
                        <article key={r.title} className="rec">
                            <div className="rec-top">
                                <h4>{r.title} {r.year && <span className="muted">({r.year})</span>}</h4>
                                <span className="tag">{r.platform}</span>
                            </div>
                            {r.genre && <span className="genre">{r.genre}</span>}
                            <p>{r.reason}</p>
                            <div className="row">
                                <button className="btn small" onClick={() => add(r.title)}>+ Αγαπημένα</button>
                                <button className="btn small" onClick={() => send({ action: 'search', query: `${r.title} trailer`, platform: 'YouTube' }, 'Trailer στην TV')}>🎬 Trailer</button>
                                <button className="btn small" onClick={() => send({ action: 'search', query: r.title, platform: r.platform }, `${r.platform} στην TV`)}>▶ {r.platform}</button>
                                <button className="btn small" onClick={() => api('/api/poll/add', { title: r.title, platform: r.platform, voter: '' }).then(() => notify('Μπήκε στην ψηφοφορία «Απόψε»')).catch(e => notify(e.message, false))}>★ Στην ψηφοφορία</button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}

/* ---------------- Ψηφοφορία «Τι βλέπουμε απόψε;» ---------------- */
function PollTab({ tv, send, notify }) {
    const [voter, setVoter] = useState(() => { try { return localStorage.getItem('companion.voter') || ''; } catch { return ''; } });
    const [title, setTitle] = useState('');
    const [platform, setPlatform] = useState('Netflix');
    const items = [...(tv.poll?.items || [])].sort((a, b) => b.votes.length - a.votes.length);
    const max = Math.max(1, ...items.map(i => i.votes.length));

    useEffect(() => { try { localStorage.setItem('companion.voter', voter); } catch { /* ignore */ } }, [voter]);

    const call = (url, body, ok) => api(url, body).then((r) => { if (r?.poll && tv.setPoll) tv.setPoll(r.poll); if (ok) notify(ok); }).catch(e => notify(e.message, false));

    return (
        <div className="grid two">
            <section className="card glass">
                <h2>Τι βλέπουμε απόψε;</h2>
                <p className="muted small">Ο καθένας ανοίγει το companion στο κινητό του, γράφει το όνομά του και ψηφίζει. Μία ψήφος ανά άτομο.</p>
                <label className="field">
                    <span className="muted small">Το όνομά σου</span>
                    <input value={voter} onChange={e => setVoter(e.target.value.slice(0, 20))} placeholder="π.χ. Ράνια" />
                </label>
                <h3>Πρόσθεσε πρόταση</h3>
                <form className="row" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { call('/api/poll/add', { title, platform, voter }, 'Προστέθηκε'); setTitle(''); } }}>
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ταινία ή σειρά" maxLength={60} />
                    <select value={platform} onChange={e => setPlatform(e.target.value)}>
                        {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                    </select>
                    <button className="btn primary" type="submit">+</button>
                </form>
                <div className="row mt-s">
                    <button className="btn" onClick={() => send({ action: 'showPoll' }, 'Η ψηφοφορία εμφανίστηκε στην TV')}>📺 Δείξε στην TV</button>
                    <button className="btn" onClick={() => { if (confirm('Νέα ψηφοφορία; Οι τωρινές επιλογές θα σβηστούν.')) call('/api/poll/reset', {}, 'Νέα ψηφοφορία'); }}>↺ Νέα ψηφοφορία</button>
                </div>
            </section>

            <section className="card glass">
                <h2>Αποτελέσματα</h2>
                {!items.length && <p className="muted">Δεν υπάρχουν προτάσεις ακόμα. Πρόσθεσε μία ή στείλε από τις «Σειρές» με ★.</p>}
                <ul className="poll">
                    {items.map((i, idx) => {
                        const mine = voter && i.votes.includes(voter);
                        return (
                            <li key={i.id} className={mine ? 'mine' : ''}>
                                <span className="poll-bar" style={{ width: `${(i.votes.length / max) * 100}%` }} />
                                <div className="poll-main">
                                    <b>{idx === 0 && i.votes.length ? '★ ' : ''}{i.title}</b>
                                    <small className="muted">{i.platform}{i.votes.length ? ` · ${i.votes.join(', ')}` : ''}</small>
                                </div>
                                <span className="poll-count">{i.votes.length}</span>
                                <button className={`btn small ${mine ? 'primary' : ''}`} disabled={!voter.trim()}
                                    onClick={() => call('/api/poll/vote', { id: i.id, voter }, mine ? 'Η ψήφος αφαιρέθηκε' : 'Ψήφισες!')}>
                                    {mine ? '✓ Ψήφισα' : 'Ψήφος'}
                                </button>
                                <button className="icon" onClick={() => call('/api/poll/remove', { id: i.id })} aria-label="Αφαίρεση">✕</button>
                            </li>
                        );
                    })}
                </ul>
                {!voter.trim() && items.length > 0 && <p className="muted small">Γράψε το όνομά σου για να ψηφίσεις.</p>}
            </section>
        </div>
    );
}

/* ---------------- Ρυθμίσεις ---------------- */
function SettingsTab({ tv, send, logout, notify, st, reloadSt }) {
    const s = tv.state;
    const [city, setCity] = useState('');
    useEffect(() => { if (s?.city && !city) setCity(s.city); }, [s?.city]);   // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="grid two">
            <section className="card glass">
                <h2>Θέμα</h2>
                <p className="muted small">Αλλάζει ταυτόχρονα στην TV και σε αυτή τη σελίδα.</p>
                <div className="themes">
                    {THEMES.map(t => (
                        <button key={t.id} className={`theme ${s?.theme === t.id ? 'active' : ''}`} onClick={() => send({ action: 'setTheme', theme: t.id })}>
                            <span className="swatch" style={{ background: `linear-gradient(135deg, ${t.sw[0]} 45%, ${t.sw[1]})` }} />
                            <span>{t.name}</span>
                            {s?.theme === t.id && <span className="check">✓</span>}
                        </button>
                    ))}
                </div>

                <h2 className="mt">Εμφάνιση & AI</h2>
                {SETTINGS.map(o => {
                    const on = s?.settings?.[o.key] ?? true;
                    return (
                        <label key={o.key} className="toggle">
                            <span>
                                <b>{o.label}</b>
                                <small className="muted">{o.hint}</small>
                            </span>
                            <input type="checkbox" checked={on} disabled={!tv.tvConnected}
                                onChange={() => send({ action: 'setSetting', key: o.key, value: !on })} />
                            <span className="switch" />
                        </label>
                    );
                })}

                <h2 className="mt">Καιρός</h2>
                <form className="row" onSubmit={(e) => { e.preventDefault(); if (city.trim()) send({ action: 'setCity', city: city.trim() }, 'Ενημερώθηκε η πόλη'); }}>
                    <input value={city} onChange={e => setCity(e.target.value)} placeholder="Πόλη, π.χ. Θεσσαλονίκη" maxLength={40} />
                    <button className="btn primary" type="submit">Αποθήκευση</button>
                </form>
            </section>

            <section className="card glass">
                <h2>Προφίλ στην TV</h2>
                <div className="profiles">
                    {(s?.profiles || []).map(p => (
                        <button key={p.id} className={`profile ${s?.profile?.id === p.id ? 'active' : ''}`}
                            onClick={() => send({ action: 'switchProfile', name: p.name }, p.hasPin ? 'Η TV ζητάει PIN' : `Ενεργό: ${p.name}`)}>
                            <span className={`avatar av-${p.color}`}>{p.name.charAt(0).toUpperCase()}</span>
                            <span>{p.name}</span>
                            {p.hasPin && <small className="muted">🔒 PIN</small>}
                            {p.limit > 0 && <small className="muted">⏱ {Math.max(0, p.limit - p.used)}′ / {p.limit}′ σήμερα</small>}
                        </button>
                    ))}
                    {!s?.profiles?.length && <p className="muted">Δημιούργησε προφίλ από την TV.</p>}
                </div>
                <p className="muted small">Για ασφάλεια, προφίλ, PIN και ημερήσια όρια χρόνου ρυθμίζονται μόνο από την TV: ⚙ → Διαχείριση προφίλ.</p>

                <h2 className="mt">SmartThings</h2>
                <SmartThingsCard st={st} reloadSt={reloadSt} notify={notify} />

                <h2 className="mt">Κωδικός σύνδεσης</h2>
                <ChangePin notify={notify} />

                <h2 className="mt">Σύνδεση</h2>
                <dl className="facts">
                    <dt>Διεύθυνση</dt><dd><code>{location.origin}</code></dd>
                    <dt>Κατάσταση TV</dt><dd>{tv.tvConnected ? 'Συνδεδεμένη ✓' : 'Αποσυνδεδεμένη'}</dd>
                    <dt>AI</dt><dd>{tv.ai ? 'Gemini ενεργό' : 'Λείπει το GEMINI_API_KEY'}</dd>
                    <dt>Βάση</dt><dd>{tv.store === 'redis' ? 'Upstash Redis ✓' : 'Προσωρινή μνήμη'}</dd>
                </dl>
                <button className="btn wide" onClick={() => api('/api/logout', {}).catch(() => {}).finally(logout)}>Αποσύνδεση από αυτή τη συσκευή</button>
            </section>
        </div>
    );
}

function ChangePin({ notify }) {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [again, setAgain] = useState('');
    const [busy, setBusy] = useState(false);
    const digits = (v) => v.replace(/\D/g, '').slice(0, 8);

    const submit = async (e) => {
        e.preventDefault();
        if (next.length < 4) return notify('Ο νέος κωδικός θέλει 4 έως 8 ψηφία', false);
        if (next !== again) return notify('Οι νέοι κωδικοί δεν ταιριάζουν', false);
        setBusy(true);
        try {
            const r = await api('/api/pin', { current, next });
            setToken(r.token);
            setCurrent(''); setNext(''); setAgain('');
            notify(r.persistent ? 'Ο κωδικός άλλαξε · οι άλλες συσκευές θα τον ζητήσουν ξανά' : 'Ο κωδικός άλλαξε (προσωρινά, μέχρι να συνδεθεί βάση)');
        } catch (err) {
            notify(err.message, false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="pin-form" onSubmit={submit}>
            <p className="muted small">Όταν αλλάξεις τον κωδικό, όλες οι άλλες συσκευές αποσυνδέονται.</p>
            <input type="password" inputMode="numeric" autoComplete="current-password" placeholder="Τωρινός κωδικός"
                value={current} onChange={e => setCurrent(digits(e.target.value))} />
            <input type="password" inputMode="numeric" autoComplete="new-password" placeholder="Νέος κωδικός (4–8 ψηφία)"
                value={next} onChange={e => setNext(digits(e.target.value))} />
            <input type="password" inputMode="numeric" autoComplete="new-password" placeholder="Ξανά ο νέος κωδικός"
                value={again} onChange={e => setAgain(digits(e.target.value))} />
            <button className="btn primary" disabled={busy || current.length < 4 || next.length < 4}>{busy ? 'Αλλαγή…' : 'Αλλαγή κωδικού'}</button>
        </form>
    );
}

function SmartThingsCard({ st, reloadSt, notify }) {
    const [busy, setBusy] = useState(false);
    const connect = async () => {
        setBusy(true);
        try {
            const r = await api('/api/st/oauth/start', {});
            location.href = r.url;
        } catch (e) {
            notify(e.message, false);
            setBusy(false);
        }
    };
    return (
        <div className="st-card">
            <p className="muted small">Τηλεχειριστήριο παντού (και μέσα σε Netflix/YouTube), άνοιγμα εφαρμογών, ένταση, άναμμα και σβήσιμο, από οπουδήποτε.</p>
            <dl className="facts">
                <dt>Κατάσταση</dt>
                <dd>{!st.configured ? 'Δεν έχει συνδεθεί' : st.error ? `⚠ ${st.error}` : `✓ ${st.name || 'Samsung TV'}`}</dd>
                <dt>Σύνδεση</dt>
                <dd>{st.oauth ? 'Μόνιμη · ανανεώνεται μόνη της' : st.configured ? 'Προσωρινό κλειδί (λήγει σε 24 ώρες)' : '—'}</dd>
                {st.power && <><dt>TV</dt><dd>{st.power === 'on' ? 'Αναμμένη' : 'Σε αναμονή'}{st.volume != null ? ` · ένταση ${st.volume}` : ''}</dd></>}
            </dl>
            {st.configured && !st.oauth && (
                <button className="btn primary wide" disabled={busy} onClick={connect}>{busy ? 'Άνοιγμα Samsung…' : '🔗 Μόνιμη σύνδεση με λογαριασμό Samsung'}</button>
            )}
            {!st.configured && <p className="muted small">Χρειάζεται το κλειδί SmartThings στο Vercel (SMARTTHINGS_TOKEN).</p>}
            <button className="btn small mt-s" onClick={reloadSt}>↻ Ανανέωση</button>
        </div>
    );
}
