'use strict';

/**
 * Production drawing layout — dimension chains, labels below panel.
 */
const PROD_DIM_COLOR = '#1a7a35';
const PROD_LABEL_BORDER = 'rgba(26,107,47,0.5)';
const PROD_TEXT_DARK = '#0a2e12';
const PROD_TEXT_COORD = '#1a7a35';

const PROD = {
    CANVAS_MARGIN: 20,
    DIM_ROW_GAP: 20,
    DIM_CHAIN_BASE_OFF: 14,
    DIM_MIN_GAP: 10,
    LABEL_GAP: 12,
    LEADER_MIN_DIST: 6,
    LABEL_PAD: 6,
    LABEL_AREA_MIN: 80,
    LABEL_AREA_MAX: 140,
    LABEL_PANEL_GAP: 8,
    SAFETY_PAD: 12,
    DIM_TICK_EXT: 5,
    DIM_LABEL_ABOVE: 16,
    TABLE_ROW_H: 15,
    TABLE_HEADER_H: 17,
    TABLE_PAD: 6,
    HOLE_NUM_R: 8,
};

function ps(px, ls) {
    return px * ls;
}

function mkBox(left, top, width, height) {
    return { left, top, width, height };
}

function boxRight(b) {
    return b.left + b.width;
}

function boxBottom(b) {
    return b.top + b.height;
}

function boxesIntersect(a, b, gap) {
    const g = gap || 0;
    return a.left < b.left + b.width + g
        && b.left < a.left + a.width + g
        && a.top < b.top + b.height + g
        && b.top < a.top + a.height + g;
}

function overlapsPanel(rect, panel, gap) {
    return boxesIntersect(rect, panel, gap || 0);
}

function createProductionScene(panelRect, extraForbidden) {
    return {
        panel: panelRect,
        obstacles: (extraForbidden || []).slice(),
    };
}

function sceneBlocked(scene, rect, gap) {
    const g = gap != null ? gap : ps(PROD.DIM_MIN_GAP, 1);
    if (overlapsPanel(rect, scene.panel, 0)) return true;
    return scene.obstacles.some((o) => boxesIntersect(rect, o, g));
}

function registerSceneRect(scene, rect) {
    scene.obstacles.push(rect);
}

function prodFs(px, ls) {
    return `${Math.max(1, Math.round(px * ls))}px`;
}

function formatDimMm(mm) {
    const v = Math.round(mm * 10) / 10;
    return Number.isInteger(v) ? String(v) : String(v);
}

function getMeasureCtx(ctx) {
    if (ctx) return ctx;
    if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        return c.getContext('2d');
    }
    return {
        font: '',
        measureText(text) {
            return { width: String(text).length * 6.2 };
        },
    };
}

function measureProdDimText(ctx, text, ls) {
    ctx.font = `600 ${prodFs(9, ls)} Segoe UI, Arial, sans-serif`;
    const textW = ctx.measureText(text).width;
    const h = ps(11, ls);
    return { width: textW, height: h, textW };
}

/** Horizontal dim text: centered above the green dimension line, no box. */
function paintProdDimTextH(ctx, text, centerX, dimY, ls) {
    ctx.font = `600 ${prodFs(9, ls)} Segoe UI, Arial, sans-serif`;
    ctx.fillStyle = PROD_DIM_COLOR;
    const textW = ctx.measureText(text).width;
    const textH = ps(11, ls);
    const gap = ps(3, ls);
    const baselineY = dimY - gap;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, centerX, baselineY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return mkBox(centerX - textW / 2, baselineY - textH, textW, textH);
}

/** Vertical dim text: to the left of the green dimension line, no box. */
function paintProdDimTextV(ctx, text, dimX, centerY, ls) {
    ctx.font = `600 ${prodFs(9, ls)} Segoe UI, Arial, sans-serif`;
    ctx.fillStyle = PROD_DIM_COLOR;
    const textW = ctx.measureText(text).width;
    const textH = ps(11, ls);
    const gap = ps(4, ls);
    const anchorX = dimX - gap;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, anchorX, centerY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return mkBox(anchorX - textW, centerY - textH / 2, textW, textH);
}

function drawDimArrowH(ctx, x, y, dir, ls) {
    const ah = ps(4, ls);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dir * ah, y - ah * 0.55);
    ctx.lineTo(x - dir * ah, y + ah * 0.55);
    ctx.closePath();
    ctx.fill();
}

/** Horizontal dim — label centered above the dimension line. */
function drawHorizontalDimSegment(scene, ctx, x1, x2, dimY, label, ls) {
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const ext = ps(5, ls);
    ctx.strokeStyle = PROD_DIM_COLOR;
    ctx.fillStyle = PROD_DIM_COLOR;
    ctx.lineWidth = Math.max(1, ls);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(left, dimY - ext);
    ctx.lineTo(left, dimY + ext);
    ctx.moveTo(right, dimY - ext);
    ctx.lineTo(right, dimY + ext);
    ctx.moveTo(left, dimY);
    ctx.lineTo(right, dimY);
    ctx.stroke();
    drawDimArrowH(ctx, left, dimY, 1, ls);
    drawDimArrowH(ctx, right, dimY, -1, ls);

    const centerX = (left + right) / 2;
    const textRect = paintProdDimTextH(ctx, label, centerX, dimY, ls);
    registerSceneRect(scene, textRect);
    return textRect;
}

