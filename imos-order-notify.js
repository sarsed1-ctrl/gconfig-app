'use strict';

const ALLOWED_ORIGINS = (process.env.IMOS_ORDER_NOTIFY_ORIGINS ||
    'http://localhost:8080,http://127.0.0.1:8080,https://gconfig.online,https://www.gconfig.online,https://gconfig-app.vercel.app,https://gconfig.vercel.app')
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

function buildCaption(meta) {
    const lines = [
        '🍳 IMOS Kitchen order',
        meta.projectName ? `Project: ${meta.projectName}` : null,
        `Articles: ${meta.articleCount ?? 0}`,
    ].filter(Boolean);

    if (Array.isArray(meta.lines) && meta.lines.length) {
        const preview = meta.lines.slice(0, 8).map((l, i) => {
            const qty = l.qty != null ? ` ×${l.qty}` : '';
            return `${i + 1}. ${l.name}${qty}`;
        });
        lines.push('', ...preview);
        if (meta.lines.length > 8) {
            lines.push(`… +${meta.lines.length - 8} more`);
        }
    }

    return lines.join('\n').slice(0, 1000);
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
        const meta = payload.meta;

        if (!meta || meta.source !== 'imos-kitchen') {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, description: 'meta with source imos-kitchen is required' }));
            return;
        }

        const caption = buildCaption(meta);
        const tgUrl = `https://api.telegram.org/bot${token}/sendMessage`;
        const tgRes = await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: caption }),
        });
        const tgJson = await tgRes.json();

        res.statusCode = tgRes.ok ? 200 : 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: !!tgJson.ok, telegram: tgJson }));
    } catch (err) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, description: err.message || 'Bad request' }));
    }
};
