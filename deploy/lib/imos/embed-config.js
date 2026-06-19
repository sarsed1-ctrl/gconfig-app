'use strict';

/**
 * IMOS iX NET embed configuration for GConfig Kitchen shell.
 * No credentials here — users authenticate inside the IMOS iframe.
 */

const IMOS_EMBED = {
    baseUrl: 'https://3034.netshop.imos3d.com',
    tenantContext: 3034,
    allowedOrigins: ['https://3034.netshop.imos3d.com'],
    catalogs: {
        kitchen: {
            catalogProgram: '3034_1',
            path: '/app/projects/current/(sidebar:catalog/3034_1/Kitchen)',
            label: { en: 'Kitchen', ru: 'Кухня' },
        },
    },
    /** IMOS basket URL (after login) for order follow-up */
    basketPath: '/app/projects/current',
    embedCheckTimeoutMs: 12000,
    /**
     * Launch modes:
     * - launcher (default): GConfig shell + button — login works (top-level / new tab)
     * - embed: iframe only — often breaks IMOS session cookies in Chrome/Edge/Safari
     * - redirect: skip launcher, go straight to IMOS in this tab
     */
    defaultLaunchMode: 'launcher',
    postMessageTypes: {
        complete: 'externalConfiguratorComplete',
    },
};

/**
 * @param {URLSearchParams} [params]
 * @returns {'launcher'|'embed'|'redirect'}
 */
function resolveLaunchMode(params) {
    const q = params || (typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams());
    const mode = (q.get('mode') || IMOS_EMBED.defaultLaunchMode || 'launcher').toLowerCase();
    if (mode === 'embed' || mode === 'iframe') return 'embed';
    if (mode === 'redirect' || mode === 'full') return 'redirect';
    return 'launcher';
}

/**
 * @param {'kitchen'} catalogKey
 * @returns {string}
 */
function getCatalogUrl(catalogKey) {
    const cat = IMOS_EMBED.catalogs[catalogKey];
    if (!cat) {
        throw new Error(`Unknown IMOS catalog: ${catalogKey}`);
    }
    return IMOS_EMBED.baseUrl + cat.path;
}

/**
 * @param {'kitchen'} catalogKey
 * @returns {string}
 */
function getBasketUrl() {
    return IMOS_EMBED.baseUrl + IMOS_EMBED.basketPath;
}

/**
 * @param {string} origin
 * @returns {boolean}
 */
function isAllowedOrigin(origin) {
    return IMOS_EMBED.allowedOrigins.includes(origin);
}

const api = {
    IMOS_EMBED,
    getCatalogUrl,
    getBasketUrl,
    isAllowedOrigin,
    resolveLaunchMode,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.GConfigImos = window.GConfigImos || {};
    Object.assign(window.GConfigImos, api);
}
