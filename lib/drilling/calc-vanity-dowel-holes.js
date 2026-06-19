'use strict';

function drillRules() {
    if (typeof require !== 'undefined') return require('./dowel-rules.js');
    const g = typeof window !== 'undefined' ? window : globalThis;
    return g.GConfigDrilling || {};
}

function getShelfOpenIntervals(totalInnerMm, perpCount, spacingMm, shelfThickMm) {
    const total = Math.max(0, totalInnerMm);
    if (total <= 0) return [];
    if (!perpCount || perpCount <= 0) return [{ start: 0, end: total }];

    const thick = Math.max(1, shelfThickMm || 16);
    const blocks = [];
    for (let i = 0; i < perpCount; i++) {
        const start = Math.min(total, Math.max(0, spacingMm * (i + 1)));
        const end = Math.min(total, start + thick);
        if (end > start) blocks.push({ start, end });
    }
    blocks.sort((a, b) => a.start - b.start);

    const merged = [];
    blocks.forEach((b) => {
        if (!merged.length || b.start > merged[merged.length - 1].end) {
            merged.push({ start: b.start, end: b.end });
        } else {
            merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, b.end);
        }
    });

    const open = [];
    let cursor = 0;
    merged.forEach((b) => {
        if (b.start > cursor) open.push({ start: cursor, end: b.start });
        cursor = Math.max(cursor, b.end);
    });
    if (cursor < total) open.push({ start: cursor, end: total });
    return open.length ? open : [{ start: 0, end: total }];
}

function partId(zone, base) {
    return zone ? `${zone}_${base}` : base;
}

/**
 * @typedef {object} ClosetDrillingConfig
 * @property {string} [zone] — '' or 'lower' for vanity ids; 'upper' for upper closet
 * @property {number} w
 * @property {number} h
 * @property {number} d
 * @property {number} carcassT
 * @property {boolean} [hasRoof]
 * @property {number} [glueGapMm]
 * @property {number} [shelvesH]
 * @property {number} [shelvesV]
 * @property {number} [shelfT]
 * @property {number} [spacingH]
 * @property {number} [spacingV]
 * @property {object} [labels]
 */

/**
 * @param {ClosetDrillingConfig} config
 * @returns {{ sheets: object[], dowelCount: number, depths: object, dowelSpec: string }}
 */
