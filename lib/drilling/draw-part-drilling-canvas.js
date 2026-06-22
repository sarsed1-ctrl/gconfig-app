'use strict';

let _productionLayout;
function getProductionLayout() {
    if (_productionLayout) return _productionLayout;
    if (typeof window !== 'undefined' && window.GConfigProductionLayout) {
        _productionLayout = window.GConfigProductionLayout;
        return _productionLayout;
    }
    try {
        _productionLayout = require('./production-layout.js');
        return _productionLayout;
    } catch (e) {
        return null;
    }
}

const DEFAULT_SHEET_WIDTH = 520;
const EXPORT_SHEET_WIDTH = 1040;
const EXPORT_PIXEL_RATIO = 2;
const MAX_CANVAS_PIXEL_DIM = 8192;
const MAX_CANVAS_PIXELS = 12 * 1000 * 1000;

function mapHoleToSheet(sheet, hole) {
    const panelH = Math.max(1, sheet.lengthMm);
    const panelW = Math.max(1, sheet.widthMm);
    const isSide = sheet.layout === 'side' || /^side_/.test(sheet.partId || '');
    if (isSide) {
        return { sx: hole.y, sy: panelH - hole.x };
    }
    return { sx: hole.x, sy: hole.y };
}

function resolveDrillingRenderOpts(opts = {}) {
    const exportMode = opts.export === true;
    const pixelRatio = Math.max(1, opts.pixelRatio || (exportMode ? EXPORT_PIXEL_RATIO : 1));
    const layoutScale = opts.layoutScale != null
        ? opts.layoutScale
        : exportMode
            ? EXPORT_SHEET_WIDTH / DEFAULT_SHEET_WIDTH
            : (opts.width || DEFAULT_SHEET_WIDTH) / DEFAULT_SHEET_WIDTH;
    const width = opts.width || (exportMode ? EXPORT_SHEET_WIDTH : DEFAULT_SHEET_WIDTH);
    return { exportMode, width, pixelRatio, layoutScale };
}

function fs(px, layoutScale) {
    return `${Math.max(1, Math.round(px * layoutScale))}px`;
}

function formatDimMm(mm) {
    const v = Math.round(mm * 10) / 10;
    return Number.isInteger(v) ? String(v) : String(v);
}

function holeVisualRadius(hole, scale, layoutScale) {
    const ls = layoutScale;
    const sizeFactor = hole.diameter >= 30 ? 0.5 : 0.35;
    return Math.max(3 * ls, (hole.diameter / 2) * scale * sizeFactor);
}

function holeFillColor(hole) {
    if (hole.purpose === 'hinge_cup') return '#1a3d6b';
    if (hole.purpose === 'hinge_cup_screw' || hole.purpose === 'hinge_plate') return '#c45c00';
    return hole.type === 'face' ? '#1a6b2f' : '#c45c00';
}

/** Nearest vertical + horizontal edge distances for dimension lines. */
function pickHoleEdgeDimensions(sheet, hole) {
    const panelH = Math.max(1, sheet.lengthMm);
    const panelW = Math.max(1, sheet.widthMm);
    const isSide = sheet.layout === 'side' || /^side_/.test(sheet.partId || '');

    if (isSide) {
        const fromBottom = hole.x;
        const fromTop = panelH - hole.x;
        const fromFront = hole.y;
        const fromBack = panelW - hole.y;
        const vertical = fromTop <= fromBottom
            ? { edge: 'top', dist: fromTop }
            : { edge: 'bottom', dist: fromBottom };
        const horizontal = fromFront <= fromBack
            ? { edge: 'left', dist: fromFront }
            : { edge: 'right', dist: fromBack };
        return [vertical, horizontal];
    }

    if (sheet.layout === 'edge' || sheet.layout === 'edge_pair') {
        const fromFront = hole.x;
        const fromBack = panelH - hole.x;
        const fromBottom = hole.y;
        const fromTop = panelW - hole.y;
        const horizontal = fromFront <= fromBack
            ? { edge: 'left', dist: fromFront }
            : { edge: 'right', dist: fromBack };
        const vertical = fromBottom <= fromTop
            ? { edge: 'bottom', dist: fromBottom }
            : { edge: 'top', dist: fromTop };
        return [vertical, horizontal];
    }

    const fromLeft = hole.x;
    const fromRight = panelH - hole.x;
    const fromFront = hole.y;
    const fromBack = panelW - hole.y;
    const horizontal = fromLeft <= fromRight
        ? { edge: 'left', dist: fromLeft }
        : { edge: 'right', dist: fromRight };
    const vertical = fromFront <= fromBack
        ? { edge: 'top', dist: fromFront }
        : { edge: 'bottom', dist: fromBack };
    return [vertical, horizontal];
}

const DIM_COLOR = '#1a7a35';

function dimLabelText(sheet, dim, dist) {
    const v = formatDimMm(dist);
    const isSide = sheet.layout === 'side' || /^side_/.test(sheet.partId || '');
    if (isSide) {
        if (dim.edge === 'top' || dim.edge === 'bottom') return `X ${v}`;
        return `Y ${v}`;
    }
    if (dim.edge === 'left' || dim.edge === 'right') return `X ${v}`;
    return `Y ${v}`;
}

function drawDimLabel(ctx, text, x, y, layoutScale, align = 'center') {
    const box = measureDimLabelBox(ctx, text, x, y, layoutScale, align);
    paintDimLabelBox(ctx, text, box, layoutScale);
    return box;
}

function measureDimLabelBox(ctx, text, x, y, layoutScale, align = 'center') {
    const pad = 3 * layoutScale;
    const ls = layoutScale;
    ctx.font = `600 ${fs(9, layoutScale)} Segoe UI, Arial, sans-serif`;
    const tw = ctx.measureText(text).width;
    let tx = x;
    if (align === 'center') tx = x - tw / 2;
    else if (align === 'right') tx = x - tw;
    const ty = y;
    return {
        x: tx,
        y: ty,
        w: tw + pad * 2,
        h: 12 * ls,
        align,
        rect: { left: tx - pad, top: ty - 9 * ls, width: tw + pad * 2, height: 12 * ls },
    };
}

function paintDimLabelBox(ctx, text, box, layoutScale) {
    const pad = 3 * layoutScale;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(box.rect.left, box.rect.top, box.rect.width, box.rect.height);
    ctx.strokeStyle = 'rgba(26,122,53,0.45)';
    ctx.lineWidth = Math.max(1, 0.8 * layoutScale);
    ctx.strokeRect(box.rect.left, box.rect.top, box.rect.width, box.rect.height);
    ctx.fillStyle = DIM_COLOR;
    ctx.fillText(text, box.x, box.y);
}

function createDimLabelRegistry(forbiddenRects) {
    return { placed: [], forbidden: forbiddenRects || [] };
}

function dimLabelHitsRegistry(registry, rect, gap) {
    const g = gap || 0;
    const list = registry.placed.concat(registry.forbidden);
    return list.some((r) => calloutRectsOverlap(rect, r, g));
}

function registerDimLabel(registry, rect) {
    registry.placed.push(rect);
}

/** Place horizontal dim text: same side of line, no overlap with prior labels or callouts. */
function placeHorizontalDimLabel(registry, ctx, text, segLeft, segRight, dimY, labelAbove, layoutScale) {
    const ls = layoutScale;
    const gap = 2 * ls;
    const pad = 3 * ls;
    const boxH = 12 * ls;
    const baseOff = labelAbove ? 7 * ls : 11 * ls;
    const tierStep = 14 * ls;
    const maxTiers = 6;

    ctx.font = `600 ${fs(9, layoutScale)} Segoe UI, Arial, sans-serif`;
    const tw = ctx.measureText(text).width;
    const fullW = tw + pad * 2;
    const centerX = (segLeft + segRight) / 2;
    const xStep = Math.max(fullW * 0.3, 10 * ls);

    for (let tier = 0; tier <= maxTiers; tier++) {
        const baselineY = labelAbove
            ? dimY - baseOff - tier * tierStep
            : dimY + baseOff + tier * tierStep;
        const boxTop = baselineY - 9 * ls;
        const xCandidates = [centerX];
        for (let n = 1; n <= 8; n++) {
            xCandidates.push(centerX - n * xStep, centerX + n * xStep);
        }
        for (const cx of xCandidates) {
            let left = cx - fullW / 2;
            const inset = 2 * ls;
            if (left < segLeft + inset) left = segLeft + inset;
            if (left + fullW > segRight - inset) left = Math.max(segLeft + inset, segRight - inset - fullW);
            const rect = { left, top: boxTop, width: fullW, height: boxH };
            if (!dimLabelHitsRegistry(registry, rect, gap)) {
                const box = {
                    x: left + pad,
                    y: baselineY,
                    w: fullW,
                    h: boxH,
                    align: 'left',
                    rect,
                };
                registerDimLabel(registry, rect);
                return box;
            }
        }
    }

    const baselineY = labelAbove ? dimY - baseOff : dimY + baseOff;
    const left = centerX - fullW / 2;
    const rect = { left, top: baselineY - 9 * ls, width: fullW, height: boxH };
    const box = { x: left + pad, y: baselineY, w: fullW, h: boxH, align: 'left', rect };
    registerDimLabel(registry, rect);
    return box;
}

