'use strict';

function hingeRules() {
    if (typeof require !== 'undefined') return require('./hinge-rules.js');
    const g = typeof window !== 'undefined' ? window : globalThis;
    return g.GConfigDrilling || {};
}

function partId(zone, base) {
    return zone ? `${zone}_${base}` : base;
}

function suggestHingePositions(count, doorHeightMm) {
    if (count <= 1) return [Math.max(100, Math.round(doorHeightMm / 2))];
    const top = 100;
    const bottom = Math.max(top + 50, doorHeightMm - 100);
    if (count === 2) return [top, bottom];
    const step = (bottom - top) / (count - 1);
    return Array.from({ length: count }, (_, i) => Math.round(top + step * i));
}

/**
 * @param {{ width: number, height: number, hingeSide: 'left'|'right', id: string, name: string }} door
 * @param {number[]} hingePositionsMm — cabinet coords from bottom
 * @param {object} doorConfig
 * @param {ReturnType<typeof hingeRules>} rules
 */
function addFacadeHingeHoles(door, hingePositionsMm, doorConfig, rules) {
    const cupCenterX = rules.getCupCenterFromEdge(doorConfig.facadeT);
    const screwOffsets = rules.getCupScrewOffsets();
    const holes = [];

    hingePositionsMm.forEach((cabinetY) => {
        const y = rules.mapCabinetYToFacadeY(cabinetY, {
            ...doorConfig,
            doorHeight: door.height,
        });

        const sides = door.hingeSide === 'both' ? ['left', 'right'] : [door.hingeSide];
        sides.forEach((side) => {
            const sign = side === 'left' ? 1 : -1;
            const cupX = side === 'left' ? cupCenterX : door.width - cupCenterX;
            holes.push(rules.makeCupHole(cupX, y));

            screwOffsets.forEach((off) => {
                const screwX = side === 'left'
                    ? cupX + sign * off.dx
                    : cupX - off.dx;
                const screwY = y + off.dy;
                holes.push(rules.makeCupScrewHole(screwX, screwY));
            });
        });
    });

    return holes;
}

/**
 * @param {'left'|'right'} side
 * @param {number[]} hingePositionsMm
 * @param {ReturnType<typeof hingeRules>} rules
 */
function addSidePlateHoles(side, hingePositionsMm, rules) {
    const holes = [];
    const depthY = rules.PLATE_DEPTH_MM;
    const halfPitch = rules.PLATE_PITCH_MM / 2;

    hingePositionsMm.forEach((cabinetY) => {
        const faceX = rules.mapCabinetYToSideFaceX(cabinetY);
        holes.push(rules.makePlateScrewHole(faceX - halfPitch, depthY));
        holes.push(rules.makePlateScrewHole(faceX + halfPitch, depthY));
    });

    return holes.map((h) => ({ ...h, sideKey: side }));
}

/**
 * @typedef {object} HingeZoneConfig
 * @property {string} zone
 * @property {string} hardwareMode
 * @property {number} hingeCount
 * @property {number[]} hingePositions
 * @property {string} hingePosition — left | right | both
 * @property {Array<{ id: string, name: string, width: number, height: number, hingeSide: string }>} doors
 * @property {number} facadeT
 * @property {number} carcassT
 * @property {number} cabinetH
 * @property {string} doorType
 * @property {number} overlayGap
 * @property {number} insetGap
 * @property {object} [labels]
 */

/**
 * @param {HingeZoneConfig} config
 * @returns {{ sheets: object[] }}
 */
