import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Στο `npm run dev` τα /api πάνε στον server.js (θύρα 4545)
export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
        proxy: {
            '/api': 'http://localhost:4545'
        }
    }
});
