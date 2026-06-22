'use strict';

/** Standard concealed hinge cup (GTV / HAFELE EU). */
const CUP_DIAMETER_MM = 35;
const CUP_DEPTH_MM = 12;
const CUP_DEPTH_MIN_MM = 11;
const CUP_DEPTH_MAX_MM = 13;

/** Distance from door edge to cup bore perimeter (classic 4–5 mm). */
const CUP_EDGE_MARGIN_MM = 4.5;

/** Cup mounting screw scheme: spacing / row offset from cup center toward edge. */
const CUP_SCREW_SPACING_MM = 45;
const CUP_SCREW_ROW_OFFSET_MM = 9.5;

const CUP_SCREW_DIAMETER_MM = 5;
const CUP_SCREW_DEPTH_MM = 12;

/** Mounting plate on carcass side (System 32). */
const PLATE_DEPTH_MM = 37;
const PLATE_PITCH_MM = 32;
const PLATE_SCREW_DIAMETER_MM = 5;
const PLATE_SCREW_DEPTH_MM = 12;

function roundMm(v) {
    return Math.round(v * 10) / 10;
}

/**
 * Center of 35 mm cup from hinge-side door edge (X on facade).
 * @param {number} [_facadeThickness] — reserved for future inset tweaks
 */
function getCupCenterFromEdge(_facadeThickness) {
    return roundMm(CUP_EDGE_MARGIN_MM + CUP_DIAMETER_MM / 2);
}

/**
 * Two euro-screw pilot holes relative to cup center on facade.
 * Screws sit in a row toward the door edge; spacing is vertical (along door height).
 * @returns {{ dx: number, dy: number }[]}
 */
function getCupScrewOffsets(scheme) {
    const spacing = scheme?.spacing ?? CUP_SCREW_SPACING_MM;
    const rowOffset = scheme?.rowOffset ?? CUP_SCREW_ROW_OFFSET_MM;
    return [
        { dx: rowOffset, dy: -spacing / 2 },
        { dx: rowOffset, dy: spacing / 2 },
    ];
}

/**
 * Map hinge height from cabinet bottom (mm) to facade panel Y (bottom-left origin).
 * @param {number} hingePosMm — distance from cabinet bottom
 * @param {{ doorType?: string, overlayGap?: number, insetGap?: number, carcassT?: number, cabinetH?: number, doorHeight?: number }} doorConfig
 */
function mapCabinetYToFacadeY(hingePosMm, doorConfig) {
    const cabinetH = Math.max(1, doorConfig.cabinetH || 1);
    const doorH = Math.max(1, doorConfig.doorHeight || cabinetH);
    const carcassT = doorConfig.carcassT ?? 16;
    const overlayGap = doorConfig.overlayGap ?? 2;
    const insetGap = doorConfig.insetGap ?? 2;
    const doorType = doorConfig.doorType || 'overlay';

    let doorBottomFromCabinetBottom;
    if (doorType === 'overlay') {
        doorBottomFromCabinetBottom = overlayGap;
    } else {
        doorBottomFromCabinetBottom = carcassT + insetGap;
    }

    const yOnDoor = hingePosMm - doorBottomFromCabinetBottom;
    return roundMm(Math.max(0, Math.min(doorH, yOnDoor)));
}

/**
 * Cabinet-side X for mounting plate holes (height from floor on inner face).
 * @param {number} hingePosMm
 */
function mapCabinetYToSideFaceX(hingePosMm) {
    return roundMm(Math.max(0, hingePosMm));
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} diameter
 * @param {number} depth
 * @param {'hinge_cup'|'hinge_cup_screw'|'hinge_plate'} purpose
 */
function makeHingeHole(x, y, diameter, depth, purpose) {
    return {
        x: roundMm(x),
        y: roundMm(y),
        diameter: roundMm(diameter),
        depth: roundMm(depth),
        type: 'face',
        purpose,
    };
}

function makeCupHole(x, y) {
    return makeHingeHole(x, y, CUP_DIAMETER_MM, CUP_DEPTH_MM, 'hinge_cup');
}

function makeCupScrewHole(x, y) {
    return makeHingeHole(x, y, CUP_SCREW_DIAMETER_MM, CUP_SCREW_DEPTH_MM, 'hinge_cup_screw');
}

function makePlateScrewHole(x, y) {
    return makeHingeHole(x, y, PLATE_SCREW_DIAMETER_MM, PLATE_SCREW_DEPTH_MM, 'hinge_plate');
}

const api = {
    CUP_DIAMETER_MM,
    CUP_DEPTH_MM,
    CUP_DEPTH_MIN_MM,
    CUP_DEPTH_MAX_MM,
    CUP_EDGE_MARGIN_MM,
    CUP_SCREW_SPACING_MM,
    CUP_SCREW_ROW_OFFSET_MM,
    CUP_SCREW_DIAMETER_MM,
    CUP_SCREW_DEPTH_MM,
    PLATE_DEPTH_MM,
    PLATE_PITCH_MM,
    PLATE_SCREW_DIAMETER_MM,
    PLATE_SCREW_DEPTH_MM,
    getCupCenterFromEdge,
    getCupScrewOffsets,
    mapCabinetYToFacadeY,
    mapCabinetYToSideFaceX,
    makeHingeHole,
    makeCupHole,
    makeCupScrewHole,
    makePlateScrewHole,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.GConfigDrilling = window.GConfigDrilling || {};
    Object.assign(window.GConfigDrilling, api);
}
