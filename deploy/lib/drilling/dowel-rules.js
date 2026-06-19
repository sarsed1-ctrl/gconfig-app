'use strict';

const DOWEL_DIAMETER_MM = 8;
const DOWEL_LENGTH_MM = 40;
const MAX_THICKNESS_FOR_8MM = 18;

/** Fixed face/edge depths per board thickness (8×40 dowel). Sum to 40 mm is not required. */
const DEPTH_BY_THICKNESS_MM = {
    16: { faceDepth: 13, edgeDepth: 29 },
    18: { faceDepth: 15, edgeDepth: 27 },
};

const FACE_DEPTH_DEFAULT_MM = DEPTH_BY_THICKNESS_MM[16].faceDepth;

const EDGE_OFFSET_MIN_MM = 35;
const EDGE_OFFSET_MAX_MM = 50;
const EDGE_OFFSET_DEFAULT_MM = 40;

/** +1 dowel each time length passes another 300 mm ( >300→3, >600→4, >900→5 … ). */
const DENSITY_LENGTH_STEP_MM = 300;
const DENSITY_MIN_COUNT = 2;

const DEFAULT_GLUE_GAP_MM = 1;

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

function roundMm(v) {
    return Math.round(v * 10) / 10;
}

function resolveThicknessDepthProfile(thicknessMm) {
    const t = Math.round(Math.max(1, thicknessMm));
    if (DEPTH_BY_THICKNESS_MM[t]) return DEPTH_BY_THICKNESS_MM[t];
    return t <= 17 ? DEPTH_BY_THICKNESS_MM[16] : DEPTH_BY_THICKNESS_MM[18];
}

/**
 * Face depth avoids surface weakening; edge depth includes tolerance + glue allowance.
 * No strict sum-to-40 constraint.
 * @param {number} panelThicknessMm
 * @param {{ glueGapMm?: number, faceDepth?: number, edgeDepth?: number }} [opts]
 */
function getDowelDepths(panelThicknessMm, opts = {}) {
    const t = Math.max(1, panelThicknessMm);
    const glueGap = opts.glueGapMm ?? DEFAULT_GLUE_GAP_MM;
    const preset = resolveThicknessDepthProfile(t);
    const faceDepth = opts.faceDepth ?? preset.faceDepth;
    const edgeDepth = opts.edgeDepth ?? preset.edgeDepth;
    return {
        diameter: t <= MAX_THICKNESS_FOR_8MM ? DOWEL_DIAMETER_MM : DOWEL_DIAMETER_MM,
        dowelLength: DOWEL_LENGTH_MM,
        faceDepth: roundMm(faceDepth),
        edgeDepth: roundMm(edgeDepth),
        glueGap,
        totalDepth: roundMm(faceDepth + edgeDepth),
    };
}

/**
 * Required dowel count along length: 2 base; +1 per 300 mm band (>300→3, >600→4…).
 * @param {number} lengthMm
 */
function getRequiredDowelCount(lengthMm) {
    const length = Math.max(1, lengthMm);
    return DENSITY_MIN_COUNT + Math.floor((length - 1) / DENSITY_LENGTH_STEP_MM);
}

/**
 * Symmetric dowels along panel length: outer pair at edge offset, extras only between.
 * @param {number} lengthMm
 * @param {{ edgeOffset?: number }} [opts]
 * @returns {number[]}
 */
function getLengthAxisDowelPositions(lengthMm, opts = {}) {
    const length = Math.max(1, lengthMm);
    const edgeOffset = clamp(
        opts.edgeOffset ?? EDGE_OFFSET_DEFAULT_MM,
        EDGE_OFFSET_MIN_MM,
        EDGE_OFFSET_MAX_MM
    );

    if (length <= 2 * edgeOffset) {
        return [roundMm(length / 2)];
    }

    const outerStart = edgeOffset;
    const outerEnd = length - edgeOffset;
    const required = getRequiredDowelCount(length);

    if (required <= 2) {
        return [roundMm(outerStart), roundMm(outerEnd)];
    }

    const innerSpan = outerEnd - outerStart;
    const middleCount = required - 2;
    const positions = [roundMm(outerStart)];
    for (let i = 1; i <= middleCount; i += 1) {
        positions.push(roundMm(outerStart + (i * innerSpan) / (middleCount + 1)));
    }
    positions.push(roundMm(outerEnd));
    return positions;
}

/** @deprecated alias — depth axis on side inner face */
function getDepthHolePositions(depthMm, opts) {
    return getLengthAxisDowelPositions(depthMm, opts);
}

/** Center of panel thickness — dowel axis on edge (торец). */
function getDowelThicknessCenter(thicknessMm) {
    return roundMm(Math.max(1, thicknessMm) / 2);
}

/** Offset on face (пласть) = half thickness of mating edge part. */
function getFaceDowelLineOffset(matingEdgeThicknessMm) {
    return getDowelThicknessCenter(matingEdgeThicknessMm);
}

function makeHole(x, y, depth, type, purpose = 'dowel_8x40') {
    return {
        x: roundMm(x),
        y: roundMm(y),
        diameter: DOWEL_DIAMETER_MM,
        depth: roundMm(depth),
        type,
        purpose,
    };
}

const api = {
    DOWEL_DIAMETER_MM,
    DOWEL_LENGTH_MM,
    DEPTH_BY_THICKNESS_MM,
    FACE_DEPTH_DEFAULT_MM,
    EDGE_OFFSET_DEFAULT_MM,
    DENSITY_LENGTH_STEP_MM,
    DENSITY_MIN_COUNT,
    DEFAULT_GLUE_GAP_MM,
    getDowelDepths,
    getRequiredDowelCount,
    getLengthAxisDowelPositions,
    getDepthHolePositions,
    getDowelThicknessCenter,
    getFaceDowelLineOffset,
    makeHole,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.GConfigDrilling = window.GConfigDrilling || {};
    Object.assign(window.GConfigDrilling, api);
}
