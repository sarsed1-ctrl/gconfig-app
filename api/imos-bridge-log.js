'use strict';

const ALLOWED_ORIGINS = (process.env.IMOS_BRIDGE_LOG_ORIGINS ||
    'http://localhost:8080,http://127.0.0.1:8080,http://localhost:3000,http://127.0.0.1:3000,https://gconfig.online,https://www.gconfig.online,https://gconfig-app.vercel.app,https://gconfig.vercel.app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function setCors(req, res) {
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', origin || ALLOWED_ORIGINS[0]);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
}

async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, description: 'Method not allowed' }));
        return;
    }

    try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw.toString('utf8') || '{}');
        const event = String(payload.event || 'imos_embed').slice(0, 64);
        const catalog = String(payload.catalog || 'kitchen').slice(0, 32);
        const detail = payload.detail != null ? String(payload.detail).slice(0, 500) : '';

        const entry = {
            ts: new Date().toISOString(),
            event,
            catalog,
            detail,
        };

        console.log('[imos-bridge-log]', JSON.stringify(entry));

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, logged: true }));
    } catch (err) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, description: err.message || 'Bad request' }));
    }
};
