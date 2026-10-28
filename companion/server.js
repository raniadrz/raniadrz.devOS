// Τοπικός server (χωρίς Vercel): σερβίρει το build του React και το ίδιο API με το Vercel.
// Τα δεδομένα μένουν στη μνήμη (ή σε Redis αν οριστούν KV_REST_API_URL/TOKEN στο .env).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, '.env'));
const { handle } = await import('./lib/core.js');
const { storeKind } = await import('./lib/store.js');

const PORT = Number(process.env.PORT || 4545);
const DIST = path.join(__dirname, 'dist');
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json'
};

function loadEnv(file) {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

function serveStatic(pathname, res) {
    if (!fs.existsSync(DIST)) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Η web εφαρμογή δεν έχει γίνει build. Τρέξε: npm start');
    }
    const safe = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = path.join(DIST, safe);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) return handle(req, res);
    return serveStatic(pathname, res);
}).listen(PORT, '0.0.0.0', () => {
    const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log('\n  raniadrz.dev OS · Companion (τοπικά)\n');
    console.log(`  Web:   http://localhost:${PORT}`);
    for (const ip of ips) console.log(`  Web:   http://${ip}:${PORT}`);
    console.log(`  Για την TV (Ρυθμίσεις → Companion): http://${ips[0] || 'IP'}:${PORT}`);
    console.log(`  Αποθήκη: ${storeKind === 'redis' ? 'Redis' : 'μνήμη (χάνεται στο κλείσιμο)'}`);
    console.log(`  AI: ${process.env.GEMINI_API_KEY ? 'Gemini ενεργό' : 'ανενεργό'}\n`);
});