function calcZoneHingeDrilling(config) {
    const {
        zone = 'lower',
        hardwareMode,
        hingeCount = 2,
        hingePositions = [],
        hingePosition = 'left',
        doors = [],
        facadeT = 16,
        carcassT = 16,
        cabinetH = 500,
        doorType = 'overlay',
        overlayGap = 2,
        insetGap = 2,
        labels = {},
    } = config;

    if (hardwareMode !== 'hinge' || !doors.length) {
        return { sheets: [] };
    }

    /** Match dowel partId convention: lower has no zone prefix, upper uses 'upper_'. */
    const partZone = zone === 'upper' ? 'upper' : '';

    const rules = hingeRules();
    const positions = hingePositions.length
        ? hingePositions.slice(0, hingeCount)
        : suggestHingePositions(hingeCount, cabinetH);

    const doorConfig = {
        facadeT,
        carcassT,
        cabinetH,
        doorType,
        overlayGap,
        insetGap,
    };

    const sheetMap = new Map();
    const sideHoles = { left: [], right: [] };

    function getSheet(id, partName, lengthMm, widthMm, thicknessMm, layout) {
        if (!sheetMap.has(id)) {
            const sheet = {
                partId: id,
                partName,
                viewLabel: labels.facadeView || 'Front face',
                lengthMm,
                widthMm,
                thicknessMm,
                layout: layout || 'horizontal',
                holes: [],
            };
            if (zone) sheet.zone = zone;
            sheetMap.set(id, sheet);
        }
        return sheetMap.get(id);
    }

    doors.forEach((door) => {
        const facadeId = partId(partZone, door.id);
        const facadeSheet = getSheet(
            facadeId,
            door.name,
            door.height,
            door.width,
            facadeT,
            'horizontal'
        );
        const facadeHoles = addFacadeHingeHoles(door, positions, doorConfig, rules);
        facadeSheet.holes.push(...facadeHoles);

        const plateSide = door.hingeSide === 'right' ? 'right' : 'left';
        if (door.hingeSide === 'both') {
            sideHoles.left.push(...addSidePlateHoles('left', positions, rules));
            sideHoles.right.push(...addSidePlateHoles('right', positions, rules));
        } else {
            sideHoles[plateSide].push(...addSidePlateHoles(plateSide, positions, rules));
        }
    });

    const sideNames = {
        left: labels.sideLeft || 'Left side panel',
        right: labels.sideRight || 'Right side panel',
    };

    ['left', 'right'].forEach((side) => {
        if (!sideHoles[side].length) return;
        const id = partId(partZone, `side_${side}`);
        const existing = sheetMap.get(id);
        const sideSheet = existing || getSheet(
            id,
            sideNames[side],
            cabinetH,
            config.cabinetD || 450,
            carcassT,
            'side'
        );
        if (!existing) {
            sideSheet.viewLabel = labels.sideView || 'Inner face';
        }
        sideSheet.holes.push(...sideHoles[side]);
    });

    return { sheets: [...sheetMap.values()].filter((s) => s.holes.length > 0) };
}

