'use strict';

class ImosXmlParseError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'ImosXmlParseError';
        this.code = code || 'IMOS_XML_PARSE_ERROR';
    }
}

/**
 * Minimal XML text extraction without DOM (Node + browser safe).
 * @param {string} xml
 * @param {string} tag
 * @returns {string[]}
 */
function extractTagTexts(xml, tag) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) {
        out.push(m[1].trim());
    }
    return out;
}

/**
 * @param {string} xml
 * @returns {string}
 */
function extractProjectName(xml) {
    const candidates = [
        ...extractTagTexts(xml, 'ProjectName'),
        ...extractTagTexts(xml, 'projectName'),
        ...extractTagTexts(xml, 'Name'),
    ];
    return candidates[0] || '';
}

/**
 * Parse IMOS basket/order XML into GConfig-friendly metadata.
 * Schema varies per catalog — this parser is defensive until a tenant sample is locked in.
 *
 * @param {string} xml
 * @returns {{ projectName: string, articleCount: number, lines: Array<{ name: string, material?: string, qty?: number }>, source: 'imos-kitchen', rawArticleTags: number }}
 */
function parseImosOrderXml(xml) {
    if (typeof xml !== 'string' || !xml.trim()) {
        throw new ImosXmlParseError('XML input is empty', 'IMOS_XML_EMPTY');
    }
    if (!xml.includes('<')) {
        throw new ImosXmlParseError('Input does not look like XML', 'IMOS_XML_INVALID');
    }

    const projectName = extractProjectName(xml);

    const articleBlocks = extractTagTexts(xml, 'Article');
    const lines = [];

    for (const block of articleBlocks) {
        const name =
            (extractTagTexts(block, 'ArticleName')[0]) ||
            (extractTagTexts(block, 'Name')[0]) ||
            (extractTagTexts(block, 'Description')[0]) ||
            'Article';
        const material =
            extractTagTexts(block, 'Material')[0] ||
            extractTagTexts(block, 'MaterialCode')[0] ||
            undefined;
        const qtyRaw = extractTagTexts(block, 'Quantity')[0] || extractTagTexts(block, 'Qty')[0];
        const qty = qtyRaw ? Number(qtyRaw) : undefined;
        lines.push({
            name,
            ...(material ? { material } : {}),
            ...(Number.isFinite(qty) ? { qty } : {}),
        });
    }

    if (!lines.length) {
        const fallbackNames = extractTagTexts(xml, 'ArticleName');
        for (const name of fallbackNames) {
            lines.push({ name });
        }
    }

    return {
        projectName,
        articleCount: lines.length,
        lines,
        source: 'imos-kitchen',
        rawArticleTags: articleBlocks.length,
    };
}

/**
 * @param {unknown} meta
 * @returns {meta is ReturnType<typeof parseImosOrderXml>}
 */
function validateOrderMeta(meta) {
    if (!meta || typeof meta !== 'object') return false;
    const m = /** @type {Record<string, unknown>} */ (meta);
    return (
        m.source === 'imos-kitchen' &&
        typeof m.articleCount === 'number' &&
        Array.isArray(m.lines)
    );
}

const api = {
    ImosXmlParseError,
    parseImosOrderXml,
    validateOrderMeta,
    extractTagTexts,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.GConfigImos = window.GConfigImos || {};
    Object.assign(window.GConfigImos, api);
}
