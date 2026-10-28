// Αποθήκη δεδομένων:
// - Στο Vercel: Upstash Redis (REST) μέσω των μεταβλητών που προσθέτει το Vercel Storage
// - Τοπικά (npm start): στη μνήμη, χωρίς ρύθμιση
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const storeKind = URL_ && TOKEN ? 'redis' : 'memory';

const mem = globalThis.__raniadrzMem || (globalThis.__raniadrzMem = { kv: new Map(), exp: new Map() });

function memGet(k) {
    const e = mem.exp.get(k);
    if (e && e < Date.now()) { mem.kv.delete(k); mem.exp.delete(k); return null; }
    return mem.kv.has(k) ? mem.kv.get(k) : null;
}

function memCmd([name, ...a]) {
    switch (String(name).toUpperCase()) {
        case 'GET': return memGet(a[0]);
        case 'SET': {
            mem.kv.set(a[0], String(a[1]));
            mem.exp.delete(a[0]);
            const i = a.findIndex((x, idx) => idx > 1 && String(x).toUpperCase() === 'EX');
            if (i > 1) mem.exp.set(a[0], Date.now() + Number(a[i + 1]) * 1000);
            return 'OK';
        }
        case 'DEL': {
            let n = 0;
            for (const k of a) { if (mem.kv.delete(k)) n++; mem.exp.delete(k); }
            return n;
        }
        case 'EXISTS': return memGet(a[0]) === null ? 0 : 1;
        case 'INCR': {
            const v = Number(memGet(a[0]) || 0) + 1;
            mem.kv.set(a[0], String(v));
            return v;
        }
        case 'EXPIRE': mem.exp.set(a[0], Date.now() + Number(a[1]) * 1000); return 1;
        case 'RPUSH': {
            const cur = memGet(a[0]);
            const list = cur ? JSON.parse(cur) : [];
            list.push(...a.slice(1).map(String));
            mem.kv.set(a[0], JSON.stringify(list));
            return list.length;
        }
        case 'LRANGE': {
            const cur = memGet(a[0]);
            return cur ? JSON.parse(cur) : [];
        }
        default: throw new Error('memory store: unsupported ' + name);
    }
}

async function rest(pathname, cmds) {
    const r = await fetch(URL_.replace(/\/$/, '') + pathname, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds.map(c => c.map(String)))
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(data)) throw new Error('Redis: ' + (data?.error || `HTTP ${r.status}`));
    return data.map(x => { if (x.error) throw new Error('Redis: ' + x.error); return x.result; });
}

/** Πολλές εντολές σε ένα αίτημα (όχι ατομικά) */
export async function pipeline(cmds) {
    if (storeKind === 'memory') return cmds.map(memCmd);
    return rest('/pipeline', cmds);
}

/** Πολλές εντολές ατομικά (MULTI/EXEC) */
export async function transaction(cmds) {
    if (storeKind === 'memory') return cmds.map(memCmd);
    return rest('/multi-exec', cmds);
}

export async function cmd(...c) {
    return (await pipeline([c]))[0];
}
