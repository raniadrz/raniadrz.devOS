// Vercel Function: όλα τα /api/* περνούν από εδώ (βλ. vercel.json)
import { handle } from '../lib/core.js';

export default function handler(req, res) {
    return handle(req, res);
}