/** Vertical dim — label to the left of the dimension line. */
function drawVerticalDimSegment(scene, ctx, dimX, y1, y2, label, ls) {
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    const ext = ps(4, ls);
    ctx.strokeStyle = PROD_DIM_COLOR;
    ctx.fillStyle = PROD_DIM_COLOR;
    ctx.lineWidth = Math.max(1, ls);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(dimX - ext, top);
    ctx.lineTo(dimX + ext, top);
    ctx.moveTo(dimX - ext, bottom);
    ctx.lineTo(dimX + ext, bottom);
    ctx.moveTo(dimX, top);
    ctx.lineTo(dimX, bottom);
    ctx.stroke();

    const centerY = (top + bottom) / 2;
    const textRect = paintProdDimTextV(ctx, label, dimX, centerY, ls);
    registerSceneRect(scene, textRect);
    return textRect;
}

function buildHorizontalChainSegments(ox, endX, holes, getPosMm, toHx, panelSpanMm) {
    if (!holes.length) return [];
    const sorted = holes
        .map((h) => ({ h, pos: getPosMm(h), hx: toHx(h) }))
        .sort((a, b) => a.pos - b.pos);
    const segments = [];
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    segments.push({ x1: ox, x2: first.hx, label: formatDimMm(first.pos) });
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        segments.push({
            x1: prev.hx,
            x2: curr.hx,
            label: formatDimMm(curr.pos - prev.pos),
        });
    }
    segments.push({
        x1: last.hx,
        x2: endX,
        label: formatDimMm(panelSpanMm - last.pos),
    });
    return segments;
}

function drawHorizontalDimChain(scene, ctx, segments, chainY, ls) {
    segments.forEach((seg) => {
        drawHorizontalDimSegment(scene, ctx, seg.x1, seg.x2, chainY, seg.label, ls);
    });
}

function drawHorizontalDimTotal(scene, ctx, x1, x2, chainY, label, ls) {
    const totalY = chainY + ps(PROD.DIM_ROW_GAP, ls);
    drawHorizontalDimSegment(scene, ctx, x1, x2, totalY, label, ls);
    return totalY;
}

function buildVerticalChainSegments(oy, endY, holes, getPosMm, toHy, panelSpanMm) {
    if (!holes.length) return [];
    const sorted = holes
        .map((h) => ({ h, pos: getPosMm(h), hy: toHy(h) }))
        .sort((a, b) => a.pos - b.pos);
    const segments = [];
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    segments.push({ y1: oy, y2: first.hy, label: formatDimMm(first.pos) });
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        segments.push({
            y1: prev.hy,
            y2: curr.hy,
            label: formatDimMm(curr.pos - prev.pos),
        });
    }
    segments.push({
        y1: last.hy,
        y2: endY,
        label: formatDimMm(panelSpanMm - last.pos),
    });
    return segments;
}

function drawVerticalDimChain(scene, ctx, segments, chainX, ls) {
    segments.forEach((seg) => {
        drawVerticalDimSegment(scene, ctx, chainX, seg.y1, seg.y2, seg.label, ls);
    });
}

function drawVerticalDimTotal(scene, ctx, y1, y2, chainX, label, ls) {
    const totalX = chainX - ps(PROD.DIM_ROW_GAP, ls);
    drawVerticalDimSegment(scene, ctx, totalX, y1, y2, label, ls);
    return totalX;
}

function measureProductionLabel(ctx, hole, index, ls) {
    const pad = ps(PROD.LABEL_PAD, ls);
    const coordText = `X=${formatDimMm(hole.x)}  Y=${formatDimMm(hole.y)}`;
    const specText = `${index + 1}. Ø${hole.diameter}×${hole.depth}`;
    ctx.font = `${prodFs(9, ls)} Consolas, "Courier New", monospace`;
    const coordW = ctx.measureText(coordText).width;
    ctx.font = `600 ${prodFs(10, ls)} Segoe UI, Arial, sans-serif`;
    const specW = ctx.measureText(specText).width;
    const w = Math.max(coordW, specW) + pad * 2;
    const line1H = ps(11, ls);
    const line2H = ps(12, ls);
    const lineGap = ps(2, ls);
    const h = line1H + lineGap + line2H + pad * 2;
    return { pad, coordText, specText, w, h, line1H, line2H, lineGap };
}

function paintProductionLabel(ctx, m, left, top, ls) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left, top, m.w, m.h);
    ctx.strokeStyle = PROD_LABEL_BORDER;
    ctx.lineWidth = Math.max(1, ls);
    ctx.strokeRect(left, top, m.w, m.h);
    const tx = left + m.pad;
    const ty = top + m.pad;
    ctx.fillStyle = PROD_TEXT_COORD;
    ctx.font = `${prodFs(9, ls)} Consolas, "Courier New", monospace`;
    ctx.fillText(m.coordText, tx, ty + m.line1H - ps(2, ls));
    ctx.fillStyle = PROD_TEXT_DARK;
    ctx.font = `600 ${prodFs(10, ls)} Segoe UI, Arial, sans-serif`;
    ctx.fillText(m.specText, tx, ty + m.line1H + m.lineGap + m.line2H - ps(2, ls));
}

