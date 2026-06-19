'use strict';

const { isAllowedOrigin, IMOS_EMBED } = require('./embed-config.js');

class ImosEmbedError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'ImosEmbedError';
        this.code = code || 'IMOS_EMBED_ERROR';
    }
}

class ImosOriginError extends ImosEmbedError {
    constructor(origin) {
        super(`Rejected postMessage from untrusted origin: ${origin}`, 'IMOS_ORIGIN_REJECTED');
        this.name = 'ImosOriginError';
        this.origin = origin;
    }
}

/**
 * Parse IMOS postMessage payload (string JSON or object).
 * @param {unknown} data
 * @returns {Record<string, unknown>|null}
 */
function parsePostMessageData(data) {
    if (data == null) return null;
    if (typeof data === 'object') return /** @type {Record<string, unknown>} */ (data);
    if (typeof data !== 'string' || !data.trim()) return null;
    try {
        const parsed = JSON.parse(data);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {boolean}
 */
function isConfiguratorCompleteMessage(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const completeType = IMOS_EMBED.postMessageTypes.complete;
    if (payload.type === completeType) return true;
    if (payload.closeMessage === completeType) return true;
    if (payload.message === completeType) return true;
    return false;
}

/**
 * @param {MessageEvent} event
 * @param {string[]} [allowedOrigins]
 * @returns {{ ok: true, payload: Record<string, unknown> } | { ok: false, error: ImosEmbedError }}
 */
function handlePostMessage(event, allowedOrigins) {
    const origins = allowedOrigins && allowedOrigins.length
        ? allowedOrigins
        : IMOS_EMBED.allowedOrigins;

    if (!origins.includes(event.origin)) {
        return { ok: false, error: new ImosOriginError(event.origin) };
    }

    const payload = parsePostMessageData(event.data);
    if (!payload) {
        return { ok: false, error: new ImosEmbedError('Invalid postMessage payload', 'IMOS_PARSE_ERROR') };
    }

    if (!isConfiguratorCompleteMessage(payload)) {
        return { ok: false, error: new ImosEmbedError('Ignored message type', 'IMOS_MESSAGE_IGNORED') };
    }

    return { ok: true, payload };
}

/**
 * Browser-only: subscribe to IMOS external configurator completion events.
 * @param {{ onComplete?: (payload: Record<string, unknown>) => void, onError?: (err: ImosEmbedError) => void, allowedOrigins?: string[] }} opts
 * @returns {() => void} dispose
 */
function createImosEmbedBridge(opts) {
    if (typeof window === 'undefined') {
        throw new ImosEmbedError('createImosEmbedBridge requires a browser environment', 'IMOS_NO_WINDOW');
    }

    const onComplete = opts.onComplete;
    const onError = opts.onError;
    const allowedOrigins = opts.allowedOrigins;

    function onMessage(event) {
        const result = handlePostMessage(event, allowedOrigins);
        if (result.ok) {
            onComplete?.(result.payload);
            return;
        }
        if (result.error.code !== 'IMOS_MESSAGE_IGNORED') {
            onError?.(result.error);
        }
    }

    window.addEventListener('message', onMessage);
    return function dispose() {
        window.removeEventListener('message', onMessage);
    };
}

const api = {
    ImosEmbedError,
    ImosOriginError,
    parsePostMessageData,
    isConfiguratorCompleteMessage,
    handlePostMessage,
    createImosEmbedBridge,
    isAllowedOrigin,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.GConfigImos = window.GConfigImos || {};
    Object.assign(window.GConfigImos, api);
}