/** Place vertical dim text to the left of the line without overlap. */
function placeVerticalDimLabel(registry, ctx, text, dimX, y1, y2, layoutScale, baseOffsetLs) {
    const ls = layoutScale;
    const gap = 2 * ls;
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    const centerY = (top + bottom) / 2 + 3 * ls;
    const tierStep = 8 * ls;
    const maxTiers = 5;

    for (let tier = 0; tier <= maxTiers; tier++) {
        const labelX = dimX - (baseOffsetLs + tier * tierStep) * ls;
        const box = measureDimLabelBox(ctx, text, labelX, centerY, layoutScale, 'right');
        if (!dimLabelHitsRegistry(registry, box.rect, gap)) {
            registerDimLabel(registry, box.rect);
            return box;
        }
    }

    const box = measureDimLabelBox(ctx, text, dimX - baseOffsetLs * ls, centerY, layoutScale, 'right');
    registerDimLabel(registry, box.rect);
    return box;
}

function drawDimLeader(ctx, labelBox, targetX, targetY, layoutScale) {
    const ls = layoutScale;
    let lx;
    if (labelBox.align === 'right') lx = labelBox.x + labelBox.w;
    else if (labelBox.align === 'left') lx = labelBox.x;
    else lx = labelBox.x + labelBox.w / 2;
    const ly = labelBox.y - 4 * ls;
    ctx.strokeStyle = 'rgba(26,122,53,0.55)';
    ctx.lineWidth = Math.max(1, ls);
    ctx.setLineDash([3 * ls, 3 * ls]);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawAxisArrow(ctx, x1, y1, x2, y2, label, layoutScale) {
    const ls = layoutScale;
    const color = '#4a5d66';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, 1.2 * ls);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ah = 5 * ls;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ah * Math.cos(ang - 0.42), y2 - ah * Math.sin(ang - 0.42));
    ctx.lineTo(x2 - ah * Math.cos(ang + 0.42), y2 - ah * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.font = `bold ${fs(10, layoutScale)} Segoe UI, Arial, sans-serif`;
    const lx = x2 + (x2 >= x1 ? 4 * ls : -4 * ls);
    const ly = y2 + (y2 <= y1 ? -4 * ls : 6 * ls);
    ctx.fillText(label, lx, ly);
}

/** Coordinate axes inside panel (origin bottom-front for side panels). */
function drawPanelAxes(ctx, bounds, sheet, layoutScale) {
    const { ox, oy, pw, ph } = bounds;
    const ls = layoutScale;
    const isSide = sheet.layout === 'side' || /^side_/.test(sheet.partId || '');
    const isEdge = sheet.layout === 'edge';
    const inset = 12 * ls;
    const axisLen = Math.min(48 * ls, pw * 0.2, ph * 0.2);
    const originX = ox + inset;
    const originY = oy + ph - inset;

    if (isSide) {
        drawAxisArrow(ctx, originX, originY, originX + axisLen, originY, 'Y', layoutScale);
        drawAxisArrow(ctx, originX, originY, originX, originY - axisLen, 'X', layoutScale);
        ctx.fillStyle = '#4a5d66';
        ctx.beginPath();
        ctx.arc(originX, originY, 2.5 * ls, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${fs(8, layoutScale)} Segoe UI, Arial, sans-serif`;
        ctx.fillStyle = '#666';
        ctx.fillText('0', originX - 7 * ls, originY + 9 * ls);
        return;
    }

    if (isEdge) {
        const axisGap = 24 * layoutScale;
        const xLen = Math.min(70 * layoutScale, pw * 0.12);
        const yLen = 32 * layoutScale;
        const edgeOriginX = ox - 30 * layoutScale;
        const edgeOriginY = oy + ph + axisGap;
        const panelCornerX = ox;
        const panelCornerY = oy + ph;
        drawAxisArrow(ctx, edgeOriginX, edgeOriginY, edgeOriginX + xLen, edgeOriginY, 'X', layoutScale);
        drawAxisArrow(ctx, edgeOriginX, edgeOriginY, edgeOriginX, edgeOriginY - yLen, 'Y', layoutScale);
        ctx.strokeStyle = 'rgba(74,93,102,0.35)';
        ctx.lineWidth = Math.max(1, layoutScale);
        ctx.setLineDash([3 * layoutScale, 3 * layoutScale]);
        ctx.beginPath();
        ctx.moveTo(edgeOriginX, edgeOriginY);
        ctx.lineTo(panelCornerX, panelCornerY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#4a5d66';
        ctx.beginPath();
        ctx.arc(edgeOriginX, edgeOriginY, 2.5 * layoutScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${fs(8, layoutScale)} Segoe UI, Arial, sans-serif`;
        ctx.fillStyle = '#666';
        ctx.fillText('0', edgeOriginX - 7 * layoutScale, edgeOriginY + 9 * layoutScale);
    }
}

function drawEdgeToHoleDimension(ctx, hx, hy, bounds, dim, layoutScale, sheet) {
    const { ox, oy, pw, ph } = bounds;
    const cx = ox + pw / 2;
    const cy = oy + ph / 2;
    const holeLeft = hx < cx;
    const holeTop = hy < cy;
    const ls = layoutScale;
    const lw = Math.max(1, 1.2 * ls);
    const tick = 4 * ls;
    const dash = [5 * ls, 4 * ls];
    const gap = 22 * ls;
    const gap2 = 38 * ls;
    const label = dimLabelText(sheet, dim, dim.dist);

    ctx.strokeStyle = DIM_COLOR;
    ctx.fillStyle = DIM_COLOR;
    ctx.lineWidth = lw;

    let x1; let y1; let x2; let y2;
    let labelX; let labelY; let labelAlign = 'center';
    let midX; let midY;

    switch (dim.edge) {
        case 'top':
            x1 = hx; y1 = oy; x2 = hx; y2 = hy;
            labelX = holeLeft ? ox - gap : ox + pw + gap;
            labelY = (y1 + y2) / 2 + 3 * ls;
            labelAlign = holeLeft ? 'right' : 'left';
            midX = hx; midY = (y1 + y2) / 2;
            break;
        case 'bottom':
            x1 = hx; y1 = oy + ph; x2 = hx; y2 = hy;
            labelX = holeLeft ? ox - gap : ox + pw + gap;
            labelY = (y1 + y2) / 2 + 3 * ls;
            labelAlign = holeLeft ? 'right' : 'left';
            midX = hx; midY = (y1 + y2) / 2;
            break;
        case 'left':
            x1 = ox; y1 = hy; x2 = hx; y2 = hy;
            labelX = (x1 + x2) / 2;
            if (holeTop) {
                labelY = Math.min(hy + 16 * ls, oy + ph - 6 * ls);
            } else {
                labelY = holeLeft ? oy + ph + gap : oy + ph + gap2;
            }
            midX = (x1 + x2) / 2; midY = hy;
            break;
        case 'right':
            x1 = ox + pw; y1 = hy; x2 = hx; y2 = hy;
            labelX = (x1 + x2) / 2;
            if (holeTop) {
                labelY = Math.min(hy + 16 * ls, oy + ph - 6 * ls);
            } else {
                labelY = holeLeft ? oy + ph + gap2 : oy + ph + gap;
            }
            midX = (x1 + x2) / 2; midY = hy;
            break;
        default:
            return;
    }

    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    if (dim.edge === 'top' || dim.edge === 'bottom') {
        ctx.moveTo(x1 - tick, y1);
        ctx.lineTo(x1 + tick, y1);
        ctx.moveTo(x2 - tick, y2);
        ctx.lineTo(x2 + tick, y2);
    } else {
        ctx.moveTo(x1, y1 - tick);
        ctx.lineTo(x1, y1 + tick);
        ctx.moveTo(x2, y2 - tick);
        ctx.lineTo(x2, y2 + tick);
    }
    ctx.stroke();

    const labelBox = drawDimLabel(ctx, label, labelX, labelY, layoutScale, labelAlign);
    drawDimLeader(ctx, labelBox, midX, midY, layoutScale);
}

function holeCoordText(hole) {
    const x = formatDimMm(hole.x);
    const y = formatDimMm(hole.y);
    return `(X=${x} Y=${y})`;
}

function calloutRectsOverlap(a, b, gap) {
    const g = gap || 0;
    return a.left < b.left + b.width + g
        && b.left < a.left + a.width + g
        && a.top < b.top + b.height + g
        && b.top < a.top + a.height + g;
}

function overlapsAnyCallout(rect, placed, gap, forbidden) {
    const list = (forbidden || []).concat(placed || []);
    return list.some((r) => calloutRectsOverlap(rect, r, gap));
}

function measureHoleCalloutBox(ctx, hole, index, layoutScale) {
    const ls = layoutScale;
    const pad = 3 * ls;
    const coordText = holeCoordText(hole);
    const specText = `${index + 1}. Ø${hole.diameter}×${hole.depth}`;
    ctx.font = `600 ${fs(11, layoutScale)} Segoe UI, Arial, sans-serif`;
    const specW = ctx.measureText(specText).width;
    ctx.font = `${fs(9, layoutScale)} Consolas, "Courier New", monospace`;
    const coordW = ctx.measureText(coordText).width;
    const boxW = Math.max(specW, coordW);
    const coordH = 11 * ls;
    const specH = 12 * ls;
    const lineGap = 2 * ls;
    const boxH = coordH + lineGap + specH;
    return {
        pad,
        coordText,
        specText,
        boxW,
        boxH,
        coordH,
        specH,
        lineGap,
        fullW: boxW + pad * 2,
        fullH: boxH + pad * 2,
    };
}

function clampCalloutTop(candidateTop, fullH, bounds, minTop, maxTop, layoutScale) {
    const ls = layoutScale;
    const { oy } = bounds;
    const abovePanel = candidateTop + fullH <= oy + 3 * ls;
    if (abovePanel) {
        return Math.max(2 * ls, Math.min(candidateTop, maxTop));
    }
    return Math.max(minTop, Math.min(candidateTop, maxTop));
}

function buildSheetForbiddenRects(bounds, layoutScale, sheetLayout) {
    const ls = layoutScale;
    const { ox, oy, pw, ph, canvasW, headerH } = bounds;
    const rects = [
        { left: 0, top: 0, width: canvasW || 2000, height: (headerH || 0) + 4 * ls },
    ];
    const isEdge = sheetLayout === 'edge' || sheetLayout === 'edge_pair';
    const isSide = sheetLayout === 'side';
    const dimBandH = (isEdge || isSide) ? 44 * ls : 22 * ls;
    rects.push({
        left: Math.max(0, ox - 16 * ls),
        top: oy + ph,
        width: pw + 32 * ls,
        height: dimBandH,
    });
    return rects;
}

/** Per-strip zones that callouts must not cover (section label above, dim text below). */
function getStripForbiddenRects(ox, stripOy, pw, ph, layoutScale, sectionLabelH) {
    const ls = layoutScale;
    const rects = [];
    if (sectionLabelH > 0) {
        rects.push({
            left: Math.max(0, ox - 8 * ls),
            top: stripOy - sectionLabelH,
            width: 140 * ls,
            height: sectionLabelH + 2 * ls,
        });
    }
    rects.push({
        left: Math.max(0, ox - 4 * ls),
        top: stripOy,
        width: pw + 8 * ls,
        height: ph + 2 * ls,
    });
    rects.push({
        left: Math.max(0, ox - 16 * ls),
        top: stripOy + ph + 10 * ls,
        width: pw + 32 * ls,
        height: 32 * ls,
    });
    return rects;
}

/** Y for edge-strip callout row — gap below bar, above small offset dims. */
function edgeStripLabelRowY(bounds, layoutScale) {
    return bounds.oy + bounds.ph + 2 * layoutScale;
}

function computeEdgeCalloutSlots(holes, lengthMm) {
    if (!holes?.length) return [];
    if (holes.length === 1) return ['center'];
    const sorted = holes.map((h, i) => ({ i, x: h.x })).sort((a, b) => a.x - b.x);
    const slots = new Array(holes.length);
    const minX = sorted[0].x;
    const maxX = sorted[sorted.length - 1].x;
    const tol = Math.max(12, lengthMm * 0.05);
    sorted.forEach((item, rank) => {
        let slot = 'center';
        if (rank === 0 || item.x <= minX + tol) slot = 'left';
        else if (rank === sorted.length - 1 || item.x >= maxX - tol) slot = 'right';
        slots[item.i] = slot;
    });
    return slots;
}

function drawDimArrowH(ctx, x, y, dir, layoutScale) {
    const ls = layoutScale;
    const ah = 4 * ls;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dir * ah, y - ah * 0.55);
    ctx.lineTo(x - dir * ah, y + ah * 0.55);
    ctx.closePath();
    ctx.fill();
}