function productionTableColumns(lang, ls) {
    const ru = lang === 'ru';
    return [
        { id: 'no', label: '№', w: ps(30, ls) },
        { id: 'x', label: ru ? 'X, мм' : 'X, mm', w: ps(56, ls) },
        { id: 'y', label: ru ? 'Y, мм' : 'Y, mm', w: ps(56, ls) },
        { id: 'spec', label: ru ? 'Ø×глуб' : 'Ø×depth', w: ps(62, ls) },
    ];
}

function measureProductionHoleTable(ctx, holeItems, ls, lang = 'ru') {
    const mctx = getMeasureCtx(ctx);
    const cols = productionTableColumns(lang, ls);
    const pad = ps(PROD.TABLE_PAD, ls);
    const rowH = ps(PROD.TABLE_ROW_H, ls);
    const headerH = ps(PROD.TABLE_HEADER_H, ls);
    const titleH = ps(16, ls);
    mctx.font = `600 ${prodFs(9, ls)} Segoe UI, Arial, sans-serif`;
    cols.forEach((col) => {
        col.w = Math.max(col.w, mctx.measureText(col.label).width + pad * 2);
    });
    mctx.font = `${prodFs(9, ls)} Consolas, "Courier New", monospace`;
    holeItems.forEach((it) => {
        const spec = `Ø${it.hole.diameter}×${it.hole.depth}`;
        const xText = formatDimMm(it.hole.x);
        const yText = formatDimMm(it.hole.y);
        const noText = String(it.index + 1);
        cols[0].w = Math.max(cols[0].w, mctx.measureText(noText).width + pad * 2);
        cols[1].w = Math.max(cols[1].w, mctx.measureText(xText).width + pad * 2);
        cols[2].w = Math.max(cols[2].w, mctx.measureText(yText).width + pad * 2);
        cols[3].w = Math.max(cols[3].w, mctx.measureText(spec).width + pad * 2);
    });
    const tableW = cols.reduce((s, c) => s + c.w, 0);
    const tableH = titleH + pad * 2 + headerH + holeItems.length * rowH;
    return { cols, tableW, tableH, rowH, headerH, pad, titleH };
}

function computeTableAreaHeight(holeCount, ls) {
    if (!holeCount) return ps(48, ls);
    const pad = ps(PROD.TABLE_PAD, ls);
    return ps(16, ls) + pad * 2 + ps(PROD.TABLE_HEADER_H, ls) + holeCount * ps(PROD.TABLE_ROW_H, ls);
}

function layoutProductionHoleTable(tableMeta, tableAreaTop, ox, pw) {
    const left = ox + Math.max(0, (pw - tableMeta.tableW) / 2);
    return { left, top: tableAreaTop, ...tableMeta };
}

