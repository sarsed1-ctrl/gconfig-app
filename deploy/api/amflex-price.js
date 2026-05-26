'use strict';

const { loadCatalog, importTellimusXlsx } = require('../lib/amflex/client');
const { computeQuote } = require('../lib/amflex/pricing');

const ALLOWED_ORIGINS = (process.env.AMFLEX_PRICE_ORIGINS ||
    'http://localhost:8000,http://127.0.0.1:8000,http://localhost:8765,http://127.0.0.1:8765,https://gconfig.online,https://www.gconfig.online,https://gconfig-app.vercel.app,https://gconfig.vercel.app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function setCors(req, res) {
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', origin || ALLOWED_ORIGINS[0]);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Country-Code');
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
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        const countryCode = String(req.headers['x-country-code'] || 'EE').toUpperCase();
        const body = await readBody(req);
        if (!body.length) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Empty request body' }));
            return;
        }

        const [catalog, imported] = await Promise.all([
            loadCatalog(countryCode),
            importTellimusXlsx(body),
        ]);

        const quote = computeQuote(imported.payload, catalog);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(quote));
    } catch (err) {
        const status = err.statusCode || 502;
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Amflex pricing failed' }));
    }
};
