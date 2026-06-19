'use strict';

/**
 * Optional server-side IMOS session proxy.
 * Requires imos vendor credentials — not enabled until env vars are set.
 *
 * Env:
 *   IMOS_SESSION_ENABLED=1
 *   IMOS_API_BASE=https://3034.netshop.imos3d.com
 *   IMOS_SERVICE_USERNAME=...
 *   IMOS_SERVICE_PASSWORD=...
 */

const ALLOWED_ORIGINS = (process.env.IMOS_SESSION_ORIGINS ||
    'http://localhost:8080,http://localhost:3000,https://gconfig.online,https://www.gconfig.online')
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

    if (process.env.IMOS_SESSION_ENABLED !== '1') {
        res.statusCode = 501;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            ok: false,
            description: 'IMOS session proxy is not enabled. Set IMOS_SESSION_ENABLED=1 and service credentials. Until then, users log in inside the iframe.',
        }));
        return;
    }

    const base = process.env.IMOS_API_BASE || 'https://3034.netshop.imos3d.com';
    const username = process.env.IMOS_SERVICE_USERNAME;
    const password = process.env.IMOS_SERVICE_PASSWORD;

    if (!username || !password) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, description: 'IMOS service credentials missing' }));
        return;
    }

    try {
        const body = new URLSearchParams({ username, password });
        const loginRes = await fetch(`${base}/index.php?imos_app_connect=login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        const text = await loginRes.text();
        let json;
        try {
            json = JSON.parse(text);
        } catch {
            json = { status: -1, raw: text.slice(0, 200) };
        }

        if (json.status !== 0 && json.status !== 1) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, description: 'IMOS login failed', imos: json }));
            return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            ok: true,
            description: 'Session established. Wire Set-Cookie forwarding when imos documents token API.',
            imos: { status: json.status },
        }));
    } catch (err) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, description: err.message || 'IMOS upstream error' }));
    }
};