function paintProductionHoleNumber(ctx, number, hx, hy, ls) {
    const badgeR = ps(PROD.HOLE_NUM_R, ls);
    ctx.beginPath();
    ctx.arc(hx, hy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#1a6b2f';
    ctx.lineWidth = Math.max(1.2, 1.2 * ls);
    ctx.stroke();
    ctx.fillStyle = '#0a2e12';
    ctx.font = `bold ${prodFs(9, ls)} Segoe UI, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), hx, hy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

/** Push overlapping hole badges apart while staying near each hole. */
function nudgeProductionHoleBadges(holeItems, ls) {
    const minDist = ps(PROD.HOLE_NUM_R * 2.35, ls);
    const offsets = holeItems.map(() => ({ dx: 0, dy: 0 }));
    for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < holeItems.length; i++) {
            for (let j = i + 1; j < holeItems.length; j++) {
                const ax = holeItems[i].hx + offsets[i].dx;
                const ay = holeItems[i].hy + offsets[i].dy;
                const bx = holeItems[j].hx + offsets[j].dx;
                const by = holeItems[j].hy + offsets[j].dy;
                let dx = bx - ax;
                let dy = by - ay;
                let dist = Math.hypot(dx, dy);
                if (dist >= minDist) continue;
                if (dist < 0.5) {
                    dx = 0;
                    dy = minDist;
                    dist = minDist;
                }
                const push = (minDist - dist) / 2;
                const nx = dx / dist;
                const ny = dy / dist;
                offsets[i].dx -= nx * push;
                offsets[i].dy -= ny * push;
                offsets[j].dx += nx * push;
                offsets[j].dy += ny * push;
            }
        }
    }
    return offsets;
}

function paintProductionHoleTable(ctx, holeItems, layout, ls, lang = 'ru') {
    const { left, top, cols, tableW, tableH, rowH, headerH, pad, titleH } = layout;
    const ru = lang === 'ru';
    const title = ru ? 'Координаты отверстий' : 'Hole coordinates';

    ctx.fillStyle = '#1a6b2f';
    ctx.font = `600 ${prodFs(10, ls)} Segoe UI, Arial, sans-serif`;
    ctx.fillText(title, left, top + titleH - ps(5, ls));

    const bodyTop = top + titleH + pad;
    const headerTop = bodyTop;
    const gridTop = headerTop + headerH;

    ctx.fillStyle = '#e8f5ec';
    ctx.fillRect(left, headerTop, tableW, headerH);
    ctx.strokeStyle = 'rgba(26,107,47,0.55)';
    ctx.lineWidth = Math.max(1, ls);
    ctx.strokeRect(left, top, tableW, tableH);

    let colX = left;
    ctx.fillStyle = '#0a2e12';
    ctx.font = `600 ${prodFs(9, ls)} Segoe UI, Arial, sans-serif`;
    cols.forEach((col) => {
        ctx.fillText(col.label, colX + pad, headerTop + headerH - ps(5, ls));
        colX += col.w;
    });

    const sorted = [...holeItems].sort((a, b) => a.index - b.index);
    sorted.forEach((it, rowIdx) => {
        const rowTop = gridTop + rowIdx * rowH;
        if (rowIdx % 2 === 1) {
            ctx.fillStyle = '#f8faf8';
            ctx.fillRect(left + ls, rowTop, tableW - ls * 2, rowH);
        }
        ctx.strokeStyle = 'rgba(26,107,47,0.2)';
        ctx.beginPath();
        ctx.moveTo(left, rowTop + rowH);
        ctx.lineTo(left + tableW, rowTop + rowH);
        ctx.stroke();

        const cells = [
            String(it.index + 1),
            formatDimMm(it.hole.x),
            formatDimMm(it.hole.y),
            `Ø${it.hole.diameter}×${it.hole.depth}`,
        ];
        let cx = left;
        cells.forEach((text, ci) => {
            ctx.fillStyle = ci === 0 ? '#0a2e12' : '#1a4a2a';
            ctx.font = ci === 0
                ? `bold ${prodFs(9, ls)} Segoe UI, Arial, sans-serif`
                : `${prodFs(9, ls)} Consolas, "Courier New", monospace`;
            ctx.fillText(text, cx + pad, rowTop + rowH - ps(4, ls));
            cx += cols[ci].w;
        });
    });

    colX = left;
    cols.forEach((col, i) => {
        if (i > 0) {
            ctx.strokeStyle = 'rgba(26,107,47,0.2)';
            ctx.beginPath();
            ctx.moveTo(colX, headerTop);
            ctx.lineTo(colX, top + tableH);
            ctx.stroke();
        }
        colX += col.w;
    });

    return mkBox(left, top, tableW, tableH);
}

/**
 * Layout drill labels in one row below panel; centered on hx with equal gaps, no overlap.
 * Returns placements and requiredWidth when labels exceed canvas.
 */
function layoutProductionLabelRow(ctx, holeItems, labelAreaTop, labelAreaHeight, canvasW, ls) {
    const gap = ps(PROD.LABEL_GAP, ls);
    const margin = ps(PROD.CANVAS_MARGIN, ls);
    if (!holeItems.length) {
        return { placements: [], requiredWidth: canvasW, labelFits: true };
    }

    const measured = holeItems.map((it) => ({
        ...it,
        m: measureProductionLabel(ctx, it.hole, it.index, ls),
    }));
    const maxLabelH = Math.max(...measured.map((x) => x.m.h));
    const rowTop = labelAreaTop + Math.max(0, (labelAreaHeight - maxLabelH) / 2);

    const sorted = [...measured].sort((a, b) => a.hx - b.hx);
    const lefts = sorted.map((it) => it.hx - it.m.w / 2);
    for (let i = 1; i < lefts.length; i++) {
        lefts[i] = Math.max(lefts[i], lefts[i - 1] + sorted[i - 1].m.w + gap);
    }

    const spanLeft = lefts[0];
    const spanRight = lefts[lefts.length - 1] + sorted[sorted.length - 1].m.w;
    const requiredWidth = spanRight - spanLeft + margin * 2;
    const labelFits = spanLeft >= margin && spanRight <= canvasW - margin;

    const placements = sorted.map((it, i) => {
        const left = lefts[i];
        const rect = mkBox(left, rowTop, it.m.w, it.m.h);
        return { ...it, left, top: rowTop, rect };
    });

    return { placements, requiredWidth, labelFits };
}

function drawProductionLeader(ctx, hx, hy, rect, panelRect, ls) {
    const endX = rect.left + rect.width / 2;
    const endY = rect.top;
    const minD = ps(PROD.LEADER_MIN_DIST, ls);
    if ((hx - endX) ** 2 + (hy - endY) ** 2 < minD ** 2) return;

    ctx.strokeStyle = 'rgba(26,107,47,0.45)';
    ctx.lineWidth = Math.max(1, ls);
    ctx.setLineDash([ps(3, ls), ps(3, ls)]);

    if (Math.abs(hx - endX) < ps(2, ls)) {
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    } else {
        const bendY = Math.min(hy, endY) - ps(4, ls);
        const safeBendY = Math.max(panelRect.top + ps(2, ls), bendY);
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx, safeBendY);
        ctx.lineTo(endX, safeBendY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
    ctx.setLineDash([]);
}

function drawProductionAxes(ctx, scene, ox, oy, pw, ph, ls) {
    const inset = ps(12, ls);
    const axisLen = Math.min(ps(48, ls), pw * 0.2, ph * 0.2);
    const originX = ox + inset;
    const originY = oy + ph - inset;
    const color = '#4a5d66';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, 1.2 * ls);
    ctx.setLineDash([]);

    const drawArrow = (x1, y1, x2, y2, label) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const ah = ps(5, ls);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ah * Math.cos(ang - 0.42), y2 - ah * Math.sin(ang - 0.42));
        ctx.lineTo(x2 - ah * Math.cos(ang + 0.42), y2 - ah * Math.sin(ang + 0.42));
        ctx.closePath();
        ctx.fill();
        ctx.font = `bold ${prodFs(10, ls)} Segoe UI, Arial, sans-serif`;
        const lx = x2 + ps(4, ls);
        const ly = y2 + ps(6, ls);
        ctx.fillText(label, lx, ly);
        const tw = ctx.measureText(label).width;
        registerSceneRect(scene, mkBox(lx, ly - ps(10, ls), tw + ps(4, ls), ps(12, ls)));
    };

    drawArrow(originX, originY, originX + axisLen, originY, 'Y');
    drawArrow(originX, originY, originX, originY - axisLen, 'X');
    ctx.beginPath();
    ctx.arc(originX, originY, ps(2.5, ls), 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${prodFs(8, ls)} Segoe UI, Arial, sans-serif`;
    ctx.fillStyle = '#666';
    const zeroX = originX - ps(7, ls);
    const zeroY = originY + ps(9, ls);
    ctx.fillText('0', zeroX, zeroY);
    registerSceneRect(scene, mkBox(zeroX - ps(2, ls), zeroY - ps(9, ls), ps(12, ls), ps(11, ls)));
}

function countDimRowsBelow(rows) {
    return 1;
}

function countDimRowsAbove(rows) {
    if (!rows || !rows.length) return 0;
    return rows.some((r) => r.kind === 'top' && r.holes?.length) ? 1 : 0;
}

function hasProductionBottomRow(rows) {
    return (rows || []).some((r) => r.kind === 'bottom' && r.holes?.length);
}

function hasProductionTopRow(rows) {
    return (rows || []).some((r) => r.kind === 'top' && r.holes?.length);
}

/** Width needed left of panel origin (ox) for vertical dim labels. */
function measureProductionLeftBand(ctx, ls, panelH, panelW, isEdge) {
    const mctx = getMeasureCtx(ctx);
    const dimXOff = ps(7, ls);
    const dimX2Off = ps(29, ls);
    const labelGap = ps(6, ls);
    const samples = [
        formatDimMm(panelH),
        formatDimMm(panelW),
        formatDimMm(Math.max(panelH, panelW)),
        '8',
    ];
    let maxLabelW = 0;
    samples.forEach((text) => {
        maxLabelW = Math.max(maxLabelW, measureProdDimText(mctx, text, ls).width);
    });
    const fromOx = isEdge
        ? dimXOff + ps(22, ls) + labelGap + maxLabelW
        : dimXOff + labelGap + maxLabelW;
    return fromOx + ps(PROD.SAFETY_PAD, ls);
}

function computeDimBandBelow(opts, ls) {
    const { isEdge, isHorizontal } = opts;
    const rowsBelow = Math.max(1, opts.rowsBelow || 1);
    const baseOff = ps(PROD.DIM_CHAIN_BASE_OFF, ls);
    const rowGap = ps(PROD.DIM_ROW_GAP, ls);
    const textBand = ps(18, ls);
    const ext = ps(PROD.DIM_TICK_EXT, ls);
    const safety = ps(PROD.SAFETY_PAD, ls);

    if (isHorizontal) {
        return textBand + safety;
    }

    if (isEdge) {
        return baseOff + rowGap + textBand + ext + safety;
    }

    return baseOff + rowsBelow * rowGap + textBand + ext + safety;
}

function computeDimBandAbove(opts, ls) {
    const rowsAbove = opts.rowsAbove || 0;
    if (rowsAbove <= 0) return 0;
    const baseOff = ps(PROD.DIM_CHAIN_BASE_OFF, ls);
    const rowGap = ps(PROD.DIM_ROW_GAP, ls);
    const labelBand = ps(PROD.DIM_LABEL_ABOVE, ls);
    const ext = ps(PROD.DIM_TICK_EXT, ls);
    return baseOff + rowsAbove * rowGap + labelBand + ext + ps(PROD.SAFETY_PAD, ls);
}

function drawProductionSideDimensions(ctx, scene, holes, ox, oy, pw, ph, scale, panelH, panelW, ls, groupRowsFn) {
    const dimX = ox - ps(7, ls);
    const baseOff = ps(PROD.DIM_CHAIN_BASE_OFF, ls);

    drawVerticalDimSegment(scene, ctx, dimX, oy, oy + ph, formatDimMm(panelH), ls);
    drawHorizontalDimSegment(scene, ctx, ox, ox + pw, oy + ph + baseOff, formatDimMm(panelW), ls);

    const rows = groupRowsFn(holes, panelH);
    const topRow = rows.find((r) => r.kind === 'top');
    if (topRow?.holes.length) {
        const chainY = oy - baseOff;
        const segments = buildHorizontalChainSegments(
            ox, ox + pw, topRow.holes, (h) => h.y, (h) => ox + h.y * scale, panelW
        );
        drawHorizontalDimChain(scene, ctx, segments, chainY, ls);
    }
}

function drawProductionEdgeStripDimensions(ctx, scene, holes, ox, stripOy, pw, ph, scale, panelH, panelW, ls) {
    const dimX = ox - ps(7, ls);
    const dimX2 = dimX - ps(22, ls);
    const baseOff = ps(PROD.DIM_CHAIN_BASE_OFF, ls);
    const chainY = stripOy + ph + baseOff;

    drawVerticalDimSegment(scene, ctx, dimX, stripOy, stripOy + ph, formatDimMm(panelW), ls);
    const holeY = stripOy + (panelW - 8) * scale;
    drawVerticalDimSegment(scene, ctx, dimX2, stripOy + ph, holeY, '8', ls);

    const segments = buildHorizontalChainSegments(
        ox, ox + pw, holes, (h) => h.x, (h) => ox + h.x * scale, panelH
    );
    drawHorizontalDimChain(scene, ctx, segments, chainY, ls);
    drawHorizontalDimTotal(scene, ctx, ox, ox + pw, chainY, formatDimMm(panelH), ls);
}

function computeLabelAreaHeight(ctx, holeItems, ls) {
    return computeTableAreaHeight(holeItems.length, ls);
}

function computeDimBandHeight(opts, ls) {
    return computeDimBandBelow(opts, ls) + computeDimBandAbove(opts, ls);
}

/**
 * Measure production content bands for sheet sizing.
 * @returns {{ labelAreaHeight: number, dimBandHeight: number, requiredWidth: number, requiredHeight: number }}
 */
function measureProductionContent(ctx, opts = {}) {
    const ls = opts.layoutScale || 1;
    const mctx = getMeasureCtx(ctx);
    const holes = opts.holes || [];
    const rows = opts.rows || [];
    const holeCount = opts.holeCount != null ? opts.holeCount : holes.length;
    const rowsAbove = opts.rowsAbove != null ? opts.rowsAbove : countDimRowsAbove(rows);
    const rowsBelow = opts.rowsBelow != null ? opts.rowsBelow : countDimRowsBelow(rows);
    const pw = opts.pw || 0;
    const ph = opts.ph || 0;
    const panelH = opts.panelH || ph / Math.max(opts.scale || 1, 0.001) || ph;
    const panelW = opts.panelW || pw / Math.max(opts.scale || 1, 0.001) || pw;
    const ox = opts.ox || ps(PROD.CANVAS_MARGIN, ls);
    const oy = opts.oy || 0;
    const canvasW = opts.canvasW || pw + ps(PROD.CANVAS_MARGIN, ls) * 2 + ps(80, ls);
    const isEdge = !!opts.isEdge;
    const margin = ps(PROD.CANVAS_MARGIN, ls);

    const holeItems = holes.map((hole, index) => {
        const hx = opts.mapHoleToSheet && opts.scale != null
            ? ox + opts.mapHoleToSheet(opts.sheet || { layout: isEdge ? 'edge' : 'side' }, hole).sx * opts.scale
            : ox + pw / 2;
        return { hole, index, hx };
    });

    const lang = opts.lang === 'en' ? 'en' : 'ru';
    const labelAreaHeight = computeTableAreaHeight(holeCount, ls);
    const dimBandBelow = computeDimBandBelow({ isEdge, isHorizontal: !!opts.isHorizontal, rowsBelow }, ls);
    const dimBandAbove = computeDimBandAbove({ rowsAbove }, ls);
    const dimBandHeight = dimBandBelow + dimBandAbove;
    const leftBand = measureProductionLeftBand(mctx, ls, panelH, panelW, isEdge);

    const labelAreaTop = oy + ph + ps(PROD.LABEL_PANEL_GAP, ls) + dimBandBelow;
    const tableMeta = measureProductionHoleTable(mctx, holeItems, ls, lang);
    const tableLayout = layoutProductionHoleTable(tableMeta, labelAreaTop, ox, pw);

    const labelBottom = labelAreaTop + tableLayout.tableH;
    const contentLeft = ox - leftBand;
    const contentRight = Math.max(
        ox + pw,
        tableLayout.left + tableLayout.tableW
    );

    const requiredWidth = Math.max(
        canvasW,
        tableLayout.left + tableLayout.tableW + margin,
        contentRight + margin,
        ox + pw + margin * 2
    ) + Math.max(0, margin - contentLeft);

    const requiredHeight = Math.max(
        oy + ph + dimBandBelow + ps(PROD.LABEL_PANEL_GAP, ls) + labelAreaHeight + margin,
        labelBottom + margin + ps(PROD.SAFETY_PAD, ls),
        oy + ph + dimBandBelow + dimBandAbove + ps(PROD.SAFETY_PAD, ls)
    );

    const layoutShiftX = Math.max(0, margin - contentLeft);

    return {
        labelAreaHeight,
        dimBandHeight,
        dimBandBelow,
        dimBandAbove,
        leftBand,
        layoutShiftX,
        requiredWidth,
        requiredHeight,
        holeCount,
        contentLeft,
        contentRight,
        labelBottom,
    };
}

/**
 * Draw one panel in production mode (side or single edge strip).
 */
function drawProductionPanelContent(ctx, opts) {
    const {
        sheet, ox, oy, pw, ph, scale, layoutScale, mapHoleToSheet, groupRowsFn, headerRects,
        holeIndexStart = 0, canvasW, canvasH, lang = 'ru',
    } = opts;
    const ls = layoutScale;
    const panelH = Math.max(1, sheet.lengthMm);
    const panelW = Math.max(1, sheet.widthMm);
    const isEdge = sheet.layout === 'edge';
    const panelRect = mkBox(ox, oy, pw, ph);
    const scene = createProductionScene(panelRect, headerRects);

    ctx.strokeStyle = '#222';
    ctx.lineWidth = Math.max(1, 1.5 * ls);
    ctx.strokeRect(ox, oy, pw, ph);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, pw, ph);
    ctx.strokeRect(ox, oy, pw, ph);

    const rows = !isEdge && groupRowsFn ? groupRowsFn(sheet.holes, panelH) : [];
    const rowsAbove = countDimRowsAbove(rows);
    const rowsBelow = countDimRowsBelow(rows);

    if (!isEdge) {
        drawProductionAxes(ctx, scene, ox, oy, pw, ph, ls);
    }

    if (isEdge) {
        drawProductionEdgeStripDimensions(
            ctx, scene, sheet.holes, ox, oy, pw, ph, scale, panelH, panelW, ls
        );
    } else {
        drawProductionSideDimensions(
            ctx, scene, sheet.holes, ox, oy, pw, ph, scale, panelH, panelW, ls, groupRowsFn
        );
    }

    const holeItems = sheet.holes.map((hole, index) => {
        const { sx, sy } = mapHoleToSheet(sheet, hole);
        return {
            hole,
            index: holeIndexStart + index,
            hx: ox + sx * scale,
            hy: oy + sy * scale,
        };
    });

    const badgeOffsets = nudgeProductionHoleBadges(holeItems, ls);
    holeItems.forEach((h, i) => {
        const r = Math.max(ps(3, ls), (h.hole.diameter / 2) * scale * 0.35);
        ctx.beginPath();
        ctx.arc(h.hx, h.hy, r, 0, Math.PI * 2);
        ctx.fillStyle = h.hole.type === 'face' ? '#1a6b2f' : '#c45c00';
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = Math.max(1, ls);
        ctx.stroke();
        const off = badgeOffsets[i];
        paintProductionHoleNumber(ctx, h.index + 1, h.hx + off.dx, h.hy + off.dy, ls);
    });

    const contentMeasure = measureProductionContent(ctx, {
        layoutScale: ls,
        sheet,
        holes: sheet.holes,
        holeCount: sheet.holes.length,
        pw,
        ph,
        panelH,
        panelW,
        ox,
        oy,
        scale,
        mapHoleToSheet,
        isEdge,
        rows,
        rowsAbove,
        lang,
        canvasW: canvasW || pw + ps(PROD.CANVAS_MARGIN, ls) * 2,
    });

    const tableAreaTop = oy + ph + ps(PROD.LABEL_PANEL_GAP, ls) + contentMeasure.dimBandBelow;
    const tableMeta = measureProductionHoleTable(ctx, holeItems, ls, lang);
    const tableLayout = layoutProductionHoleTable(tableMeta, tableAreaTop, ox, pw);
    const tableRect = paintProductionHoleTable(ctx, holeItems, tableLayout, ls, lang);
    registerSceneRect(scene, tableRect);

    return {
        scene,
        tableLayout,
        contentMeasure,
        canvasW,
        canvasH,
    };
}

