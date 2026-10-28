# raniadrz.dev OS

Futuristic glassmorphism launcher για **Samsung Smart TV (Tizen 3.0+)** με AI βοηθό (AURA · Google Gemini), και **web companion σε React** που φιλοξενείται στο **Vercel**. Δεν χρειάζεται υπολογιστής ανοιχτός.

```
Samsung TV (raniadrz.dev OS) ──HTTPS──▶ Vercel (React + API) ◀── Browser / κινητό
                                           │
                                           ├─ Upstash Redis (κατάσταση, εντολές, ψηφοφορία)
                                           └─ Google Gemini (AI)
```

## Δομή

| Φάκελος / αρχείο | Τι είναι |
| --- | --- |
| `config.xml`, `index.html`, `style.css`, `app.js`, `icon.png` | Η εφαρμογή της TV (Tizen web app, ES5) |
| `companion/` | Το web companion: React (Vite) + API για Vercel |
| `companion/lib/core.js` | Το API: σύνδεση με κωδικό, εντολές προς TV, AI, ψηφοφορία |
| `companion/api/index.js` | Vercel Function που εξυπηρετεί όλα τα `/api/*` |
| `companion/server.js` | Τοπικός server για δοκιμές χωρίς Vercel |
| `companion/scripts/tv-deploy.mjs` | Build, υπογραφή, εγκατάσταση και εκκίνηση στην TV |

## Vercel

1. Project με **Root Directory = `companion`** (framework: Vite).
2. Environment Variables: `GEMINI_API_KEY`, `AUTH_SECRET`, `TV_KEY`, `COMPANION_PIN` (αρχικός κωδικός, π.χ. `1912`). Πρότυπο: `companion/.env.example`.
3. **Storage → Upstash Redis** συνδεδεμένο με το project (προσθέτει τα `KV_REST_API_URL` / `KV_REST_API_TOKEN`).

Ο κωδικός σύνδεσης αλλάζει από **Ρυθμίσεις → Κωδικός σύνδεσης** μέσα στη σελίδα. Με την αλλαγή αποσυνδέονται όλες οι άλλες συσκευές.

## TV

Χρειάζεται Samsung certificate (Tizen Extension → *Tizen: Create Certificate*) και την TV σε Developer Mode.

```bash
cd companion
npm install
npm run tv      # γράφει tv-config.js (CLOUD_URL + TV_KEY από το .env), υπογράφει και εγκαθιστά
```

## Τοπικά

```bash
cd companion
cp .env.example .env   # και συμπλήρωσε
npm start              # http://localhost:4545
```

> Τα `.env`, `tv-config.js` και `*.wgt` δεν ανεβαίνουν ποτέ στο git (μυστικά και κλειδιά).