function calcClosetCarcassDowelHoles(config) {
    const {
        zone = '',
        w,
        h,
        d,
        carcassT,
        hasRoof = true,
        glueGapMm,
        shelvesH = 0,
        shelvesV = 0,
        shelfT = carcassT,
        spacingH = 150,
        spacingV = 200,
        labels = {},
    } = config;

    const rules = drillRules();
    const sideDepths = rules.getDowelDepths(carcassT, { glueGapMm });
    const innerW = w - 2 * carcassT;
    const depthY = rules.getDepthHolePositions(d);
    const shelfDepthY = rules.getDepthHolePositions(Math.max(1, d - 4));

    const bottomFaceX = rules.getFaceDowelLineOffset(carcassT);
    const topFaceX = h - rules.getFaceDowelLineOffset(carcassT);

    const L = labels;
    const partNames = {
        sideLeft: L.sideLeft || 'Left side panel',
        sideRight: L.sideRight || 'Right side panel',
        bottom: L.bottom || 'Bottom panel',
        roof: L.roof || 'Top panel',
        shelfPrefix: L.shelfPrefix || 'Horizontal shelf',
    };

    const sheets = [];
    const sheetMap = new Map();

    function getSheet(id, partName, viewLabel, lengthMm, widthMm, thicknessMm, layout) {
        if (!sheetMap.has(id)) {
            const sheet = {
                partId: id,
                partName,
                viewLabel,
                lengthMm,
                widthMm,
                thicknessMm,
                layout: layout || (id.includes('side_') ? 'side' : 'horizontal'),
                holes: [],
            };
            if (zone) sheet.zone = zone;
            sheetMap.set(id, sheet);
            sheets.push(sheet);
        }
        return sheetMap.get(id);
    }

    function addFaceHole(idBase, partName, lengthMm, widthMm, x, y) {
        const sheet = getSheet(partId(zone, idBase), partName, 'Inner face', lengthMm, widthMm, carcassT);
        sheet.holes.push(rules.makeHole(x, y, sideDepths.faceDepth, 'face'));
    }

    function addEdgeHole(partIdBase, partName, depthMm, thicknessMm, edgeLabel, edgeKey, depthPos) {
        const id = partId(zone, `${partIdBase}_edges`);
        const edgeDepths = rules.getDowelDepths(thicknessMm, { glueGapMm });
        const tCenter = rules.getDowelThicknessCenter(thicknessMm);
        const sheet = getSheet(
            id,
            partName,
            'Edges: left + right',
            depthMm,
            thicknessMm,
            thicknessMm,
            'edge_pair'
        );
        if (!sheet.edges) sheet.edges = [];
        let edge = sheet.edges.find((e) => e.key === edgeKey);
        if (!edge) {
            edge = { key: edgeKey, label: edgeLabel, holes: [] };
            sheet.edges.push(edge);
        }
        const hole = rules.makeHole(depthPos, tCenter, edgeDepths.edgeDepth, 'edge');
        hole.edgeKey = edgeKey;
        hole.edgeLabel = edgeLabel;
        edge.holes.push(hole);
        sheet.holes.push(hole);
    }

    // Bottom ↔ sides
    depthY.forEach((y) => {
        addFaceHole('side_left', partNames.sideLeft, h, d, bottomFaceX, y);
        addFaceHole('side_right', partNames.sideRight, h, d, bottomFaceX, y);
    });
    depthY.forEach((y) => {
        addEdgeHole('bottom', partNames.bottom, d, carcassT, 'Left edge', 'edge_l', y);
        addEdgeHole('bottom', partNames.bottom, d, carcassT, 'Right edge', 'edge_r', y);
    });

    // Roof ↔ sides
    if (hasRoof) {
        depthY.forEach((y) => {
            addFaceHole('side_left', partNames.sideLeft, h, d, topFaceX, y);
            addFaceHole('side_right', partNames.sideRight, h, d, topFaceX, y);
        });
        depthY.forEach((y) => {
            addEdgeHole('roof', partNames.roof, d, carcassT, 'Left edge', 'edge_l', y);
            addEdgeHole('roof', partNames.roof, d, carcassT, 'Right edge', 'edge_r', y);
        });
    }

    // Horizontal shelves ↔ sides
    if (shelvesH > 0) {
        const shelfD = d - 4;
        const xSegments = getShelfOpenIntervals(innerW, shelvesV, spacingV, shelfT);
        for (let i = 0; i < shelvesH; i++) {
            const posFromBottom = spacingH * (i + 1);
            const shelfFaceX = carcassT + posFromBottom + rules.getDowelThicknessCenter(shelfT);
            xSegments.forEach((seg, sIdx) => {
                const segW = seg.end - seg.start;
                if (segW <= 0) return;
                const suffix = xSegments.length > 1 ? `.${sIdx + 1}` : '';
                const shelfId = `shelf_h_${i + 1}${suffix}`;
                const shelfName = `${partNames.shelfPrefix} #${i + 1}${suffix}`;
                shelfDepthY.forEach((y) => {
                    addFaceHole('side_left', partNames.sideLeft, h, d, shelfFaceX, y);
                    addFaceHole('side_right', partNames.sideRight, h, d, shelfFaceX, y);
                });
                shelfDepthY.forEach((y) => {
                    addEdgeHole(shelfId, shelfName, shelfD, shelfT, 'Left edge', 'edge_l', y);
                    addEdgeHole(shelfId, shelfName, shelfD, shelfT, 'Right edge', 'edge_r', y);
                });
            });
        }
    }

    const edgeOrder = { edge_l: 0, edge_r: 1 };
    sheets.forEach((s) => {
        if (s.layout === 'edge_pair' && s.edges?.length) {
            s.edges.sort((a, b) => (edgeOrder[a.key] ?? 9) - (edgeOrder[b.key] ?? 9));
        }
    });

    let holeCount = 0;
    sheets.forEach((s) => {
        holeCount += s.holes.length;
    });

    return {
        sheets,
        dowelCount: Math.ceil(holeCount / 2),
        depths: sideDepths,
        dowelSpec: `Ø${sideDepths.diameter}×${rules.DOWEL_LENGTH_MM}`,
    };
}

