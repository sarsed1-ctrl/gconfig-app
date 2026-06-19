#!/usr/bin/env node
'use strict';

const {
    getDowelDepths,
    getLengthAxisDowelPositions,
    getRequiredDowelCount,
} = require('../lib/drilling/dowel-rules.js');
const { calcVanityDowelHoles } = require('../lib/drilling/calc-vanity-dowel-holes.js');

const config = {
    w1: 800,
    h1: 720,
    d1: 400,
    carcassT: 16,
    hasRoof: true,
    vanityShelvesH: 2,
    vanityShelvesV: 0,
    vanityShelfT: 16,
    vanitySpacingH: 150,
    vanitySpacingV: 200,
};

const depths = getDowelDepths(config.carcassT);
const depthY = getLengthAxisDowelPositions(config.d1);
const result = calcVanityDowelHoles(config);

let failed = false;

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed = true;
    } else {
        console.log('OK:', msg);
    }
}

assert(depths.faceDepth === 13 && depths.edgeDepth === 29, `t=16 depths (got face ${depths.faceDepth}, edge ${depths.edgeDepth})`);
const depths18 = getDowelDepths(18);
assert(depths18.faceDepth === 15 && depths18.edgeDepth === 27, `t=18 depths (got face ${depths18.faceDepth}, edge ${depths18.edgeDepth})`);

assert(getRequiredDowelCount(300) === 2, 'L=300 → 2 dowels');
assert(getRequiredDowelCount(301) === 3, 'L>300 → 3 dowels');
assert(getRequiredDowelCount(600) === 3, 'L=600 → 3 dowels');
assert(getRequiredDowelCount(601) === 4, 'L>600 → 4 dowels');
assert(getRequiredDowelCount(700) === 4, 'L=700 → 4 dowels');

assert(JSON.stringify(depthY) === JSON.stringify([40, 200, 360]), `L=400 positions (got ${JSON.stringify(depthY)})`);

const pos700 = getLengthAxisDowelPositions(700);
assert(pos700.length === 4, `L=700 has 4 holes (got ${pos700.length})`);
assert(pos700[0] === 40 && pos700[3] === 660, 'L=700 symmetric outers');

const sideLeft = result.sheets.find((s) => s.partId === 'side_left');
assert(sideLeft && sideLeft.holes.length === 12, `side_left 12 holes for L=400×4 rows (got ${sideLeft?.holes.length})`);

console.log('Dowels pilot:', result.dowelCount);
process.exit(failed ? 1 : 0);