/**
 * Horizontal panel (facade): numbered holes on drawing + coordinate table below.
 */
function drawProductionHorizontalPanelContent(ctx, opts) {
    const {
        sheet,
        ox,
        oy,
        pw,
        ph,
        scale,
        layoutScale: ls,
        mapHoleToSheet,
        lang = 'ru',
        getHoleFillColor,
        getHoleRadius,
        holeIndexStart = 0,
    } = opts;

    const panelH = Math.max(1, sheet.lengthMm);
    const panelW = Math.max(1, sheet.widthMm);

    ctx.strokeStyle = '#222';
    ctx.lineWidth = Math.max(1, 1.5 * ls);
    ctx.strokeRect(ox, oy, pw, ph);
    ctx.fillStyle = '#f8faf8';
    ctx.fillRect(ox, oy, pw, ph);
    ctx.strokeRect(ox, oy, pw, ph);

    ctx.fillStyle = '#444';
    ctx.font = `${prodFs(10, ls)} Segoe UI, Arial, sans-serif`;
    ctx.fillText(`X ${Math.round(panelH)}`, ox + pw / 2 - ps(14, ls), oy + ph + ps(16, ls));
    ctx.save();
    ctx.translate(ox - ps(10, ls), oy + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`Y ${Math.round(panelW)}`, 0, 0);
    ctx.restore();

    const holeItems = (sheet.holes || []).map((hole, index) => {
        const { sx, sy } = mapHoleToSheet(sheet, hole);
        return {
            hole,
            index: holeIndexStart + index,
            hx: ox + sx * scale,
            hy: oy + sy * scale,
        };
    });

    const horizBadgeOffsets = nudgeProductionHoleBadges(holeItems, ls);
    holeItems.forEach((h, i) => {
        const r = getHoleRadius
            ? getHoleRadius(h.hole, scale, ls)
            : Math.max(ps(3, ls), (h.hole.diameter / 2) * scale * (h.hole.diameter >= 30 ? 0.5 : 0.35));
        ctx.beginPath();
        ctx.arc(h.hx, h.hy, r, 0, Math.PI * 2);
        ctx.fillStyle = getHoleFillColor
            ? getHoleFillColor(h.hole)
            : (h.hole.type === 'face' ? '#1a6b2f' : '#c45c00');
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = Math.max(1, ls);
        ctx.stroke();
        const off = horizBadgeOffsets[i];
        paintProductionHoleNumber(ctx, h.index + 1, h.hx + off.dx, h.hy + off.dy, ls);
    });

    const contentMeasure = measureProductionContent(ctx, {
        layoutScale: ls,
        sheet,
        holes: sheet.holes,
        holeCount: sheet.holes?.length || 0,
        pw,
        ph,
        panelH,
        panelW,
        ox,
        oy,
        scale,
        mapHoleToSheet,
        isEdge: false,
        isHorizontal: true,
        rows: [],
        rowsAbove: 0,
        rowsBelow: 0,
        lang,
        canvasW: opts.canvasW || pw + ps(PROD.CANVAS_MARGIN, ls) * 2,
    });

    const tableAreaTop = oy + ph + ps(PROD.LABEL_PANEL_GAP, ls) + contentMeasure.dimBandBelow;
    const tableMeta = measureProductionHoleTable(ctx, holeItems, ls, lang);
    const tableLayout = layoutProductionHoleTable(tableMeta, tableAreaTop, ox, pw);
    paintProductionHoleTable(ctx, holeItems, tableLayout, ls, lang);

    return {
        tableLayout,
        contentMeasure,
    };
}