function drawHorizontalDimBetween(ctx, x1, x2, y, label, layoutScale, labelAbove = false, registry) {
    const ls = layoutScale;
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const lw = Math.max(1, ls);
    const ext = 5 * ls;
    ctx.strokeStyle = DIM_COLOR;
    ctx.fillStyle = DIM_COLOR;
    ctx.lineWidth = lw;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(left, y - ext);
    ctx.lineTo(left, y + ext);
    ctx.moveTo(right, y - ext);
    ctx.lineTo(right, y + ext);
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    drawDimArrowH(ctx, left, y, 1, layoutScale);
    drawDimArrowH(ctx, right, y, -1, layoutScale);
    if (registry) {
        const box = placeHorizontalDimLabel(registry, ctx, label, left, right, y, labelAbove, layoutScale);
        paintDimLabelBox(ctx, label, box, layoutScale);
    } else {
        const labelY = labelAbove ? y - 7 * ls : y + 11 * ls;
        drawDimLabel(ctx, label, (left + right) / 2, labelY, layoutScale, 'center');
    }
}

function drawVerticalDimBetween(ctx, x, y1, y2, label, layoutScale, labelOffsetLs = 6, registry) {
    const ls = layoutScale;
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    const lw = Math.max(1, ls);
    const ext = 4 * ls;
    ctx.strokeStyle = DIM_COLOR;
    ctx.fillStyle = DIM_COLOR;
    ctx.lineWidth = lw;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x - ext, top);
    ctx.lineTo(x + ext, top);
    ctx.moveTo(x - ext, bottom);
    ctx.lineTo(x + ext, bottom);
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    if (registry) {
        const box = placeVerticalDimLabel(registry, ctx, label, x, y1, y2, layoutScale, labelOffsetLs);
        paintDimLabelBox(ctx, label, box, layoutScale);
    } else {
        drawDimLabel(ctx, label, x - labelOffsetLs * ls, (top + bottom) / 2 + 3 * ls, layoutScale, 'right');
    }
}

/** Chain dims along one row: edge→first center, center↔center, last center→edge. */
function drawHorizontalHoleChainDims(ctx, ox, endX, holes, getPosMm, toHx, panelSpanMm, offsetY, layoutScale, labelAbove, registry) {
    if (!holes.length) return;
    const sorted = holes
        .map((h) => ({ h, pos: getPosMm(h), hx: toHx(h) }))
        .sort((a, b) => a.pos - b.pos);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    drawHorizontalDimBetween(ctx, ox, first.hx, offsetY, formatDimMm(first.pos), layoutScale, labelAbove, registry);

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        drawHorizontalDimBetween(
            ctx,
            prev.hx,
            curr.hx,
            offsetY,
            formatDimMm(curr.pos - prev.pos),
            layoutScale,
            labelAbove,
            registry
        );
    }

    drawHorizontalDimBetween(
        ctx,
        last.hx,
        endX,
        offsetY,
        formatDimMm(panelSpanMm - last.pos),
        layoutScale,
        labelAbove,
        registry
    );
}

function drawEdgeStripDimensions(ctx, holes, ox, stripOy, pw, ph, scale, layoutScale, lengthMm, thicknessMm, forbiddenRects) {
    if (!holes.length) return;
    const ls = layoutScale;
    const panelH = Math.max(1, lengthMm);
    const panelW = Math.max(1, thicknessMm);
    const registry = createDimLabelRegistry(forbiddenRects);

    const overallY = stripOy + ph + 46 * ls;
    drawHorizontalDimBetween(ctx, ox, ox + pw, overallY, formatDimMm(panelH), layoutScale, false, registry);

    const dimX = ox - 7 * ls;
    drawVerticalDimBetween(ctx, dimX, stripOy, stripOy + ph, formatDimMm(panelW), layoutScale, 3, registry);

    const holeY = stripOy + (panelW - 8) * scale;
    drawVerticalDimBetween(ctx, dimX - 22 * ls, stripOy + ph, holeY, '8', layoutScale, 3, registry);

    const offsetY = stripOy + ph + 16 * ls;
    drawHorizontalHoleChainDims(
        ctx,
        ox,
        ox + pw,
        holes,
        (h) => h.x,
        (h) => ox + h.x * scale,
        panelH,
        offsetY,
        layoutScale,
        false,
        registry
    );
}

/** Group side-panel face holes by row (bottom / top / shelf). */
function groupSidePanelHoleRows(holes, heightMm) {
    const panelH = Math.max(1, heightMm);
    const tol = panelH * 0.06;
    const rowMap = new Map();
    holes.forEach((h) => {
        const fromBottom = h.x;
        const fromTop = panelH - h.x;
        let kind;
        if (fromBottom <= tol) kind = 'bottom';
        else if (fromTop <= tol) kind = 'top';
        else kind = `mid_${Math.round(h.x)}`;
        if (!rowMap.has(kind)) rowMap.set(kind, []);
        rowMap.get(kind).push(h);
    });
    const order = { bottom: 0, top: 1 };
    return [...rowMap.entries()]
        .sort((a, b) => {
            const oa = order[a[0]] ?? 2;
            const ob = order[b[0]] ?? 2;
            if (oa !== ob) return oa - ob;
            return String(a[0]).localeCompare(String(b[0]));
        })
        .map(([kind, rowHoles]) => ({
            kind: kind.startsWith('mid') ? 'middle' : kind,
            holes: rowHoles,
            xAvg: rowHoles.reduce((s, h) => s + h.x, 0) / rowHoles.length,
        }));
}

