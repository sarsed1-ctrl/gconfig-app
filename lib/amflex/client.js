'use strict';

const AMFLEX_BASE = process.env.AMFLEX_BASE_URL || 'https://amflexapi.azurewebsites.net';

/** @type {{ at: number, country: string, data: import('./pricing').AmflexCatalog } | null} */
let catalogCache = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * @param {string} path
 * @returns {Promise<unknown>}
 */
async function amflexGet(path) {
    const res = await fetch(`${AMFLEX_BASE}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`Amflex GET ${path} failed: HTTP ${res.status}`);
    }
    return res.json();
}

/**
 * @param {string} countryCode EE | LV | ...
 */
async function loadCatalog(countryCode) {
    const cc = (countryCode || 'EE').toUpperCase();
    const now = Date.now();
    if (catalogCache && catalogCache.country === cc && now - catalogCache.at < CACHE_TTL_MS) {
        return catalogCache.data;
    }

    const [materialsRaw, finishesRaw, plasticsRaw, glueRaw, fiberRaw, settingRaw] = await Promise.all([
        amflexGet('/api/GetMaterials'),
        amflexGet('/api/GetFinishes'),
        amflexGet('/api/GetPlastics'),
        amflexGet('/api/GetSettings/glue'),
        amflexGet('/api/GetSettings/fiber'),
        amflexGet('/api/GetSettings/setting'),
    ]);

    const { buildCatalog } = require('./pricing');
    const data = buildCatalog({
        countryCode: cc,
        materialsRaw,
        finishesRaw,
        plasticsRaw,
        glueRaw,
        fiberRaw,
        settingRaw,
    });
    catalogCache = { at: now, country: cc, data };
    return data;
}

/**
 * @param {Buffer|Uint8Array|ArrayBuffer} xlsxBytes
 * @returns {Promise<{ orderId: string, payload: import('./pricing').AmflexOrderPayload }>}
 */
async function importTellimusXlsx(xlsxBytes) {
    const orderRes = await fetch(`${AMFLEX_BASE}/api/getOrderId`);
    if (!orderRes.ok) {
        throw new Error(`Amflex getOrderId failed: HTTP ${orderRes.status}`);
    }
    const orderId = String(await orderRes.json()).replace(/"/g, '');

    const body = xlsxBytes instanceof Buffer ? xlsxBytes : Buffer.from(xlsxBytes);
    const importRes = await fetch(`${AMFLEX_BASE}/api/ImportFile/${orderId}`, {
        method: 'POST',
        headers: {
            'x-ms-blob-type': 'BlockBlob',
            'x-ms-blob-content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body,
    });
    if (!importRes.ok) {
        const text = await importRes.text().catch(() => '');
        throw new Error(`Amflex ImportFile failed: HTTP ${importRes.status} ${text}`.trim());
    }

    const itemsRes = await fetch(`${AMFLEX_BASE}/api/GetOrderItems/${orderId}`);
    if (!itemsRes.ok) {
        throw new Error(`Amflex GetOrderItems failed: HTTP ${itemsRes.status}`);
    }
    let payload = await itemsRes.json();
    if (typeof payload === 'string') {
        payload = JSON.parse(payload.replace(/[\n\r\b]/g, ''));
    }
    if (payload.error && String(payload.error).length > 0) {
        const err = new Error(String(payload.error));
        err.statusCode = 422;
        throw err;
    }
    return { orderId, payload };
}

module.exports = {
    AMFLEX_BASE,
    loadCatalog,
    importTellimusXlsx,
};
