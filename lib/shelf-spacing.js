'use strict';

/**
 * Shelf bottom positions (mm from inner bottom / inner left).
 * Uniform legacy: bottom[i] = spacing * (i + 1).
 * Individual: gap[i] = clear space before shelf i (floor→shelf1, then between shelves).
 */
function computeShelfBottomPositions(count, shelfThickMm, options) {
    const n = Math.max(0, Math.min(5, parseInt(count, 10) || 0));
    const thick = Math.max(1, shelfThickMm || 16);
    const mode = options?.mode === 'individual' ? 'individual' : 'uniform';
    const uniform = Math.max(1, parseInt(options?.uniformSpacing, 10) || 150);
    const gaps = Array.isArray(options?.gaps) ? options.gaps : [];

    const positions = [];
    for (let i = 0; i < n; i += 1) {
        if (mode === 'individual') {
            const gap = parseInt(gaps[i], 10);
            const g = Number.isFinite(gap) && gap > 0 ? gap : uniform;
            if (i === 0) positions.push(g);
            else positions.push(positions[i - 1] + thick + g);
        } else {
            positions.push(uniform * (i + 1));
        }
    }
    return positions;
}

function readGapValues(doc, prefix, count, fallback) {
    const gaps = [];
    const n = Math.max(0, Math.min(5, parseInt(count, 10) || 0));
    for (let i = 1; i <= n; i += 1) {
        const el = doc.getElementById(`${prefix}${i}`);
        const v = parseInt(el?.value, 10);
        gaps.push(Number.isFinite(v) && v > 0 ? v : fallback);
    }
    return gaps;
}

function getShelfOpenIntervalsFromPositions(totalInnerMm, bottomPositions, shelfThickMm) {
    const total = Math.max(0, totalInnerMm);
    if (total <= 0) return [];
    if (!bottomPositions?.length) return [{ start: 0, end: total }];

    const thick = Math.max(1, shelfThickMm || 16);
    const blocks = bottomPositions.map((start) => {
        const s = Math.min(total, Math.max(0, start));
        return { start: s, end: Math.min(total, s + thick) };
    }).filter((b) => b.end > b.start);
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

const api = {
    computeShelfBottomPositions,
    readGapValues,
    getShelfOpenIntervalsFromPositions,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.GConfigShelfSpacing = api;
}