function readRadio(doc, name, fallback) {
    return doc.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function readNum(doc, id, fallback = 0) {
    const v = parseFloat(doc.getElementById(id)?.value);
    return Number.isFinite(v) ? v : fallback;
}

function readHingePositions(doc, prefix, count, cabinetH) {
    const positions = [];
    for (let i = 1; i <= count; i += 1) {
        const v = readNum(doc, `${prefix}HingePos${i}`, 0);
        if (v > 0) positions.push(v);
    }
    return positions.length ? positions : suggestHingePositions(count, cabinetH);
}

function buildLowerDoorsFromDom(doc) {
    if (doc.getElementById('lowerNoFacade')?.checked) return [];

    const w1 = readNum(doc, 'w1');
    const h1 = readNum(doc, 'h1');
    const carcassT = readNum(doc, 'carcassThick', 16);
    const doorType = readRadio(doc, 'lowerDoorType', 'overlay');
    const overlayGap = readNum(doc, 'lowerOverlayGap', 2);
    const insetGap = readNum(doc, 'lowerInsetGap', 2);
    const split = !!doc.getElementById('lowerSplitFacade')?.checked;
    const hingePosition = readRadio(doc, 'lowerHingePosition', 'left');

    const openingW = Math.max(0, w1 - 2 * carcassT);
    const openingH = Math.max(0, h1 - 2 * carcassT);
    const baseW = doorType === 'overlay'
        ? Math.max(0, w1 - 2 * overlayGap)
        : Math.max(0, openingW - 2 * insetGap);
    const baseH = doorType === 'overlay'
        ? Math.max(0, h1 - 2 * overlayGap)
        : Math.max(0, openingH - 2 * insetGap);

    if (split) {
        const autoHalf = Math.max(50, Math.round((baseW - 3) / 2));
        const leftW = readNum(doc, 'lowerLeftDoorW', autoHalf);
        const rightW = readNum(doc, 'lowerRightDoorW', Math.max(50, baseW - leftW - 3));
        return [
            { id: 'facade_left', name: 'Facade (left)', width: leftW, height: baseH, hingeSide: 'left' },
            { id: 'facade_right', name: 'Facade (right)', width: rightW, height: baseH, hingeSide: 'right' },
        ];
    }

    let hingeSide = hingePosition === 'right' ? 'right' : hingePosition === 'both' ? 'both' : 'left';
    return [{ id: 'facade', name: 'Facade', width: baseW, height: baseH, hingeSide }];
}

function buildUpperDoorsFromDom(doc) {
    const w2 = readNum(doc, 'upper_w');
    const h2 = readNum(doc, 'upper_h');
    if (!(w2 > 0 && h2 > 0)) return [];

    const carcassT = readNum(doc, 'carcassThick', 16);
    const doorType = readRadio(doc, 'upperDoorType', 'overlay');
    const overlayGap = readNum(doc, 'upperOverlayGap', 2);
    const insetGap = readNum(doc, 'upperInsetGap', 2);
    const split = !!doc.getElementById('upperSplitFacade')?.checked;
    const hingePosition = readRadio(doc, 'upperHingePosition', 'both');

    const openingW = Math.max(0, w2 - 2 * carcassT);
    const openingH = Math.max(0, h2 - 2 * carcassT);
    const baseW = doorType === 'overlay'
        ? Math.max(0, w2 - 2 * overlayGap)
        : Math.max(0, openingW - 2 * insetGap);
    const baseH = doorType === 'overlay'
        ? Math.max(0, h2 - 2 * overlayGap)
        : Math.max(0, openingH - 2 * insetGap);

    if (split) {
        const autoHalf = Math.max(50, Math.round((baseW - 3) / 2));
        const leftW = readNum(doc, 'upperLeftDoorW', autoHalf);
        const rightW = readNum(doc, 'upperRightDoorW', Math.max(50, baseW - leftW - 3));
        return [
            { id: 'facade_left', name: 'Facade upper (left)', width: leftW, height: baseH, hingeSide: 'left' },
            { id: 'facade_right', name: 'Facade upper (right)', width: rightW, height: baseH, hingeSide: 'right' },
        ];
    }

    let hingeSide = hingePosition === 'right' ? 'right' : hingePosition === 'both' ? 'both' : 'left';
    return [{ id: 'facade', name: 'Facade upper', width: baseW, height: baseH, hingeSide }];
}

function buildZoneHingeConfigFromDom(doc, zone, labels) {
    const prefix = zone === 'upper' ? 'upper' : 'lower';
    if (zone === 'lower' && doc.getElementById('lowerNoFacade')?.checked) {
        return {
            zone: 'lower',
            hardwareMode: 'none',
            hingeCount: 0,
            hingePositions: [],
            hingePosition: 'left',
            doors: [],
            facadeT: readNum(doc, 'facadeThick', 16),
            carcassT: readNum(doc, 'carcassThick', 16),
            cabinetH: readNum(doc, 'h1', 500),
            cabinetD: readNum(doc, 'd1', 450),
            doorType: 'overlay',
            overlayGap: 2,
            insetGap: 2,
            labels: labels || {},
        };
    }
    const hardwareMode = readRadio(doc, `${prefix}HardwareMode`, zone === 'upper' ? 'gas' : 'hinge');
    const cabinetH = zone === 'upper' ? readNum(doc, 'upper_h', 400) : readNum(doc, 'h1', 500);
    const cabinetD = zone === 'upper' ? readNum(doc, 'upper_d', 450) : readNum(doc, 'd1', 450);
    const hingeCount = Math.max(2, Math.min(5, readNum(doc, `${prefix}HingeCount`, 2)));
    const hingePosition = readRadio(doc, `${prefix}HingePosition`, zone === 'upper' ? 'both' : 'left');
    const doorType = readRadio(doc, `${prefix}DoorType`, 'overlay');
    const overlayGap = readNum(doc, `${prefix}OverlayGap`, 2);
    const insetGap = readNum(doc, `${prefix}InsetGap`, 2);
    const facadeT = readNum(doc, 'facadeThick', 16);
    const carcassT = readNum(doc, 'carcassThick', 16);

    const doors = zone === 'upper' ? buildUpperDoorsFromDom(doc) : buildLowerDoorsFromDom(doc);
    const hingePositions = readHingePositions(doc, prefix, hingeCount, cabinetH);

    const zoneLabels = labels || {};
    const doorNames = {
        facade: zoneLabels.facade || (zone === 'upper' ? 'Upper facade' : 'Lower facade'),
        facade_left: zoneLabels.facadeLeft || (zone === 'upper' ? 'Upper facade (left)' : 'Lower facade (left)'),
        facade_right: zoneLabels.facadeRight || (zone === 'upper' ? 'Upper facade (right)' : 'Lower facade (right)'),
    };
    doors.forEach((d) => {
        if (doorNames[d.id]) d.name = doorNames[d.id];
    });

    return {
        zone,
        hardwareMode,
        hingeCount,
        hingePositions,
        hingePosition,
        doors,
        facadeT,
        carcassT,
        cabinetH,
        cabinetD,
        doorType,
        overlayGap,
        insetGap,
        labels: {
            sideLeft: zoneLabels.sideLeft,
            sideRight: zoneLabels.sideRight,
            facadeView: zoneLabels.facadeView,
            sideView: zoneLabels.sideView,
        },
    };
}

function buildCombinedHingeDrillingFromDom(doc, labels) {
    const lowerLabels = labels.lower || labels;
    const upperLabels = labels.upper || {};
    const results = [
        calcZoneHingeDrilling(buildZoneHingeConfigFromDom(doc, 'lower', lowerLabels)),
        calcZoneHingeDrilling(buildZoneHingeConfigFromDom(doc, 'upper', upperLabels)),
    ];
    const sheets = results.flatMap((r) => r.sheets || []);
    return { sheets };
}

function mergeDrillingResults(dowelResult, hingeResult) {
    const dowel = dowelResult || { sheets: [], dowelCount: 0 };
    const hinge = hingeResult || { sheets: [] };
    const sheetMap = new Map();

    (dowel.sheets || []).forEach((s) => {
        sheetMap.set(s.partId, { ...s, holes: [...(s.holes || [])] });
    });

    (hinge.sheets || []).forEach((s) => {
        const existing = sheetMap.get(s.partId);
        if (existing) {
            existing.holes.push(...(s.holes || []));
            if (!existing.partName && s.partName) existing.partName = s.partName;
        } else {
            sheetMap.set(s.partId, { ...s, holes: [...(s.holes || [])] });
        }
    });

    return {
        sheets: [...sheetMap.values()],
        dowelCount: dowel.dowelCount || 0,
        depths: dowel.depths,
        dowelSpec: dowel.dowelSpec,
    };
}

const api = {
    calcZoneHingeDrilling,
    buildZoneHingeConfigFromDom,
    buildCombinedHingeDrillingFromDom,
    mergeDrillingResults,
    suggestHingePositions,
    buildLowerDoorsFromDom,
    buildUpperDoorsFromDom,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.GConfigDrilling = window.GConfigDrilling || {};
    Object.assign(window.GConfigDrilling, api);
}