/** Side-panel row callouts: keep label order matching hole Y (smaller Y left of larger Y). */
function planSideRowCalloutPlacements(row, sheet, ox, oy, pw, scale, layoutScale, ctx) {
    const ls = layoutScale;
    const off = 10 * ls;
    const gap = 3 * ls;
    if (!row.holes?.length) return new Map();

    let items = row.holes.map((h) => {
        const sheetIdx = sheet.holes.indexOf(h);
        const { sx, sy } = mapHoleToSheet(sheet, h);
        return {
            h,
            sheetIdx,
            hx: ox + sx * scale,
            hy: oy + sy * scale,
            y: h.y,
        };
    }).sort((a, b) => a.y - b.y);

    const { fullW, fullH } = measureHoleCalloutBox(ctx, sheet.holes[items[0].sheetIdx], items[0].sheetIdx, layoutScale);
    const hy0 = items[0].hy;
    let anchorY;
    if (row.kind === 'bottom') {
        anchorY = hy0 - fullH - off;
    } else if (row.kind === 'top') {
        anchorY = hy0 + off;
    } else {
        anchorY = hy0 - fullH - off;
    }

    const out = new Map();
    const pinLeftOutside = row.kind === 'bottom' || row.kind === 'top';

    if (pinLeftOutside) {
        const first = items[0];
        out.set(first.sheetIdx, {
            left: ox - fullW - off,
            top: anchorY,
            width: fullW,
            height: fullH,
            leaderSlot: 'left',
        });
        if (items.length === 1) return out;
        items = items.slice(1);
    } else if (items.length === 1) {
        return out;
    }

    const lefts = items.map((it) => it.hx - fullW / 2);
    for (let i = 1; i < lefts.length; i++) {
        lefts[i] = Math.max(lefts[i], lefts[i - 1] + fullW + gap);
    }

    const rightLimit = ox + pw - 6 * ls;
    let sideStart = -1;
    for (let i = 0; i < lefts.length; i++) {
        if (lefts[i] + fullW > rightLimit) {
            sideStart = i;
            break;
        }
    }

    if (sideStart === -1) {
        items.forEach((it, i) => {
            out.set(it.sheetIdx, { left: lefts[i], top: anchorY, width: fullW, height: fullH });
        });
        return out;
    }

    const sideLeft = ox + pw + off;
    let sideSlot = 0;
    for (let i = 0; i < items.length; i++) {
        if (i < sideStart) {
            out.set(items[i].sheetIdx, { left: lefts[i], top: anchorY, width: fullW, height: fullH });
        } else {
            out.set(items[i].sheetIdx, {
                left: sideLeft + sideSlot * (fullW + gap),
                top: anchorY,
                width: fullW,
                height: fullH,
            });
            sideSlot += 1;
        }
    }
    return out;
}

function buildSidePanelCalloutPlan(sheet, ox, oy, pw, scale, panelH, layoutScale, ctx) {
    const plan = new Map();
    groupSidePanelHoleRows(sheet.holes, panelH).forEach((row) => {
        const rowPlan = planSideRowCalloutPlacements(row, sheet, ox, oy, pw, scale, layoutScale, ctx);
        rowPlan.forEach((rect, idx) => plan.set(idx, rect));
    });
    return plan;
}

/** Green dimension lines for side panels (inner face) — mirrors edge-strip style. */
function drawSidePanelDimensions(ctx, holes, ox, oy, pw, ph, scale, layoutScale, heightMm, depthMm, forbiddenRects) {
    if (!holes.length) return;
    const ls = layoutScale;
    const panelH = Math.max(1, heightMm);
    const panelW = Math.max(1, depthMm);
    const registry = createDimLabelRegistry(forbiddenRects);

    const overallY = oy + ph + 46 * ls;
    drawHorizontalDimBetween(ctx, ox, ox + pw, overallY, formatDimMm(panelW), layoutScale, false, registry);

    const dimX = ox - 7 * ls;
    drawVerticalDimBetween(ctx, dimX, oy, oy + ph, formatDimMm(panelH), layoutScale, 3, registry);

    const rows = groupSidePanelHoleRows(holes, panelH);
    const bottomRow = rows.find((r) => r.kind === 'bottom');
    const topRow = rows.find((r) => r.kind === 'top');

    if (bottomRow?.holes.length) {
        const offset = Math.min(...bottomRow.holes.map((h) => h.x));
        const hy = oy + (panelH - offset) * scale;
        drawVerticalDimBetween(ctx, dimX - 22 * ls, oy + ph, hy, formatDimMm(offset), layoutScale, 3, registry);
    }
    if (topRow?.holes.length) {
        const offset = Math.min(...topRow.holes.map((h) => panelH - h.x));
        const hy = oy + offset * scale;
        drawVerticalDimBetween(ctx, dimX - 22 * ls, oy, hy, formatDimMm(offset), layoutScale, 3, registry);
    }

    rows.forEach((row) => {
        const rowHy = oy + (panelH - row.xAvg) * scale;
        const isBottomRow = row.kind === 'bottom';
        const isTopRow = row.kind === 'top';
        const offsetY = isBottomRow
            ? oy + ph + 14 * ls
            : (isTopRow ? oy - 20 * ls : rowHy - 12 * ls);
        const labelAbove = !isBottomRow;

        drawHorizontalHoleChainDims(
            ctx,
            ox,
            ox + pw,
            row.holes,
            (h) => h.y,
            (h) => ox + h.y * scale,
            panelW,
            offsetY,
            layoutScale,
            labelAbove,
            registry
        );
    });
}

/** Nearby nudges when a near-hole candidate hits a forbidden zone (dim band, section label). */
function nudgeCalloutFromForbidden(left, top, fullW, fullH, bounds, layoutScale) {
    const { edgeStrip, isSide } = bounds;
    const ls = layoutScale;
    const hStep = fullW * 0.22 + 4 * ls;
    const vStep = fullH + 2 * ls;
    const out = [];

    if (edgeStrip) {
        for (let n = -5; n <= 5; n++) {
            if (n === 0) continue;
            out.push({ left: left + n * hStep, top });
        }
    } else if (isSide) {
        for (let n = -5; n <= 5; n++) {
            if (n === 0) continue;
            out.push({ left: left + n * hStep, top });
        }
    } else {
        for (let n = -4; n <= 4; n++) {
            if (n === 0) continue;
            out.push({ left: left + n * hStep, top });
            out.push({ left, top: top + n * vStep });
        }
    }
    return out;
}

function buildCalloutCandidates(hx, hy, fullW, fullH, bounds, layoutScale, index) {
    const { ox, oy, pw, ph, edgeStrip, isSide } = bounds;
    const ls = layoutScale;
    const off = 10 * ls;
    const cx = ox + pw / 2;
    const cy = oy + ph / 2;
    const out = [];
    const push = (left, top, priority) => {
        out.push({ left, top, priority: priority || 0 });
    };
    const centered = (x) => x - fullW / 2;
    const above = hy - fullH - off;
    const below = hy + off;
    const leftOf = hx - fullW - off;
    const rightOf = hx + off;

    if (edgeStrip) {
        const rowY = edgeStripLabelRowY(bounds, layoutScale);
        const edgeOff = 8 * ls;
        const slot = bounds.edgeCalloutSlot || 'center';
        const aboveStripY = oy - fullH - edgeOff;

        if (slot === 'left') {
            push(ox - fullW - edgeOff, rowY, 0);
            push(ox - fullW - edgeOff, rowY - fullH - 2 * ls, 1);
        } else if (slot === 'right') {
            push(ox + pw + edgeOff, rowY, 0);
            push(ox + pw + edgeOff, rowY - fullH - 2 * ls, 1);
        } else {
            push(centered(hx), aboveStripY, 0);
            push(centered(hx - fullW * 0.08), aboveStripY, 1);
            push(centered(hx + fullW * 0.08), aboveStripY, 1);
            push(centered(hx), rowY, 2);
        }
        const hStep = fullW * 0.22 + 2 * ls;
        for (let n = 1; n <= 3; n++) {
            if (slot === 'left') push(ox - fullW - edgeOff - n * 4 * ls, rowY, 3 + n);
            else if (slot === 'right') push(ox + pw + edgeOff + n * 4 * ls, rowY, 3 + n);
            else {
                push(centered(hx - n * hStep), aboveStripY, 3 + n);
                push(centered(hx + n * hStep), aboveStripY, 3 + n);
            }
        }
    } else if (isSide) {
        const nearTop = hy < oy + ph * 0.28;
        const nearBottom = hy > oy + ph * 0.72;
        const hStep = fullW * 0.28 + 3 * ls;
        const preferRight = hx >= cx;
        const inlineSideY = hy - fullH / 2;
        const sidePrimary = preferRight ? rightOf : leftOf;

        if (nearBottom) {
            const anchorY = hy - fullH - off;
            push(centered(hx), anchorY, 0);
            for (let n = 1; n <= 4; n++) {
                push(centered(hx - n * hStep), anchorY, n);
                push(centered(hx + n * hStep), anchorY, n);
            }
        } else if (nearTop) {
            const anchorY = hy + off;
            push(centered(hx), anchorY, 0);
            for (let n = 1; n <= 4; n++) {
                push(centered(hx - n * hStep), anchorY, n);
                push(centered(hx + n * hStep), anchorY, n);
            }
        } else {
            push(sidePrimary, inlineSideY, 0);
            push(centered(hx), above, 1);
            push(centered(hx), below, 2);
            push(hx + off, inlineSideY, 3);
            push(hx - fullW - off, inlineSideY, 3);
            const vStep = fullH + 2 * ls;
            for (let n = 1; n <= 2; n++) {
                push(centered(hx - n * hStep), above, 4 + n);
                push(centered(hx + n * hStep), above, 4 + n);
                push(sidePrimary, inlineSideY - n * vStep, 4 + n);
                push(sidePrimary, inlineSideY + n * vStep, 4 + n);
            }
        }
    } else {
        const inwardX = hx <= cx ? 1 : -1;
        const inwardY = hy <= cy ? 1 : -1;
        push(centered(hx), above, 0);
        push(centered(hx), below, 1);
        push(rightOf, hy - fullH / 2, 2);
        push(leftOf, hy - fullH / 2, 2);
        push(
            hx + inwardX * off - (inwardX < 0 ? fullW : 0),
            hy + inwardY * off - (inwardY < 0 ? fullH : 0),
            3
        );
        push(hx + off, hy - fullH - off, 4);
        push(hx - fullW - off, hy - fullH - off, 4);
        push(hx + off, hy + off, 5);
        push(hx - fullW - off, hy + off, 5);
        const vStep = fullH + 2 * ls;
        for (let n = 1; n <= 3; n++) {
            push(centered(hx), above - n * vStep, 6 + n);
            push(centered(hx), below + n * vStep, 6 + n);
        }
    }

    out.sort((a, b) => a.priority - b.priority);
    return out;
}

