'use strict';

const ALLOWED_ORIGINS = (process.env.TELEGRAM_SEND_ORIGINS ||
    'http://localhost:8080,http://127.0.0.1:8080,http://localhost:8000,http://127.0.0.1:8000,https://gconfig.online,https://www.gconfig.online,https://gconfig-app.vercel.app,https://gconfig.vercel.app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const MAX_BYTES = Number(process.env.TELEGRAM_MAX_UPLOAD_BYTES || 4 * 1024 * 1024);

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

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, description: 'Telegram is not configured on the server' }));
        return;
    }

    try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw.toString('utf8') || '{}');
        const filename = String(payload.filename || '').trim();
        const mimeType = String(payload.mimeType || 'application/octet-stream');
        const caption = payload.caption != null ? String(payload.caption) : '';
        const parseMode = payload.parseMode != null ? String(payload.parseMode) : '';
        const dataBase64 = String(payload.dataBase64 || '');

        if (!filename || !dataBase64) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, description: 'filename and dataBase64 are required' }));
            return;
        }

        const buffer = Buffer.from(dataBase64, 'base64');
        if (!buffer.length) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, description: 'Empty file payload' }));
            return;
        }
        if (buffer.length > MAX_BYTES) {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, description: 'File too large for server upload' }));
            return;
        }

        const fd = new FormData();
        fd.append('chat_id', chatId);
        fd.append('document', new Blob([buffer], { type: mimeType }), filename);
        if (caption) fd.append('caption', caption);
        if (parseMode) fd.append('parse_mode', parseMode);

        const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
            method: 'POST',
            body: fd,
        });
        const data = await tgRes.json();
        res.statusCode = data.ok ? 200 : 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, description: err.message || 'Telegram proxy failed' }));
    }
};
