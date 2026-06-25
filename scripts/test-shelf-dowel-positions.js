#!/usr/bin/env node
'use strict';

const {
    calcVanityDowelHoles,
    buildVanityDrillingConfigFromDom,
} = require('../lib/drilling/calc-vanity-dowel-holes.js');
const { computeShelfBottomPositions } = require('../lib/shelf-spacing.js');

let failed = false;

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed = true;
    } else {
        console.log('OK:', msg);
    }
}

const gaps = [350, 300, 300, 300, 300];
const positions = computeShelfBottomPositions(5, 16, {
    mode: 'individual',
    uniformSpacing: 150,
    gaps,
});

assert(positions[0] === 350, `shelf1 bottom at 350 (got ${positions[0]})`);
assert(positions[1] === 666, `shelf2 bottom at 666 (got ${positions[1]})`);

const config = {
    w1: 800,
    h1: 2020,
    d1: 450,
    carcassT: 16,
    vanityShelvesH: 5,
    vanityShelvesV: 0,
    vanityShelfT: 16,
    vanitySpacingH: 150,
    vanitySpacingV: 200,
    positionsH: positions,
    positionsV: [],
};

const result = calcVanityDowelHoles(config);
const sideLeft = result.sheets.find((s) => s.partId === 'side_left');
const shelfFaceXs = [...new Set(
    (sideLeft?.holes || [])
        .map((h) => Math.round(h.x))
        .filter((x) => positions.some((pos) => Math.abs(x - (16 + pos + 8)) < 2))
)].sort((a, b) => a - b);

assert(shelfFaceXs[0] === 374, `shelf1 dowel row X=374 (got ${shelfFaceXs[0]})`);
assert(shelfFaceXs[1] === 690, `shelf2 dowel row X=690 (got ${shelfFaceXs[1]})`);
assert(shelfFaceXs.length === 5, `five shelf dowel rows (got ${shelfFaceXs.length}: ${shelfFaceXs.join(', ')})`);

function mockDoc(values, radios) {
    return {
        getElementById(id) {
            if (!(id in values)) return null;
            return { value: String(values[id]) };
        },
        querySelector(sel) {
            const checkedMatch = sel.match(/input\[name="([^"]+)"\]:checked/);
            if (checkedMatch) {
                const value = radios[checkedMatch[1]];
                return value ? { value } : null;
            }
            return null;
        },
    };
}

const fromDom = buildVanityDrillingConfigFromDom(mockDoc({
    w1: 800,
    h1: 2020,
    d1: 450,
    carcassThick: 16,
    vanityShelvesH: 5,
    vanityShelvesV: 0,
    vanityShelfThick: 16,
    vanitySpacingH: 150,
    vanitySpacingV: 200,
    vanitySpacingHGap1: 350,
    vanitySpacingHGap2: 300,
    vanitySpacingHGap3: 300,
    vanitySpacingHGap4: 300,
    vanitySpacingHGap5: 300,
}, {
    vanitySpacingModeH: 'individual',
    vanitySpacingModeV: 'uniform',
}), {});
assert(fromDom.positionsH[0] === 350, `DOM config shelf1 at 350 (got ${fromDom.positionsH[0]})`);

process.exit(failed ? 1 : 0);