function tryCalloutRect(left, top, fullW, fullH, minLeft, maxLeft, minTop, maxTop, bounds, layoutScale, placed, gap, forbidden) {
    const clampedLeft = Math.max(minLeft, Math.min(left, maxLeft));
    const clampedTop = clampCalloutTop(top, fullH, bounds, minTop, maxTop, layoutScale);
    const rect = { left: clampedLeft, top: clampedTop, width: fullW, height: fullH };
    if (overlapsAnyCallout(rect, placed, gap, forbidden)) {
        return null;
    }
    return rect;
}

function findCalloutPlacement(hx, hy, fullW, fullH, bounds, layoutScale, index, placed, forbidden) {
    const ls = layoutScale;
    const gap = 3 * ls;
    const candidates = buildCalloutCandidates(hx, hy, fullW, fullH, bounds, layoutScale, index);
    const minLeft = 6 * ls;
    const maxLeft = (bounds.canvasW || 2000) - fullW - 6 * ls;
    const minTop = (bounds.headerH || 0) + 2 * ls;
    const maxTop = (bounds.canvasH || 2000) - fullH - 2 * ls;

    for (const c of candidates) {
        const left = Math.max(minLeft, Math.min(c.left, maxLeft));
        const top = clampCalloutTop(c.top, fullH, bounds, minTop, maxTop, layoutScale);
        const rect = { left, top, width: fullW, height: fullH };

        if (!overlapsAnyCallout(rect, placed, gap, null)) {
            if (!overlapsAnyCallout(rect, [], gap, forbidden)) {
                return rect;
            }
            const nudges = nudgeCalloutFromForbidden(left, top, fullW, fullH, bounds, layoutScale);
            for (const n of nudges) {
                const nr = tryCalloutRect(
                    n.left, n.top, fullW, fullH, minLeft, maxLeft, minTop, maxTop,
                    bounds, layoutScale, placed, gap, forbidden
                );
                if (nr) return nr;
            }
        } else if (!overlapsAnyCallout(rect, placed, gap, forbidden)) {
            return rect;
        }
    }

    const rowStep = fullH + 2 * ls;
    const off = 10 * ls;
    const { ox, pw, isSide, edgeStrip, oy, ph } = bounds;
    const cx = ox + pw / 2;
    const preferRight = hx >= cx;
    const inlineSideY = hy - fullH / 2;

    if (edgeStrip) {
        const rowY = edgeStripLabelRowY(bounds, layoutScale);
        const edgeOff = 8 * ls;
        const slot = bounds.edgeCalloutSlot || 'center';
        const aboveStripY = oy - fullH - edgeOff;
        const defaults = {
            left: { left: ox - fullW - edgeOff, top: rowY },
            right: { left: ox + pw + edgeOff, top: rowY },
            center: { left: hx - fullW / 2, top: aboveStripY },
        };
        const base = defaults[slot] || defaults.center;
        const nr = tryCalloutRect(
            base.left, base.top, fullW, fullH, minLeft, maxLeft, minTop, maxTop,
            bounds, layoutScale, placed, gap, forbidden
        );
        if (nr) return nr;

        const hStep = fullW * 0.22 + 2 * ls;
        for (let n = 0; n <= 3; n++) {
            const hOff = n * hStep;
            for (const sign of [-1, 0, 1]) {
                const left = slot === 'left'
                    ? ox - fullW - edgeOff - n * 4 * ls
                    : slot === 'right'
                        ? ox + pw + edgeOff + n * 4 * ls
                        : hx - fullW / 2 + sign * hOff;
                const top = slot === 'center' ? aboveStripY : rowY;
                const tryNr = tryCalloutRect(
                    left, top, fullW, fullH, minLeft, maxLeft, minTop, maxTop,
                    bounds, layoutScale, placed, gap, forbidden
                );
                if (tryNr) return tryNr;
            }
        }
        return { left: base.left, top: base.top, width: fullW, height: fullH };
    }

    if (isSide) {
        const nearTop = hy < oy + ph * 0.28;
        const nearBottom = hy > oy + ph * 0.72;
        const hStep = fullW * 0.28 + 3 * ls;

        if (nearBottom || nearTop) {
            const anchorY = nearBottom ? hy - fullH - off : hy + off;
            for (let n = 0; n <= 4; n++) {
                const hOff = n * hStep;
                for (const sign of [-1, 0, 1]) {
                    const nr = tryCalloutRect(
                        hx - fullW / 2 + sign * hOff,
                        anchorY,
                        fullW,
                        fullH,
                        minLeft,
                        maxLeft,
                        minTop,
                        maxTop,
                        bounds,
                        layoutScale,
                        placed,
                        gap,
                        forbidden
                    );
                    if (nr) return nr;
                }
            }
            return {
                left: Math.max(minLeft, Math.min(hx - fullW / 2, maxLeft)),
                top: Math.max(minTop, Math.min(anchorY, maxTop)),
                width: fullW,
                height: fullH,
            };
        }

        const preferRightSide = hx >= cx;
        const sideSlots = preferRightSide
            ? [hx + off, ox + pw + off, hx - fullW - off, ox - fullW - off]
            : [hx - fullW - off, ox - fullW - off, hx + off, ox + pw + off];
        for (let n = 0; n <= 4; n++) {
            const vOff = n * rowStep;
            for (const baseLeft of sideSlots) {
                for (const vSign of [-1, 0, 1]) {
                    const nr = tryCalloutRect(
                        baseLeft,
                        inlineSideY + vSign * vOff,
                        fullW,
                        fullH,
                        minLeft,
                        maxLeft,
                        minTop,
                        maxTop,
                        bounds,
                        layoutScale,
                        placed,
                        gap,
                        forbidden
                    );
                    if (nr) return nr;
                }
            }
        }
    }

    const aboveFirst = index % 2 === 0;
    if (!isSide) {
        for (let n = 0; n <= 4; n++) {
            const vOff = n * rowStep;
            const tops = aboveFirst
                ? [hy - fullH - off - vOff, hy + off + vOff]
                : [hy + off + vOff, hy - fullH - off - vOff];
            for (const t of tops) {
                const nr = tryCalloutRect(
                    hx - fullW / 2, t, fullW, fullH, minLeft, maxLeft, minTop, maxTop,
                    bounds, layoutScale, placed, gap, forbidden
                );
                if (nr) return nr;
            }
        }
    }

    const stagger = isSide ? 0 : (index % 3) * rowStep;
    const sideLeft = preferRight ? hx + off : hx - fullW - off;
    const sideTop = inlineSideY + (aboveFirst ? -stagger : stagger);
    const sideNr = tryCalloutRect(
        sideLeft, sideTop, fullW, fullH, minLeft, maxLeft, minTop, maxTop,
        bounds, layoutScale, placed, gap, forbidden
    );
    if (sideNr) return sideNr;

    const nearRowBottom = hy > oy + ph * 0.72;
    const nearRowTop = hy < oy + ph * 0.28;
    const finalTop = nearRowBottom
        ? hy - fullH - off
        : (nearRowTop ? hy + off : (aboveFirst ? hy - fullH - off - stagger : hy + off + stagger));
    return {
        left: Math.max(minLeft, Math.min(hx - fullW / 2, maxLeft)),
        top: Math.max(minTop, Math.min(finalTop, maxTop)),
        width: fullW,
        height: fullH,
    };
}

