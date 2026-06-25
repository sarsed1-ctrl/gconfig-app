#!/usr/bin/env node
'use strict';

const {
    getCupCenterFromEdge,
    getCupScrewOffsets,
    mapCabinetYToFacadeY,
} = require('../lib/drilling/hinge-rules.js');
const {
    calcZoneHingeDrilling,
    buildCombinedHingeDrillingFromDom,
    mergeDrillingResults,
    buildLowerDoorsFromDom,
} = require('../lib/drilling/calc-hinge-drilling.js');
const { calcVanityDowelHoles } = require('../lib/drilling/calc-vanity-dowel-holes.js');

let failed = false;

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed = true;
    } else {
        console.log('OK:', msg);
    }
}

function mockDoc(fields) {
    const els = {};
    Object.entries(fields).forEach(([id, value]) => {
        if (id.startsWith('radio:')) {
            const name = id.slice(6);
            els[`radio:${name}`] = { value, checked: true };
            return;
        }
        if (id.startsWith('check:')) {
            const cid = id.slice(6);
            els[cid] = { checked: !!value };
            return;
        }
        els[id] = { value: String(value) };
    });
    return {
        getElementById(id) {
            if (id.startsWith('radio:')) return null;
            if (id.startsWith('check:')) return els[id.slice(6)] || null;
            return els[id] || null;
        },
        querySelector(sel) {
            const m = sel.match(/^input\[name="([^"]+)"\]:checked$/);
            if (m) return els[`radio:${m[1]}`] || null;
            return null;
        },
    };
}

assert(getCupCenterFromEdge(16) === 22, 'cup center 22 mm from hinge edge');
const screws = getCupScrewOffsets();
assert(screws.length === 2 && screws[0].dx === 9.5, 'screw scheme 45/9.5 offsets');

const facadeY = mapCabinetYToFacadeY(100, {
    doorType: 'overlay',
    overlayGap: 2,
    cabinetH: 500,
    doorHeight: 496,
    carcassT: 16,
});
assert(facadeY === 98, `overlay Y map (got ${facadeY})`);

const lowerHinge = calcZoneHingeDrilling({
    zone: 'lower',
    hardwareMode: 'hinge',
    hingeCount: 2,
    hingePositions: [100, 400],
    hingePosition: 'left',
    doors: [{ id: 'facade', name: 'Facade', width: 788, height: 496, hingeSide: 'left' }],
    facadeT: 16,
    carcassT: 16,
    cabinetH: 500,
    cabinetD: 450,
    doorType: 'overlay',
    overlayGap: 2,
    insetGap: 2,
});

const facadeSheet = lowerHinge.sheets.find((s) => s.partId === 'facade');
assert(facadeSheet, 'lower facade sheet exists');
assert(facadeSheet.holes.length === 6, `facade 6 holes (2 hinges × cup+2 screws), got ${facadeSheet.holes.length}`);

const cupHoles = facadeSheet.holes.filter((h) => h.purpose === 'hinge_cup');
assert(cupHoles.length === 2, 'two cup holes');
assert(cupHoles[0].diameter === 35 && cupHoles[0].depth === 12, 'cup Ø35×12');

const sideLeft = lowerHinge.sheets.find((s) => s.partId === 'side_left');
assert(sideLeft, 'side_left sheet exists');
assert(sideLeft.holes.length === 4, `side_left 4 plate holes, got ${sideLeft.holes.length}`);

const splitHinge = calcZoneHingeDrilling({
    zone: 'lower',
    hardwareMode: 'hinge',
    hingeCount: 2,
    hingePositions: [100, 400],
    doors: [
        { id: 'facade_left', name: 'Left', width: 390, height: 496, hingeSide: 'left' },
        { id: 'facade_right', name: 'Right', width: 390, height: 496, hingeSide: 'right' },
    ],
    facadeT: 16,
    carcassT: 16,
    cabinetH: 500,
    cabinetD: 450,
    doorType: 'overlay',
    overlayGap: 2,
});

const splitSheets = splitHinge.sheets.filter((s) => /facade/.test(s.partId));
assert(splitSheets.length === 2, 'split → 2 facade sheets');

const gasMode = calcZoneHingeDrilling({
    zone: 'lower',
    hardwareMode: 'gas',
    doors: [{ id: 'facade', name: 'Facade', width: 788, height: 496, hingeSide: 'left' }],
});
assert(gasMode.sheets.length === 0, 'gas mode → no hinge sheets');

const doc = mockDoc({
    w1: 800,
    h1: 500,
    d1: 450,
    upper_w: 0,
    upper_h: 0,
    upper_d: 0,
    carcassThick: 16,
    facadeThick: 16,
    'radio:lowerHardwareMode': 'hinge',
    'radio:lowerDoorType': 'overlay',
    'radio:lowerHingePosition': 'left',
    lowerHingeCount: 2,
    lowerHingePos1: 100,
    lowerHingePos2: 400,
    lowerOverlayGap: 2,
    lowerInsetGap: 2,
    'check:lowerSplitFacade': false,
    'radio:upperHardwareMode': 'gas',
});

const fromDom = buildCombinedHingeDrillingFromDom(doc, {
    lower: { facade: 'Lower facade', sideLeft: 'Left side', sideRight: 'Right side' },
});
assert(fromDom.sheets.some((s) => s.partId === 'facade'), 'DOM build produces facade sheet');

const dowel = calcVanityDowelHoles({
    w1: 800,
    h1: 500,
    d1: 450,
    carcassT: 16,
    hasRoof: true,
    vanityShelvesH: 0,
});
const merged = mergeDrillingResults(dowel, fromDom);
const mergedSide = merged.sheets.find((s) => s.partId === 'side_left');
assert(mergedSide && mergedSide.holes.length > 4, 'merge adds hinge holes to existing side_left');

const noFacadeDoc = mockDoc({
    w1: 800,
    h1: 500,
    d1: 450,
    carcassThick: 16,
    facadeThick: 16,
    'radio:lowerHardwareMode': 'hinge',
    'check:lowerNoFacade': true,
});
const noFacadeDoors = buildLowerDoorsFromDom(noFacadeDoc);
assert(noFacadeDoors.length === 0, 'lowerNoFacade → no lower doors for hinge drilling');
const noFacadeDrill = buildCombinedHingeDrillingFromDom(noFacadeDoc, {});
const noFacadeLowerSheets = (noFacadeDrill.sheets || []).filter((s) => !s.partId.startsWith('upper_'));
assert(noFacadeLowerSheets.length === 0, 'lowerNoFacade → no lower hinge drilling sheets');

process.exit(failed ? 1 : 0);