function validateProductionScene(scene, gap) {
    const g = gap || 0;
    let overlapCount = 0;
    const all = [scene.panel, ...scene.obstacles];
    for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
            if (all[i] === scene.panel && all[j] === scene.panel) continue;
            if (boxesIntersect(all[i], all[j], g)) overlapCount++;
        }
    }
    return overlapCount;
}

function productionExtraMargins(layoutScale, holeCount = 4, panelMm = {}, rows = []) {
    const ls = layoutScale;
    const panelH = panelMm.height || 500;
    const panelW = panelMm.width || 450;
    const mctx = getMeasureCtx(null);
    const leftBand = measureProductionLeftBand(mctx, ls, panelH, panelW, false);
    const rowsAbove = countDimRowsAbove(rows);
    const rowsBelow = countDimRowsBelow(rows);
    const m = measureProductionContent(null, {
        layoutScale: ls,
        holeCount,
        rows,
        rowsAbove,
        rowsBelow,
        isEdge: false,
        pw: 200 * ls,
        ph: 180 * ls,
        panelH,
        panelW,
    });
    return {
        pad: ps(PROD.CANVAS_MARGIN, ls) + leftBand,
        topReserve: ps(PROD.CANVAS_MARGIN, ls) + m.dimBandAbove + ps(24, ls),
        bottomBand: m.dimBandBelow + m.labelAreaHeight + ps(PROD.LABEL_PANEL_GAP, ls) + ps(PROD.CANVAS_MARGIN, ls),
        sideBand: leftBand,
        dimBandHeight: m.dimBandHeight,
        dimBandBelow: m.dimBandBelow,
        dimBandAbove: m.dimBandAbove,
        labelAreaHeight: m.labelAreaHeight,
        leftBand,
        rowsAbove,
        rowsBelow,
    };
}