function mergeDowelResults(results) {
    const list = (results || []).filter(Boolean);
    const sheets = list.flatMap((r) => r.sheets || []);
    const dowelCount = list.reduce((sum, r) => sum + (r.dowelCount || 0), 0);
    const first = list[0] || {};
    return {
        sheets,
        dowelCount,
        depths: first.depths,
        dowelSpec: first.dowelSpec,
    };
}

/**
 * @param {object} config — legacy vanity config (w1/h1/d1)
 */
function calcVanityDowelHoles(config) {
    return calcClosetCarcassDowelHoles({
        zone: '',
        w: config.w1,
        h: config.h1,
        d: config.d1,
        carcassT: config.carcassT,
        hasRoof: config.hasRoof !== false,
        glueGapMm: config.glueGapMm,
        shelvesH: config.vanityShelvesH,
        shelvesV: config.vanityShelvesV,
        shelfT: config.vanityShelfT,
        spacingH: config.vanitySpacingH,
        spacingV: config.vanitySpacingV,
        labels: config.labels,
    });
}

function calcUpperClosetDowelHoles(config) {
    return calcClosetCarcassDowelHoles({
        zone: 'upper',
        w: config.w2,
        h: config.h2,
        d: config.d2,
        carcassT: config.carcassT,
        hasRoof: true,
        glueGapMm: config.glueGapMm,
        shelvesH: config.upperShelvesH,
        shelvesV: config.upperShelvesV,
        shelfT: config.upperShelfT,
        spacingH: config.upperSpacingH,
        spacingV: config.upperSpacingV,
        labels: config.labels,
    });
}

function buildVanityDrillingConfigFromDom(doc, labels) {
    const num = (id, fallback = 0) => parseInt(doc.getElementById(id)?.value, 10) || fallback;
    const carcassT = num('carcassThick', 16);
    return {
        w1: num('w1'),
        h1: num('h1'),
        d1: num('d1'),
        carcassT,
        hasRoof: true,
        vanityShelvesH: num('vanityShelvesH'),
        vanityShelvesV: num('vanityShelvesV'),
        vanityShelfT: num('vanityShelfThick', carcassT),
        vanitySpacingH: num('vanitySpacingH', 150),
        vanitySpacingV: num('vanitySpacingV', 200),
        labels,
    };
}

function buildUpperDrillingConfigFromDom(doc, labels) {
    const num = (id, fallback = 0) => parseInt(doc.getElementById(id)?.value, 10) || fallback;
    const carcassT = num('carcassThick', 16);
    return {
        w2: num('upper_w'),
        h2: num('upper_h'),
        d2: num('upper_d'),
        carcassT,
        upperShelvesH: num('upperShelvesH'),
        upperShelvesV: num('upperShelvesV'),
        upperShelfT: num('upperShelfThick', carcassT),
        upperSpacingH: num('upperSpacingH', 100),
        upperSpacingV: num('upperSpacingV', 200),
        labels,
    };
}

function buildCombinedClosetDrillingFromDom(doc, labels) {
    const lowerLabels = labels.lower || labels;
    const upperLabels = labels.upper || {};
    const lower = buildVanityDrillingConfigFromDom(doc, lowerLabels);
    const upper = buildUpperDrillingConfigFromDom(doc, upperLabels);
    const results = [calcVanityDowelHoles(lower)];
    if (upper.w2 > 0 && upper.h2 > 0 && upper.d2 > 0) {
        results.push(calcUpperClosetDowelHoles(upper));
    }
    return mergeDowelResults(results);
}

const api = {
    calcClosetCarcassDowelHoles,
    calcVanityDowelHoles,
    calcUpperClosetDowelHoles,
    mergeDowelResults,
    buildVanityDrillingConfigFromDom,
    buildUpperDrillingConfigFromDom,
    buildCombinedClosetDrillingFromDom,
    getShelfOpenIntervals,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.GConfigDrilling = window.GConfigDrilling || {};
    Object.assign(window.GConfigDrilling, api);
}
