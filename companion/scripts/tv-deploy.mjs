// npm run tv  →  build + υπογραφή (Samsung certificate) + εγκατάσταση + εκκίνηση στην TV
// Μεταβλητές (προαιρετικά): TV_IP, TV_APP_ID, SDB, TIZEN_PROFILES, TIZEN_SIGNER
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = os.homedir();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');           // ο φάκελος της TV εφαρμογής
const COMPANION = path.resolve(__dirname, '..');
const WGT = path.join(ROOT, 'raniadrzOS.wgt');

const TV_IP = process.env.TV_IP || '192.168.1.192';
const TARGET = `${TV_IP}:26101`;
const APP_ID = process.env.TV_APP_ID || 'RaniaDrzOS.Launcher';
const SDB = process.env.SDB || path.join(HOME, '.sdburi/sdb');
const PROFILES = process.env.TIZEN_PROFILES || path.join(HOME, '.tizen-extension-platform/server/sdktools/sdk-data/profile/profiles.xml');
const SIGNER = process.env.TIZEN_SIGNER || path.join(HOME, '.vscode/extensions/tizentvweb.tizentvwasm-1.3.2/node_modules/@tizentv/webide-common-tizentv');

function step(title) { console.log(`\n▶ ${title}`); }
function sdb(args, quiet = false) {
    const r = spawnSync(SDB, args, { encoding: 'utf8' });
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
    if (!quiet && out) console.log(out.split('\n').slice(-4).join('\n'));
    return out;
}

for (const [label, p] of [['sdb', SDB], ['certificate profiles', PROFILES], ['Tizen signer', SIGNER]]) {
    if (!fs.existsSync(p)) { console.error(`✖ Δεν βρέθηκε ${label}: ${p}`); process.exit(1); }
}

// Ρύθμιση cloud για την TV (δεν μπαίνει στο git): διεύθυνση Vercel + κλειδί συσκευής
const envFile = path.join(COMPANION, '.env');
const envVars = {};
if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) envVars[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}
const cloudUrl = process.env.CLOUD_URL || envVars.CLOUD_URL || '';
const tvKey = process.env.TV_KEY || envVars.TV_KEY || '';
if (!cloudUrl || !tvKey) console.warn('⚠ Λείπει CLOUD_URL ή TV_KEY στο companion/.env · η TV δεν θα συνδεθεί στο cloud');
fs.writeFileSync(path.join(ROOT, 'tv-config.js'),
    '// Δημιουργείται από το npm run tv · μην το ανεβάζεις στο git\n' +
    `window.RANIADRZ_CONFIG = ${JSON.stringify({ cloudUrl, tvKey })};\n`);

step('Build & υπογραφή .wgt');
const require = createRequire(import.meta.url);
const { TVWebApp } = require(SIGNER);
if (fs.existsSync(WGT)) fs.unlinkSync(WGT);
const app = new TVWebApp('raniadrzOS', ROOT, APP_ID.split('.')[0]);
await app.buildWidget(PROFILES, COMPANION);
if (!fs.existsSync(WGT)) { console.error('✖ Το .wgt δεν δημιουργήθηκε'); process.exit(1); }
console.log(`✔ ${path.basename(WGT)} (${Math.round(fs.statSync(WGT).size / 1024)} KB)`);

step(`Σύνδεση με την TV (${TARGET})`);
if (!sdb(['devices'], true).includes(TARGET)) sdb(['connect', TV_IP]);
if (!sdb(['devices'], true).includes(TARGET)) { console.error('✖ Η TV δεν βρέθηκε. Είναι ανοιχτή με Developer Mode;'); process.exit(1); }

const tmp = '/home/owner/share/tmp/sdk_tools/tmp';
step('Εγκατάσταση');
sdb(['-s', TARGET, 'push', WGT, `${tmp}/raniadrzOS.wgt`]);
const inst = sdb(['-s', TARGET, 'shell', '0', 'vd_appinstall', APP_ID, `${tmp}/raniadrzOS.wgt`]);
if (!/install completed/.test(inst)) { console.error('✖ Η εγκατάσταση απέτυχε'); process.exit(1); }

step('Εκκίνηση');
sdb(['-s', TARGET, 'shell', '0', 'was_execute', APP_ID]);
console.log('\n✔ Έτοιμο: το raniadrz.dev OS τρέχει στην TV\n');