/**
 * Fit panel scale so dimensions + labels stay inside the canvas frame.
 */
function computeProductionPanelScale(opts = {}) {
    const ls = opts.layoutScale || 1;
    const drawW = Math.max(1, opts.drawW || 1);
    const drawH = Math.max(1, opts.drawH || 1);
    const panelH = opts.panelH || drawH;
    const panelW = opts.panelW || drawW;
    const rows = opts.rows || [];
    const holeCount = opts.holeCount || 0;
    const canvasW = opts.canvasW || DEFAULT_PROD_CANVAS_W * ls;
    const canvasH = opts.canvasH || DEFAULT_PROD_CANVAS_H * ls;
    const headerBlock = opts.headerBlock || 44 * ls;
    const bottomPad = opts.bottomPad || 10 * ls;

    const margins = productionExtraMargins(ls, holeCount, { height: panelH, width: panelW }, rows);
    const fixedH = headerBlock + margins.topReserve + margins.dimBandBelow
        + margins.labelAreaHeight + bottomPad;
    const availableH = Math.max(60 * ls, canvasH - fixedH);
    const availableW = Math.max(60 * ls, canvasW - margins.pad * 2);

    const maxPanelH = opts.pdfExport === true
        ? availableH
        : 250 * ls;
    const scale = Math.min(
        availableW / drawW,
        availableH / drawH,
        maxPanelH / drawH,
        (canvasW - margins.pad) / drawW
    );
    return Math.max(scale, 0.06 * ls);
}

const DEFAULT_PROD_CANVAS_W = 520;
const DEFAULT_PROD_CANVAS_H = 920;

const productionApi = {
    PROD,
    drawProductionPanelContent,
    drawProductionHorizontalPanelContent,
    measureProductionContent,
    measureProductionLeftBand,
    productionExtraMargins,
    computeProductionPanelScale,
    computeDimBandBelow,
    computeDimBandAbove,
    countDimRowsAbove,
    countDimRowsBelow,
    hasProductionBottomRow,
    hasProductionTopRow,
    createProductionScene,
    validateProductionScene,
    drawProductionSideDimensions,
    drawProductionEdgeStripDimensions,
    paintProductionHoleNumber,
    paintProductionHoleTable,
    measureProductionHoleTable,
    mkBox,
    boxesIntersect,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = productionApi;
}
if (typeof window !== 'undefined') {
    window.GConfigProductionLayout = productionApi;
}
