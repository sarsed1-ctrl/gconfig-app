#!/usr/bin/env node
'use strict';

const {
    calcVanityDowelHoles,
    calcBackPanelDrillDims,
} = require('../lib/drilling/calc-vanity-dowel-holes.js');

let failed = false;

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed = true;
    } else {
        console.log('OK:', msg);
    }
}

const dims = calcBackPanelDrillDims(800, 2020, 16, 'inset', 2, 2);
assert(dims.panelW === 764, `back width 764 (got ${dims.panelW})`);
assert(dims.panelH === 1984, `back height 1984 (got ${dims.panelH})`);
assert(dims.bottomOffset === 18, `bottom offset 18 (got ${dims.bottomOffset})`);

const config = {
    w1: 800,
    h1: 2020,
    d1: 450,
    carcassT: 16,
    vanityShelvesH: 0,
    vanityShelvesV: 0,
    vanityShelfT: 16,
    vanitySpacingH: 150,
    vanitySpacingV: 200,
    hasCarcassBackPanel: true,
    backPanelFitType: 'inset',
    overlayGap: 2,
    insetGap: 2,
};

const result = calcVanityDowelHoles(config);
const backSheet = result.sheets.find((s) => s.partId === 'back_edges');
const { getFaceDowelLineOffset } = require('../lib/drilling/dowel-rules.js');
const backFaceY = 450 - getFaceDowelLineOffset(16);

assert(backSheet, 'back_edges sheet exists');
assert(backSheet.lengthMm === 1984, `back edge length 1984 (got ${backSheet.lengthMm})`);
assert(backSheet.widthMm === 16, `back thickness 16 (got ${backSheet.widthMm})`);

const backEdge = backSheet.edges?.find((e) => e.key === 'edge_l');
assert(backEdge && backEdge.holes.length >= 2, `back left edge has holes (got ${backEdge?.holes.length})`);

const backHoleYs = backEdge.holes.map((h) => h.x).sort((a, b) => a - b);
const sideLeft = result.sheets.find((s) => s.partId === 'side_left');

const sideBackHoles = (sideLeft?.holes || []).filter((h) => Math.round(h.y) === Math.round(backFaceY));
const sideXs = sideBackHoles.map((h) => Math.round(h.x)).sort((a, b) => a - b);

assert(backHoleYs.length === sideXs.length, `same hole count back/side (${backHoleYs.length} vs ${sideXs.length})`);
backHoleYs.forEach((pos, i) => {
    const expectedSideX = dims.bottomOffset + pos;
    assert(Math.abs(sideXs[i] - expectedSideX) < 1, `side X ${sideXs[i]} matches back pos ${pos} + offset`);
});

const topBottomOnly = backSheet.edges?.some((e) => e.key === 'edge_t' || e.key === 'edge_b');
assert(!topBottomOnly, 'back panel uses left/right edges, not top/bottom');

process.exit(failed ? 1 : 0);