function drawCalloutLeader(ctx, hx, hy, left, top, fullW, fullH, layoutScale, slot) {
    const ls = layoutScale;
    let nx;
    let ny;
    if (slot === 'left') {
        nx = left + fullW;
        ny = top + fullH * 0.35;
    } else if (slot === 'right') {
        nx = left;
        ny = top + fullH * 0.35;
    } else {
        nx = Math.max(left, Math.min(hx, left + fullW));
        ny = Math.max(top, Math.min(hy, top + fullH));
    }
    const dx = hx - nx;
    const dy = hy - ny;
    if (dx * dx + dy * dy < (14 * ls) ** 2) return;
    ctx.strokeStyle = 'rgba(26,107,47,0.45)';
    ctx.lineWidth = Math.max(1, layoutScale);
    ctx.setLineDash([3 * ls, 3 * ls]);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawHoleCallout(ctx, hole, index, hx, hy, bounds, layoutScale, sheet, placed, precomputedPlacement) {
    const ls = layoutScale;
    const measured = measureHoleCalloutBox(ctx, hole, index, layoutScale);
    const { pad, coordText, specText, coordH, lineGap, specH, fullW, fullH } = measured;
    const placement = precomputedPlacement || findCalloutPlacement(
        hx,
        hy,
        fullW,
        fullH,
        bounds,
        layoutScale,
        index,
        placed || [],
        bounds.forbiddenRects || []
    );

    const tx = placement.left + pad;
    const boxTop = placement.top + pad;
    const coordTy = boxTop + coordH - 2 * ls;
    const specTy = boxTop + coordH + lineGap + specH - 2 * ls;

    drawCalloutLeader(
        ctx,
        hx,
        hy,
        placement.left,
        placement.top,
        fullW,
        fullH,
        layoutScale,
        placement.leaderSlot || bounds.edgeCalloutSlot
    );

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(placement.left, placement.top, fullW, fullH);
    ctx.strokeStyle = 'rgba(26,107,47,0.5)';
    ctx.lineWidth = Math.max(1, layoutScale);
    ctx.strokeRect(placement.left, placement.top, fullW, fullH);

    ctx.fillStyle = '#1a7a35';
    ctx.font = `${fs(9, layoutScale)} Consolas, "Courier New", monospace`;
    ctx.fillText(coordText, tx, coordTy);

    ctx.fillStyle = '#0a2e12';
    ctx.font = `600 ${fs(11, layoutScale)} Segoe UI, Arial, sans-serif`;
    ctx.fillText(specText, tx, specTy);

    if (placed) {
        placed.push({
            left: placement.left,
            top: placement.top,
            width: fullW,
            height: fullH,
        });
    }
}

function localizeDrillingLabel(text, lang) {
    if (lang !== 'ru') return text;
    const map = {
        'Left edge': 'Левый торец',
        'Right edge': 'Правый торец',
        'Top edge': 'Верхний торец',
        'Bottom edge': 'Нижний торец',
        'Edges: left + right': 'Торцы: левый + правый',
    };
    return map[text] || text;
}

function isEdgePairSheet(sheet) {
    return sheet.layout === 'edge_pair';
}

function getEdgePairSections(sheet) {
    if (sheet.edges?.length) return sheet.edges;
    return [{ key: 'edge', label: sheet.viewLabel || 'Edge', holes: sheet.holes || [] }];
}

function drawEdgePairNotesBlock(ctx, sheet, lang, topY, canvasW, layoutScale) {
    const ls = layoutScale;
    const margin = 12 * ls;
    const edgeDepth = sheet.holes.find((h) => h.type === 'edge')?.depth || 29;
    ctx.strokeStyle = 'rgba(26,107,47,0.35)';
    ctx.lineWidth = Math.max(1, ls);
    ctx.setLineDash([4 * ls, 4 * ls]);
    ctx.beginPath();
    ctx.moveTo(margin, topY);
    ctx.lineTo(canvasW - margin, topY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#333';
    ctx.font = `bold ${fs(10, layoutScale)} Segoe UI, Arial, sans-serif`;
    ctx.fillText(lang === 'ru' ? 'Примечания:' : 'Notes:', margin, topY + 14 * ls);
    ctx.fillStyle = '#444';
    ctx.font = `${fs(9, layoutScale)} Segoe UI, Arial, sans-serif`;
    const lines = lang === 'ru'
        ? [
            `Все отверстия: Ø8 сквозь торец, глубина ${edgeDepth} мм`,
            'Y=8 — от нижней грани торца',
            'X — от левого конца каждого вида торца',
        ]
        : [
            `All holes: Ø8 through edge, depth ${edgeDepth} mm`,
            'Y=8 is from the bottom face',
            'X is measured from the left end of each edge view',
        ];
    lines.forEach((line, i) => {
        ctx.fillText(line, margin, topY + 28 * ls + i * 13 * ls);
    });
}

function getEdgePairLayout(layoutScale) {
    const ls = layoutScale;
    return {
        headerH: 44 * ls,
        contentTop: 52 * ls,
        sectionLabelH: 16 * ls,
        sectionGap: 14 * ls,
        axisFootprint: 72 * ls,
    };
}

function measureEdgePairContentHeight(phSingle, edgeCount, layoutScale) {
    const ep = getEdgePairLayout(layoutScale);
    const sectionBlock = ep.sectionLabelH + phSingle + ep.axisFootprint;
    return edgeCount * sectionBlock + Math.max(0, edgeCount - 1) * ep.sectionGap;
}

function measureEdgeStrip(sheet, W, pad, layoutScale) {
    const panelH = Math.max(1, sheet.lengthMm);
    const panelW = Math.max(1, sheet.widthMm);
    const drawW = panelH;
    const drawH = panelW;
    const maxPanelH = 250 * layoutScale;
    const scale = Math.min((W - pad * 2) / drawW, maxPanelH / drawH);
    return { scale, phSingle: drawH * scale, pw: drawW * scale };
}

function drawEdgeStrip(ctx, sheet, ox, stripOy, pw, ph, scale, layoutScale, sectionLabel, holes, holeIndexStart, lang, labelBaselineY, sheetMeta, sectionLabelH, chartMode) {
    const ls = layoutScale;
    const baseMeta = sheetMeta || {};
    const stripForbidden = getStripForbiddenRects(ox, stripOy, pw, ph, layoutScale, sectionLabelH);
    const bounds = {
        ox,
        oy: stripOy,
        pw,
        ph,
        edgeStrip: true,
        ...baseMeta,
        forbiddenRects: buildSheetForbiddenRects(
            { ox, oy: stripOy, pw, ph, canvasW: baseMeta.canvasW, headerH: baseMeta.headerH },
            layoutScale,
            'edge'
        ).concat(stripForbidden),
    };
    const placedCallouts = [];
    const calloutSlots = computeEdgeCalloutSlots(holes, Math.max(1, sheet.lengthMm));
    const panelLengthMm = Math.max(1, sheet.lengthMm);
    const panelThicknessMm = Math.max(1, sheet.widthMm);

    const minimalChart = chartMode === 'reference';

    if (sectionLabel) {
        ctx.fillStyle = '#1a6b2f';
        ctx.font = `bold ${fs(11, layoutScale)} Segoe UI, Arial, sans-serif`;
        const labelY = labelBaselineY != null ? labelBaselineY : stripOy - 6 * ls;
        ctx.fillText(localizeDrillingLabel(sectionLabel, lang), ox, labelY);
    }

    ctx.strokeStyle = '#222';
    ctx.lineWidth = Math.max(1, 1.5 * ls);
    ctx.strokeRect(ox, stripOy, pw, ph);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, stripOy, pw, ph);
    ctx.strokeRect(ox, stripOy, pw, ph);

    if (!minimalChart) {
        drawPanelAxes(ctx, bounds, { layout: 'edge' }, layoutScale);
    }

    holes.forEach((hole, i) => {
        const { sx, sy } = mapHoleToSheet({ ...sheet, layout: 'edge' }, hole);
        const hx = ox + sx * scale;
        const hy = stripOy + sy * scale;
        const r = holeVisualRadius(hole, scale, ls);
        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fillStyle = holeFillColor(hole);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = Math.max(1, ls);
        ctx.stroke();
        drawHoleCallout(
            ctx,
            hole,
            holeIndexStart + i,
            hx,
            hy,
            { ...bounds, edgeCalloutSlot: calloutSlots[i] },
            layoutScale,
            { ...sheet, layout: 'edge' },
            placedCallouts
        );
    });

    drawEdgeStripDimensions(
        ctx, holes, ox, stripOy, pw, ph, scale, layoutScale, panelLengthMm, panelThicknessMm, placedCallouts
    );
}

function measureDrillingSheet(sheet, opts = {}) {
    const render = resolveDrillingRenderOpts(opts);
    const layoutScale = render.layoutScale;
    const W = render.width;
    const chartMode = opts.chartMode || 'production';
    const isProduction = chartMode === 'production';
    const prodLayout = isProduction ? getProductionLayout() : null;
    const panelH = Math.max(1, sheet.lengthMm);
    const panelW = Math.max(1, sheet.widthMm);
    const isEdge = sheet.layout === 'edge';
    const isSideLayout = sheet.layout === 'side' || /^side_/.test(sheet.partId || '');
    const holes = sheet.holes || [];
    const sideRows = isSideLayout ? groupSidePanelHoleRows(holes, panelH) : [];
    const prodMargins = prodLayout
        ? prodLayout.productionExtraMargins(layoutScale, holes.length || 4, {
            height: panelH,
            width: panelW,
        }, sideRows)
        : null;
    const calloutSideMargin = prodMargins ? prodMargins.sideBand : 96 * layoutScale;
    const pad = prodMargins ? prodMargins.pad : Math.max(48 * layoutScale, calloutSideMargin);
    const isEdgePair = isEdgePairSheet(sheet);
    const epLayout = isEdgePair ? getEdgePairLayout(layoutScale) : null;
    const headerH = isEdgePair ? epLayout.headerH : 36 * layoutScale;
    const calloutTopReserve = prodMargins ? prodMargins.topReserve : 52 * layoutScale;
    const dimGap = prodMargins
        ? prodMargins.bottomBand
        : ((isEdge || isEdgePair || isSideLayout) ? 44 : 18) * layoutScale;
    const listGap = 28 * layoutScale;
    const lineH = 13 * layoutScale;
    const legendGap = 10 * layoutScale;
    const bottomPad = 10 * layoutScale;
    const holeLines = Math.max(1, holes.length || 0);
    const skipHoleList = isProduction && (isSideLayout || isEdge || isEdgePair);
    const listH = skipHoleList ? 0 : holeLines * lineH;
    const legendH = 12 * layoutScale;

    const isSide = sheet.layout === 'side' || /^side_/.test(sheet.partId || '');
    const drawW = isSide ? panelW : panelH;
    const drawH = isSide ? panelH : panelW;

    let scale;
    let ph;
    let pw;
    let phSingle;
    let contentTop = headerH + 8 * layoutScale;
    let edgeCount = 1;

    if (isEdgePair) {
        const strip = measureEdgeStrip(sheet, W, pad, layoutScale);
        scale = strip.scale;
        phSingle = strip.phSingle;
        pw = strip.pw;
        edgeCount = Math.max(1, getEdgePairSections(sheet).length);
        ph = measureEdgePairContentHeight(phSingle, edgeCount, layoutScale);
        contentTop = epLayout.contentTop;
    } else {
        const maxPanelH = 250 * layoutScale;
        const headerBlock = headerH + 8 * layoutScale;
        if (isProduction && prodLayout && isSideLayout) {
            scale = prodLayout.computeProductionPanelScale({
                layoutScale,
                drawW,
                drawH,
                panelH,
                panelW,
                rows: sideRows,
                holeCount: holes.length,
                canvasW: W,
                canvasH: Math.max(420 * layoutScale, opts.maxHeight || 920 * layoutScale),
                headerBlock,
                bottomPad,
            });
        } else {
            scale = Math.min((W - pad * 2) / drawW, maxPanelH / drawH);
        }
        ph = drawH * scale;
        pw = drawW * scale;
        phSingle = ph;
    }

    const edgeNotesH = (isEdgePair || sheet.layout === 'edge') ? 3 * lineH : 0;
    const edgePairNotesBlockH = isEdgePair ? 52 * layoutScale : 0;
    const topBlock = isEdgePair ? contentTop : headerH + 8 * layoutScale + calloutTopReserve;

    let finalW = W;
    let layoutShiftX = 0;
    let H = isEdgePair
        ? topBlock + ph + edgePairNotesBlockH + bottomPad
        : topBlock + ph + dimGap + listGap + edgeNotesH + listH + legendGap + legendH + bottomPad;

    if (isProduction && prodLayout) {
        const rowsAbove = prodLayout.countDimRowsAbove(sideRows);
        const rowsBelow = prodLayout.countDimRowsBelow(sideRows);
        const edgeSections = isEdgePair ? getEdgePairSections(sheet) : [];
        const maxSectionHoles = isEdgePair
            ? Math.max(0, ...edgeSections.map((s) => s.holes.length))
            : holes.length;
        const sampleHoles = isEdgePair
            ? (edgeSections.find((s) => s.holes.length === maxSectionHoles) || edgeSections[0])?.holes || []
            : holes;
        const ox = pad;
        const oy = topBlock;
        const content = prodLayout.measureProductionContent(null, {
            layoutScale,
            sheet,
            holes: sampleHoles,
            holeCount: maxSectionHoles,
            rows: isSideLayout ? sideRows : [],
            rowsAbove,
            rowsBelow,
            pw,
            ph: phSingle,
            panelH,
            panelW,
            ox,
            oy,
            scale,
            mapHoleToSheet,
            isEdge: isEdge || isEdgePair,
            canvasW: W,
        });
        layoutShiftX = content.layoutShiftX || 0;
        finalW = Math.max(finalW, content.requiredWidth);
        const labelGap = prodLayout.PROD.LABEL_PANEL_GAP * layoutScale;
        const prodFootprint = content.dimBandBelow + labelGap + content.labelAreaHeight
            + prodLayout.PROD.CANVAS_MARGIN * layoutScale + prodLayout.PROD.SAFETY_PAD * layoutScale;
        if (isEdgePair) {
            const sectionBlock = epLayout.sectionLabelH + phSingle + prodFootprint;
            H = topBlock + edgeCount * sectionBlock + (edgeCount - 1) * epLayout.sectionGap
                + edgePairNotesBlockH + bottomPad;
        } else if (isSideLayout || isEdge) {
            H = topBlock + ph + prodFootprint + edgeNotesH + bottomPad;
        }
        H = Math.max(H, content.requiredHeight + bottomPad);
    }

    return {
        W: finalW,
        H: Math.max(360 * layoutScale, H),
        scale,
        ph,
        phSingle,
        pw,
        holeLines,
        lineH,
        listGap,
        dimGap,
        legendGap,
        bottomPad,
        pad,
        headerH,
        calloutTopReserve,
        contentTop,
        layoutScale,
        isEdgePair,
        edgeCount,
        epLayout,
        chartMode,
        isProduction,
        skipHoleList,
        layoutShiftX,
    };
}

/**
 * Draw drilling sheet on canvas (2D schematic with dimensions).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sheet
 * @param {{ width?: number, height?: number, lang?: string, export?: boolean, pixelRatio?: number }} [opts]
 */
function drawPartDrillingSheet(ctx, sheet, opts = {}) {
    const lang = opts.lang === 'ru' ? 'ru' : 'en';
    const chartMode = opts.chartMode || 'production';
    const layout = opts._layoutPrecomputed || measureDrillingSheet(sheet, { ...opts, chartMode });
    const {
        W, H, scale, ph, phSingle, pw, holeLines, lineH, listGap, dimGap, legendGap, pad, headerH, calloutTopReserve,
        contentTop, layoutScale, isEdgePair, epLayout, isProduction, skipHoleList, layoutShiftX,
    } = layout;

    const panelH = Math.max(1, sheet.lengthMm);
    const panelW = Math.max(1, sheet.widthMm);
    const isSide = sheet.layout === 'side' || /^side_/.test(sheet.partId || '');
    const isEdge = sheet.layout === 'edge';
    const prod = isProduction ? getProductionLayout() : null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#1a6b2f';
    ctx.font = `bold ${fs(14, layoutScale)} Segoe UI, Arial, sans-serif`;
    ctx.fillText(sheet.partName, 12 * layoutScale, 18 * layoutScale);
    ctx.fillStyle = '#333';
    ctx.font = `${fs(11, layoutScale)} Segoe UI, Arial, sans-serif`;
    const viewText = lang === 'ru' ? 'Вид: ' : 'View: ';
    const pairNote = isEdgePair
        ? (lang === 'ru' ? ' (одна деталь, разные торцы)' : ' (one part, different ends)')
        : '';
    const subtitle = `${viewText}${localizeDrillingLabel(sheet.viewLabel, lang)}${pairNote}  |  ${Math.round(panelH)}×${Math.round(panelW)}×${sheet.thicknessMm} mm`;
    ctx.fillText(subtitle, 12 * layoutScale, 32 * layoutScale);

    const ox = pad;
    const oy = isEdgePair ? contentTop : headerH + 8 * layoutScale + calloutTopReserve;
    const sheetMeta = {
        canvasW: W,
        canvasH: H,
        headerH,
        forbiddenRects: buildSheetForbiddenRects(
            { ox, oy, pw, ph, canvasW: W, headerH },
            layoutScale,
            isEdgePair ? 'edge_pair' : sheet.layout
        ),
    };

    if (layoutShiftX) {
        ctx.save();
        ctx.translate(layoutShiftX, 0);
    }

    if (isEdgePair) {
        const sections = getEdgePairSections(sheet);
        let cursorY = contentTop;
        let holeIndex = 0;
        const sectionBlock = epLayout.sectionLabelH + phSingle + epLayout.axisFootprint;
        sections.forEach((edge) => {
            const labelBaselineY = cursorY + epLayout.sectionLabelH - 4 * layoutScale;
            const stripOy = cursorY + epLayout.sectionLabelH;
            if (chartMode === 'production' && prod) {
                ctx.fillStyle = '#1a6b2f';
                ctx.font = `bold ${fs(11, layoutScale)} Segoe UI, Arial, sans-serif`;
                ctx.fillText(localizeDrillingLabel(edge.label, lang), ox, labelBaselineY);
                const stripForbidden = getStripForbiddenRects(ox, stripOy, pw, phSingle, layoutScale, epLayout.sectionLabelH);
                prod.drawProductionPanelContent(ctx, {
                    sheet: { ...sheet, holes: edge.holes, layout: 'edge' },
                    ox,
                    oy: stripOy,
                    pw,
                    ph: phSingle,
                    scale,
                    layoutScale,
                    mapHoleToSheet,
                    groupRowsFn: () => [],
                    headerRects: sheetMeta.forbiddenRects.concat(stripForbidden),
                    holeIndexStart: holeIndex,
                    canvasW: W,
                    canvasH: H,
                    lang,
                });
                const stripContent = prod.measureProductionContent(null, {
                    layoutScale,
                    sheet: { ...sheet, holes: edge.holes, layout: 'edge' },
                    holes: edge.holes,
                    holeCount: edge.holes.length,
                    pw,
                    ph: phSingle,
                    panelH,
                    panelW,
                    ox,
                    oy: stripOy,
                    scale,
                    mapHoleToSheet,
                    isEdge: true,
                    lang,
                    canvasW: W,
                });
                const labelGap = prod.PROD.LABEL_PANEL_GAP * layoutScale;
                cursorY += epLayout.sectionLabelH + phSingle
                    + stripContent.dimBandBelow + labelGap + stripContent.labelAreaHeight;
            } else {
                drawEdgeStrip(
                    ctx,
                    sheet,
                    ox,
                    stripOy,
                    pw,
                    phSingle,
                    scale,
                    layoutScale,
                    edge.label,
                    edge.holes,
                    holeIndex,
                    lang,
                    labelBaselineY,
                    sheetMeta,
                    epLayout.sectionLabelH,
                    chartMode
                );
            }
            holeIndex += edge.holes.length;
            if (!(chartMode === 'production' && prod)) {
                cursorY += sectionBlock + epLayout.sectionGap;
            } else {
                cursorY += epLayout.sectionGap;
            }
        });
        drawEdgePairNotesBlock(ctx, sheet, lang, cursorY + 6 * layoutScale, W, layoutScale);
        if (layoutShiftX) ctx.restore();
        return { width: W, height: H };
    }

    if (chartMode === 'production' && prod && (isSide || isEdge)) {
        const panelForbidden = getStripForbiddenRects(ox, oy, pw, ph, layoutScale);
        prod.drawProductionPanelContent(ctx, {
            sheet,
            ox,
            oy,
            pw,
            ph,
            scale,
            layoutScale,
            mapHoleToSheet,
            groupRowsFn: groupSidePanelHoleRows,
            headerRects: sheetMeta.forbiddenRects.concat(panelForbidden),
            canvasW: W,
            canvasH: H,
            lang,
        });
        if (layoutShiftX) ctx.restore();
        return { width: W, height: H };
    } else {
        ctx.strokeStyle = '#222';
        ctx.lineWidth = Math.max(1, 1.5 * layoutScale);
        ctx.strokeRect(ox, oy, pw, ph);
        ctx.fillStyle = isSide ? '#ffffff' : '#f8faf8';
        ctx.fillRect(ox, oy, pw, ph);
        ctx.strokeRect(ox, oy, pw, ph);

        const panelForbidden = (isEdge || isSide)
            ? getStripForbiddenRects(ox, oy, pw, ph, layoutScale)
            : [];
        const panelBounds = {
            ox,
            oy,
            pw,
            ph,
            edgeStrip: isEdge,
            isSide,
            ...sheetMeta,
            forbiddenRects: (sheetMeta.forbiddenRects || []).concat(panelForbidden),
        };
        const placedCallouts = [];
        const edgeSlots = isEdge ? computeEdgeCalloutSlots(sheet.holes, panelH) : [];
        const sideCalloutPlan = isSide
            ? buildSidePanelCalloutPlan(sheet, ox, oy, pw, scale, panelH, layoutScale, ctx)
            : null;
        drawPanelAxes(ctx, panelBounds, sheet, layoutScale);

        sheet.holes.forEach((hole, i) => {
            const { sx, sy } = mapHoleToSheet(sheet, hole);
            const hx = ox + sx * scale;
            const hy = oy + sy * scale;
            const r = holeVisualRadius(hole, scale, layoutScale);
            ctx.beginPath();
            ctx.arc(hx, hy, r, 0, Math.PI * 2);
            ctx.fillStyle = holeFillColor(hole);
            ctx.fill();
            ctx.strokeStyle = '#111';
            ctx.lineWidth = Math.max(1, layoutScale);
            ctx.stroke();
            drawHoleCallout(
                ctx,
                hole,
                i,
                hx,
                hy,
                isEdge ? { ...panelBounds, edgeCalloutSlot: edgeSlots[i] } : panelBounds,
                layoutScale,
                sheet,
                placedCallouts,
                sideCalloutPlan?.get(i)
            );
        });

        if (isEdge) {
            drawEdgeStripDimensions(
                ctx, sheet.holes, ox, oy, pw, ph, scale, layoutScale, panelH, panelW, placedCallouts
            );
        } else if (isSide) {
            drawSidePanelDimensions(
                ctx, sheet.holes, ox, oy, pw, ph, scale, layoutScale, panelH, panelW, placedCallouts
            );
        } else {
            ctx.fillStyle = '#444';
            ctx.font = `${fs(10, layoutScale)} Segoe UI, Arial, sans-serif`;
            ctx.fillText(`X ${Math.round(panelH)}`, ox + pw / 2 - 14 * layoutScale, oy + ph + 16 * layoutScale);
            ctx.save();
            ctx.translate(ox - 10 * layoutScale, oy + ph / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(`Y ${Math.round(panelW)}`, 0, 0);
            ctx.restore();
        }
    }

    const listY = oy + ph + dimGap + listGap + (isEdge ? 3 * lineH : 0) - 14 * layoutScale;
    if (isEdge) {
        const edgeDepth = sheet.holes.find((h) => h.type === 'edge')?.depth || 29;
        ctx.fillStyle = '#333';
        ctx.font = `bold ${fs(10, layoutScale)} Segoe UI, Arial, sans-serif`;
        ctx.fillText(lang === 'ru' ? 'Примечания:' : 'Notes:', 12 * layoutScale, listY - 3 * lineH);
        ctx.fillStyle = '#444';
        ctx.font = `${fs(9, layoutScale)} Segoe UI, Arial, sans-serif`;
        const noteLines = lang === 'ru'
            ? [
                `Все отверстия: Ø8 сквозь торец, глубина ${edgeDepth} мм`,
                'Y=8 — от нижней грани торца',
                'X — от левого конца каждого вида торца',
            ]
            : [
                `All holes: Ø8 through edge, depth ${edgeDepth} mm`,
                'Y=8 is from the bottom face',
                'X is measured from the left end of each edge view',
            ];
        noteLines.forEach((line, i) => {
            ctx.fillText(line, 12 * layoutScale, listY - (2 - i) * lineH);
        });
    }

    if (!skipHoleList) {
        ctx.fillStyle = '#1a1a1a';
        ctx.font = `${fs(10, layoutScale)} Consolas, "Courier New", monospace`;
        sheet.holes.forEach((hole, i) => {
            const typeLabel = hole.type === 'face'
                ? (lang === 'ru' ? 'пласть' : 'face')
                : (lang === 'ru' ? 'торец' : 'edge');
            const edgeTag = hole.edgeLabel ? ` [${localizeDrillingLabel(hole.edgeLabel, lang)}]` : '';
            ctx.fillText(
                `${i + 1}. Ø${hole.diameter}×${hole.depth} ${typeLabel}${edgeTag}  X=${hole.x} Y=${hole.y}`,
                12 * layoutScale,
                listY + i * lineH
            );
        });
    }

    const legendY = listY + (skipHoleList ? 0 : holeLines * lineH) + legendGap;
    ctx.fillStyle = '#555';
    ctx.font = `${fs(9, layoutScale)} Segoe UI, Arial, sans-serif`;
    const originText = isSide
        ? (lang === 'ru'
            ? 'Ноль: низ-перед (пол, фасад). X=высота, Y=глубина'
            : 'Origin: bottom-front (floor, facade). X=height, Y=depth')
        : (isEdge || isEdgePair)
            ? (lang === 'ru'
                ? 'Ноль: перед-низ торца. X=глубина, Y=толщина (центр шканта Y=t/2). Оба торца — одна деталь'
                : 'Origin: front-bottom of edge. X=depth, Y=thickness (dowel center Y=t/2). Both ends — same part')
            : (lang === 'ru'
                ? 'Ноль: левый нижний угол (передний край)'
                : 'Origin: bottom-left (front edge)');
    if (!isProduction || !isSide) {
        ctx.fillText(originText, 12 * layoutScale, legendY);
    }

    if (layoutShiftX) ctx.restore();

    return { width: W, height: H };
}


function createPartDrillingCanvas(sheet, opts = {}) {
    const render = resolveDrillingRenderOpts(opts);
    const layout = measureDrillingSheet(sheet, {
        ...opts,
        width: render.width,
        layoutScale: render.layoutScale,
    });
    const { W, H, layoutScale } = layout;
    let pixelRatio = render.pixelRatio;
    while (
        (
            W * pixelRatio > MAX_CANVAS_PIXEL_DIM
            || H * pixelRatio > MAX_CANVAS_PIXEL_DIM
            || W * H * pixelRatio * pixelRatio > MAX_CANVAS_PIXELS
        )
        && pixelRatio > 1
    ) {
        pixelRatio = Math.max(1, pixelRatio - 0.5);
    }
    const canvas = document.createElement('canvas');
    const pixelW = Math.max(1, Math.round(W * pixelRatio));
    const pixelH = Math.max(1, Math.round(H * pixelRatio));
    canvas.width = pixelW;
    canvas.height = pixelH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return canvas;
    ctx.scale(pixelRatio, pixelRatio);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (typeof ctx.textRendering !== 'undefined') {
        ctx.textRendering = 'optimizeLegibility';
    }
    drawPartDrillingSheet(ctx, sheet, {
        ...opts,
        width: W,
        height: H,
        layoutScale,
        _layoutPrecomputed: layout,
    });
    return canvas;
}

function partDrillingSheetToDataUrl(sheet, opts = {}) {
    const canvas = createPartDrillingCanvas(sheet, { export: true, ...opts });
    try {
        return canvas.toDataURL('image/png');
    } catch (err) {
        console.error('partDrillingSheetToDataUrl failed:', sheet?.partId, err);
        throw err;
    }
}

function partDrillingSheetSize(sheet, opts = {}) {
    const { W, H } = measureDrillingSheet(sheet, opts);
    return { width: W, height: H };
}

/**
 * Prepare sheets for PDF export. Horizontal parts (edge_pair) keep both ends on one page.
 */
function expandDrillingSheetsForExport(sheets) {
    return sheets || [];
}

const api = {
    drawPartDrillingSheet,
    createPartDrillingCanvas,
    partDrillingSheetToDataUrl,
    partDrillingSheetSize,
    mapHoleToSheet,
    measureDrillingSheet,
    resolveDrillingRenderOpts,
    expandDrillingSheetsForExport,
    pickHoleEdgeDimensions,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.GConfigDrilling = window.GConfigDrilling || {};
    Object.assign(window.GConfigDrilling, api);
}
