/**
 * GConfig v2 — procedural Three.js furniture preview
 * ES module; exposes window.GConfig3D for script-v2.js (IIFE bridge).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const MM = 0.001;
const REBUILD_MS_DESKTOP = 120;
const REBUILD_MS_MOBILE = 180;
const FACADE_GAP = 2;
/** Sub-mm overlap so carcass panels meet without visible cracks. */
const CARCASS_JOINT_OVERLAP_MM = 0.45;
/** HDF / back panel thickness in closet 3D preview (mm). */
const BACK_PANEL_THICKNESS_MM = 3;
/** Play in dados per edge (mm) — total 4 mm off inner width/height (matches BOM h1-4 / w1-4). */
const BACK_PANEL_PLAY_PER_EDGE_MM = 2;

/**
 * HDF back panel inside carcass (not flush with side rears — avoids exterior bleed).
 * @returns {{ w: number, h: number, z: number }}
 */
function getBackPanelSpec(W, H, D, T) {
    const innerW = Math.max(1, W - 2 * T);
    const innerH = Math.max(1, H - 2 * T);
    const play = BACK_PANEL_PLAY_PER_EDGE_MM * 2;
    const sideD = carcassSideDepthMm(D, T);
    return {
        w: Math.max(1, innerW - play),
        h: Math.max(1, innerH - play),
        z: -sideD / 2 + BACK_PANEL_THICKNESS_MM / 2 + 0.5,
    };
}

/** Single interior face — no box edges that show as white stripes at corners. */
function addInteriorBackPanel(group, w, h, mat, y0, z) {
    if (w <= 0 || h <= 0 || !mat) return null;
    const geo = new THREE.PlaneGeometry(w * MM, h * MM);
    const displayMat = mat.clone();
    displayMat.side = THREE.DoubleSide;
    displayMat.depthWrite = true;
    displayMat.polygonOffset = false;
    const mesh = new THREE.Mesh(geo, displayMat);
    mesh.position.set(0, y0 * MM, z * MM);
    mesh.renderOrder = 3;
    group.add(mesh);
    return mesh;
}

/** Side depth stops at back panel — avoids rear overlap stripe in preview. */
function carcassSideDepthMm(D, T) {
    const d = Number(D) || 0;
    const t = Math.max(12, Number(T) || 16);
    return Math.max(t * 2, d - 2 * t - BACK_PANEL_THICKNESS_MM - 4);
}

/** Front face Z of carcass opening (matches shortened side depth). */
function carcassFrontFaceZ(D, carcassT) {
    return carcassSideDepthMm(D, carcassT) / 2;
}

/** Center Z for facade / drawer front (flush to carcass front + FACADE_GAP). */
function facadeFrontCenterZ(D, facadeT, carcassT) {
    return carcassFrontFaceZ(D, carcassT) + FACADE_GAP + facadeT / 2;
}
/** Gas-lift flip-up door open angle (degrees from closed). */
const GAS_LIFT_OPEN_DEG = 135;
const GAS_LIFT_OPEN_RAD = -(GAS_LIFT_OPEN_DEG * Math.PI) / 180;
const LEDGER_W_MM = 40;
/** Extra gap between mattress side and inner rail face (mm), added to rail thickness. */
const BED_MATTRESS_SIDE_CLEAR_MM = 6;
/** Inset ledgers/deck from inner rail face (mm). */
const BED_LEDGER_INSET_MM = 2;
/** Bump to invalidate cached bed materials after mesh fixes. */
const BED_MESH_MAT_REV = 11;
/** Vertical gap between lower and upper cabinet (mm), sync with script-v2 layout. */
const CLOSET_STACK_GAP_MM = 400;

/** Closet layout flags — keep build + dimensions in sync (v2: both | single). */
function getClosetLayoutFlags(layout) {
    const L = layout || 'both';
    const hasUpper = L === 'both';
    const hasLower = hasUpper || L === 'single';
    return { layout: L, hasUpper, hasLower };
}

function getClosetStackMetrics(params) {
    const { hasUpper, hasLower } = getClosetLayoutFlags(params.layout);
    const lower = {
        w: params.width || 800,
        h: params.height || 500,
        d: params.depth || 450,
    };
    const upper = {
        w: params.upperWidth || lower.w,
        h: params.upperHeight || 400,
        d: params.upperDepth || lower.d,
    };
    const ctT = params.countertop?.enabled && params.countertop.thickness > 0
        ? params.countertop.thickness
        : 0;
    const upperBaseY = lower.h + ctT + CLOSET_STACK_GAP_MM;
    const totalH = hasUpper ? upperBaseY + upper.h : lower.h;
    const wMm = Math.round(hasUpper ? Math.max(lower.w, upper.w) : lower.w);
    const dMm = Math.round(hasUpper ? Math.max(lower.d, upper.d) : lower.d);
    const sameDepth = Math.abs(lower.d - upper.d) < 0.5;
    const sameWidth = Math.abs(lower.w - upper.w) < 0.5;
    return {
        hasUpper,
        hasLower,
        lower,
        upper,
        ctT,
        upperBaseY,
        totalH,
        wMm,
        dMm,
        sameDepth,
        sameWidth,
    };
}

/** Sync with configurator.html v1 bed math. */
const BED_MAX_MATTRESS_PROTRUSION_ABOVE_RAIL_MM = 60;
const BED_MATTRESS_THICKNESS_NOMINAL_MM = 250;
const BED_LEDGER_TOP_OFFSET_DESIGN_MM = 8;
const BED_RAIL_SOLID_BOTTOM_MIN_MM = 20;
const BED_SHEET_BASE_THICKNESS_MM = 16;
const BED_MDF_CARCASS_THICKNESS_MM = [16, 18, 19, 25, 28];

/** @type {Map<string, THREE.Material>} */
const materialPool = new Map();
/** @type {Map<string, THREE.Texture>} */
const texturePool = new Map();
/** @type {Map<string, THREE.Material>} */
const tiledMaterialPool = new Map();
/** @type {Map<string, THREE.Texture>} */
const seamSoftTexturePool = new Map();
const imageTextureLoader = new THREE.TextureLoader();
let textureQualityMode = detectMobile() ? 'mobile' : 'desktop';
let grainRotationRad = 0;
let show3dTextures = true;
const MOBILE_TEXTURE_SIZE = 256;
const DESKTOP_TEXTURE_SIZE = 512;
const MOBILE_TEXTURE_ANISO = 2;
const DESKTOP_TEXTURE_ANISO = 6;
const DEFAULT_DECOR_BOARD_SIZE_MM = Object.freeze({ x: 2800, y: 2070 });
/** One UV tile ≈ this many mm on the panel (same for every decor code). */
const TEXTURE_TILE_MM = 1600;
const MIN_TEXTURE_REPEAT = 1;
/** Shared unit box — meshes use scale for dimensions (geometry reuse). */
const unitBox = new THREE.BoxGeometry(1, 1, 1);
/** Shared unit cylinder (axis = Y, r=0.5, h=1, 8 segments) — scaled for round hardware. */
const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
const dimLineMatCache = new Map();

function detectMobile() {
    return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
}

function detectCoarsePointer() {
    return window.matchMedia('(pointer: coarse)').matches;
}

function rebuildDebounceMs(mobile = detectMobile()) {
    return mobile ? REBUILD_MS_MOBILE : REBUILD_MS_DESKTOP;
}

function expSmooth(current, target, speed, deltaSec) {
    const t = 1 - Math.exp(-speed * deltaSec);
    return current + (target - current) * t;
}

function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Shared open/close speed for gas lifts, hinges, and drawers. */
const FACADE_ANIM_SPEED = 3.8;
const FACADE_ANIM_EASE = easeInOutCubic;

function normalizeBedMdfCarcassThicknessMm(value) {
    const n = parseInt(value, 10);
    if (BED_MDF_CARCASS_THICKNESS_MM.includes(n)) return n;
    let best = BED_MDF_CARCASS_THICKNESS_MM[0];
    let bestDist = Infinity;
    for (const a of BED_MDF_CARCASS_THICKNESS_MM) {
        const d = Math.abs(a - (Number.isFinite(n) ? n : best));
        if (d < bestDist) {
            bestDist = d;
            best = a;
        }
    }
    return best;
}

/** @see configurator.html getBedCenterSupportConfig */
function getBedCenterSupportConfig(mattressW) {
    const safeMattressW = Math.max(0, parseInt(mattressW, 10) || 0);
    if (safeMattressW >= 1600) return { centerSupportCount: 3 };
    if (safeMattressW >= 1200) return { centerSupportCount: 2 };
    return { centerSupportCount: 1 };
}

/** @see configurator.html getBedDeckStripLayout */
function getBedDeckStripLayout({
    bedLength,
    mattressW,
    ledgerW = LEDGER_W_MM,
    centerSupportCount = 0,
    centerSupportT = 18,
    stripThicknessMm,
}) {
    const TARGET_STRIP_W = 400;
    const STRIP_GAP = 40;
    const STRIP_T = Math.max(10, parseInt(stripThicknessMm, 10) || parseInt(centerSupportT, 10) || 18);
    const STRIP_CLEARANCE_TOTAL = 2;
    const STRIP_SIDE_CLEARANCE = 4;
    const MAX_STRIP_LENGTH = 1600;

    const safeBedLength = Math.max(0, parseInt(bedLength, 10) || 0);
    const safeMattressW = Math.max(0, parseInt(mattressW, 10) || 0);
    const safeLedgerW = Math.max(0, parseInt(ledgerW, 10) || 0);
    const ledgerSeatSpanW = safeMattressW;
    const stripSupportSpanW = Math.max(0, ledgerSeatSpanW - 2 * safeLedgerW);
    const stripLengthRaw = Math.max(0, ledgerSeatSpanW - 2 * STRIP_SIDE_CLEARANCE);
    const stripLengthL = Math.min(MAX_STRIP_LENGTH, stripLengthRaw);
    const preferredOrFittedW = stripLengthL >= TARGET_STRIP_W
        ? TARGET_STRIP_W
        : stripLengthL - STRIP_CLEARANCE_TOTAL;
    const stripWidthW = Math.max(1, Math.max(0, Math.floor(preferredOrFittedW)));

    const STRIP_AXIS_END_CLEAR_MM = 2;
    const innerBedLength = Math.max(300, safeBedLength - STRIP_AXIS_END_CLEAR_MM);
    let stripAlongCount = Math.max(1, Math.floor((innerBedLength + STRIP_GAP) / (stripWidthW + STRIP_GAP)));
    while (stripAlongCount > 1 && stripAlongCount * stripWidthW > innerBedLength) {
        stripAlongCount -= 1;
    }
    const stripActualGap = stripAlongCount > 1
        ? Number(((innerBedLength - stripAlongCount * stripWidthW) / (stripAlongCount - 1)).toFixed(2))
        : 0;

    return {
        STRIP_GAP,
        STRIP_T,
        STRIP_SIDE_CLEARANCE,
        MAX_STRIP_LENGTH,
        innerBedLength,
        ledgerSeatSpanW,
        stripSupportSpanW,
        stripLengthL,
        stripWidthW,
        stripAlongCount,
        stripActualGap,
    };
}

function getBedDeckThicknessMm(baseType, stripLayout) {
    if (baseType === 'slats') {
        const t = stripLayout && stripLayout.STRIP_T;
        return Math.max(1, parseInt(t, 10) || 18);
    }
    return BED_SHEET_BASE_THICKNESS_MM;
}

/** @see configurator.html getBedVerticalGeometryMm */
function getBedVerticalGeometryMm({
    frameH,
    baseType,
    stripLayout,
    ledgerT,
    mattressNominalT = BED_MATTRESS_THICKNESS_NOMINAL_MM,
}) {
    const safeFrameH = Math.max(0, parseInt(frameH, 10) || 0);
    const safeLedgerT = Math.max(1, parseInt(ledgerT, 10) || 16);
    const safeMattT = Math.max(1, parseInt(mattressNominalT, 10) || BED_MATTRESS_THICKNESS_NOMINAL_MM);
    const deckT = getBedDeckThicknessMm(baseType, stripLayout);

    const needInsetForProtrusionCap = deckT + safeMattT - BED_MAX_MATTRESS_PROTRUSION_ABOVE_RAIL_MM;
    let ledgerTopInsetMm = Math.max(BED_LEDGER_TOP_OFFSET_DESIGN_MM, needInsetForProtrusionCap);
    const maxInset = Math.max(
        BED_LEDGER_TOP_OFFSET_DESIGN_MM,
        safeFrameH - safeLedgerT - BED_RAIL_SOLID_BOTTOM_MIN_MM
    );
    if (ledgerTopInsetMm > maxInset) ledgerTopInsetMm = maxInset;

    const supportPlaneFromFloor = safeFrameH - ledgerTopInsetMm;
    const deckTopFromFloor = supportPlaneFromFloor + deckT;
    const mattressTopFromFloor = deckTopFromFloor + safeMattT;
    const mattressTopRelativeToRailMm = mattressTopFromFloor - safeFrameH;

    return {
        ledgerTopInsetMm,
        deckT,
        mattressNominalT: safeMattT,
        supportPlaneFromFloor,
        deckTopFromFloor,
        mattressTopFromFloor,
        mattressTopRelativeToRailMm,
        protrusionAboveRailMm: Math.max(0, mattressTopRelativeToRailMm),
        recessBelowRailMm: Math.max(0, -mattressTopRelativeToRailMm),
        centerSupportHeightMm: Math.max(0, supportPlaneFromFloor),
    };
}

/** Bed layout metrics — keep buildBed + dimensions in sync with configurator.html. */
function getBedStackMetrics(params) {
    const mattressW = params.width || 1600;
    const bedLen = params.length || 2000;
    const frameH = params.height || 420;
    const headboardH = params.headboardH || 900;
    const footboardH = params.footboardH != null ? params.footboardH : frameH;
    const panelT = Math.max(12, params.facadeT || 16);
    const railT = normalizeBedMdfCarcassThicknessMm(params.carcassT || 16);
    const ledgerT = railT;
    const baseType = params.baseType === 'sheet' ? 'sheet' : 'slats';
    const { centerSupportCount } = getBedCenterSupportConfig(mattressW);
    const stripLayout = getBedDeckStripLayout({
        bedLength: bedLen,
        mattressW,
        ledgerW: LEDGER_W_MM,
        centerSupportCount,
        centerSupportT: ledgerT,
        stripThicknessMm: ledgerT,
    });
    const bedVert = getBedVerticalGeometryMm({
        frameH,
        baseType,
        stripLayout,
        ledgerT,
        mattressNominalT: BED_MATTRESS_THICKNESS_NOMINAL_MM,
    });
    const outerW = mattressW + 2 * panelT;
    const outerL = bedLen + 2 * panelT;
    const totalH = Math.max(headboardH, footboardH, bedVert.mattressTopFromFloor);
    return {
        mattressW,
        bedLen,
        frameH,
        headboardH,
        footboardH,
        railT,
        outerW,
        outerL,
        totalH,
        wMm: Math.round(outerW),
        lMm: Math.round(outerL),
        hMm: Math.round(totalH),
    };
}

function hashColor(key, fallback = 0xc8b496) {
    if (!key) return new THREE.Color(fallback);
    let h = 0;
    for (let i = 0; i < key.length; i += 1) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
    const hue = 0.07 + ((Math.abs(h) % 1000) / 1000) * 0.12;
    return new THREE.Color().setHSL(hue, 0.28, 0.68);
}

function hashInt(key, fallback = 1) {
    if (!key) return fallback;
    let h = 0;
    for (let i = 0; i < key.length; i += 1) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
    return Math.abs(h) || fallback;
}

function extractDecorCode(rawKey) {
    const key = String(rawKey || '').toUpperCase();
    const m = key.match(/\b([A-Z]\d{3,4})\b/);
    return m ? m[1] : key;
}

function classifyMaterialFamily(rawKey) {
    const decor = extractDecorCode(rawKey);
    if (!decor) return 'neutral';
    if (decor.startsWith('H')) return 'wood';
    if (decor.startsWith('U')) return 'solid';
    if (decor.startsWith('W')) return 'solid';
    if (decor.startsWith('F')) return 'stone';
    if (decor.startsWith('S')) return 'stone';
    if (decor.startsWith('B')) return 'dark';
    return 'neutral';
}

function textureSizeForQuality() {
    return textureQualityMode === 'mobile' ? MOBILE_TEXTURE_SIZE : DESKTOP_TEXTURE_SIZE;
}

function anisotropyForQuality() {
    return textureQualityMode === 'mobile' ? MOBILE_TEXTURE_ANISO : DESKTOP_TEXTURE_ANISO;
}

function isPowerOfTwo(v) {
    return Number.isInteger(v) && v > 0 && (v & (v - 1)) === 0;
}

function nextPowerOfTwo(v) {
    return 2 ** Math.ceil(Math.log2(Math.max(1, v)));
}

function ensureRepeatSafeTextureImage(tex) {
    const img = tex?.image;
    if (!img) return;
    const w = img.naturalWidth || img.videoWidth || img.width || 0;
    const h = img.naturalHeight || img.videoHeight || img.height || 0;
    if (!w || !h) return;
    if (isPowerOfTwo(w) && isPowerOfTwo(h)) return;

    // RepeatWrapping on non-power-of-two images can render black on some GPUs/WebGL paths.
    // Convert to a reasonably sized power-of-two canvas once, then reuse.
    const maxDim = textureQualityMode === 'mobile' ? 1024 : 2048;
    const targetW = Math.min(maxDim, nextPowerOfTwo(w));
    const targetH = Math.min(maxDim, nextPowerOfTwo(h));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    tex.image = canvas;
}

function setupTextureCommon(tex, repeatX = 1, repeatY = 1) {
    ensureRepeatSafeTextureImage(tex);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = anisotropyForQuality();
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

function attachDefaultBoardSize(tex) {
    if (!tex) return tex;
    if (!tex.userData) tex.userData = {};
    if (!tex.userData.boardSizeMm) {
        tex.userData.boardSizeMm = { x: DEFAULT_DECOR_BOARD_SIZE_MM.x, y: DEFAULT_DECOR_BOARD_SIZE_MM.y };
    }
    return tex;
}

function createFacadeDemoTexture(seedKey) {
    const size = textureSizeForQuality();
    const seed = hashInt(seedKey, 17);
    const family = classifyMaterialFamily(seedKey);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const baseHue = family === 'wood'
        ? 18 + (seed % 16)
        : family === 'solid'
            ? 10 + (seed % 35)
            : family === 'stone'
                ? 24 + (seed % 10)
                : family === 'dark'
                    ? 210 + (seed % 10)
                    : 24 + (seed % 18);
    const sat = family === 'solid' ? 7 : family === 'stone' ? 12 : family === 'dark' ? 10 : 34;
    const lightA = family === 'dark' ? 24 : family === 'stone' ? 52 : family === 'solid' ? 66 : 48;
    const lightB = family === 'dark' ? 28 : family === 'stone' ? 58 : family === 'solid' ? 70 : 56;
    const lightC = family === 'dark' ? 21 : family === 'stone' ? 47 : family === 'solid' ? 62 : 45;

    if (family === 'wood') {
        const grad = ctx.createLinearGradient(0, 0, size, 0);
        grad.addColorStop(0, `hsl(${baseHue}, ${sat}%, ${lightA}%)`);
        grad.addColorStop(0.5, `hsl(${baseHue + 3}, ${Math.max(5, sat - 4)}%, ${lightB}%)`);
        grad.addColorStop(1, `hsl(${baseHue - 2}, ${Math.max(5, sat - 2)}%, ${lightC}%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        // Build smooth per-column wood tone variation (no hard tile-like bands).
        const col = new Float32Array(size);
        let v = ((seed % 97) / 97) * 2 - 1;
        for (let x = 0; x < size; x += 1) {
            const noise = ((((seed + x * 37) % 1000) / 1000) * 2 - 1) * 0.085;
            v = v * 0.92 + noise;
            col[x] = v;
        }
        for (let x = 0; x < size; x += 1) {
            const alpha = 0.055 + Math.abs(col[x]) * 0.07;
            const tone = col[x] >= 0 ? `rgba(255,238,214,${alpha.toFixed(3)})` : `rgba(44,26,14,${alpha.toFixed(3)})`;
            ctx.fillStyle = tone;
            ctx.fillRect(x, 0, 1, size);
        }

        const veins = 44 + (seed % 18);
        for (let i = 0; i < veins; i += 1) {
            const x = ((seed * (i + 11)) % size);
            const w = 1 + ((seed + i) % 2);
            const alpha = 0.04 + ((i % 5) * 0.012);
            ctx.fillStyle = `rgba(58,34,18,${alpha.toFixed(3)})`;
            ctx.fillRect(x, 0, w, size);
        }
    } else {
        // Stone/solid/dark should be non-directional; avoid vertical stripe artifacts.
        const grad = ctx.createLinearGradient(0, 0, size, size);
        grad.addColorStop(0, `hsl(${baseHue}, ${sat}%, ${lightA}%)`);
        grad.addColorStop(0.5, `hsl(${baseHue + 2}, ${Math.max(4, sat - 2)}%, ${lightB}%)`);
        grad.addColorStop(1, `hsl(${baseHue - 2}, ${Math.max(4, sat - 1)}%, ${lightC}%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        const clouds = family === 'stone' ? 220 : 140;
        for (let i = 0; i < clouds; i += 1) {
            const x = (seed * (i + 3) * 19) % size;
            const y = (seed * (i + 11) * 13) % size;
            const r = family === 'stone' ? 6 + ((seed + i) % 22) : 4 + ((seed + i) % 12);
            const alpha = family === 'stone' ? 0.035 + ((i % 5) * 0.008) : 0.02 + ((i % 4) * 0.006);
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const freckles = family === 'stone' ? 350 : 160;
        for (let i = 0; i < freckles; i += 1) {
            const x = (seed * (i + 5) * 7) % size;
            const y = (seed * (i + 17) * 5) % size;
            const dot = family === 'stone' ? 1 + ((seed + i) % 3) : 1;
            const alpha = family === 'stone' ? 0.06 : 0.04;
            ctx.fillStyle = `rgba(35,30,28,${alpha.toFixed(3)})`;
            ctx.fillRect(x, y, dot, dot);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    setupTextureCommon(tex, 2.2, 2.2);
    return attachDefaultBoardSize(tex);
}

function createCountertopDemoTexture(seedKey) {
    const size = textureSizeForQuality();
    const seed = hashInt(seedKey, 31);
    const family = classifyMaterialFamily(seedKey);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const base = family === 'wood' ? 24 + (seed % 10) : 18 + (seed % 10);
    const sat = family === 'wood' ? 18 : 8;
    const light = family === 'wood' ? 52 : 71;
    ctx.fillStyle = `hsl(${base}, ${sat}%, ${light}%)`;
    ctx.fillRect(0, 0, size, size);

    const dots = family === 'wood' ? 48 : 120;
    for (let i = 0; i < dots; i += 1) {
        const x = (seed * (i + 13) * 17) % size;
        const y = (seed * (i + 19) * 11) % size;
        const r = family === 'wood' ? 0.4 + ((seed + i) % 2) * 0.3 : 0.7 + ((seed + i) % 3) * 0.7;
        const alpha = family === 'wood' ? 0.06 + ((i % 4) * 0.01) : 0.12 + ((i % 5) * 0.02);
        ctx.fillStyle = `rgba(88, 84, 80, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    const scratches = family === 'wood' ? 34 : 24;
    for (let i = 0; i < scratches; i += 1) {
        const x1 = (seed * (i + 5) * 23) % size;
        const y1 = (seed * (i + 9) * 7) % size;
        const x2 = x1 + (((i % 2) ? 1 : -1) * (8 + (i % 6) * 3));
        const y2 = y1 + (6 + (i % 4) * 2);
        const alpha = family === 'wood' ? 0.06 + (i % 3) * 0.01 : 0.08 + (i % 3) * 0.02;
        ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    setupTextureCommon(tex, 1.8, 1.8);
    return attachDefaultBoardSize(tex);
}

function getDemoTexture(kind, seedKey) {
    const key = `${kind}:${textureQualityMode}:${seedKey || ''}`;
    if (texturePool.has(key)) return texturePool.get(key);
    const tex = kind === 'countertop'
        ? createCountertopDemoTexture(seedKey)
        : createFacadeDemoTexture(seedKey);
    if (tex) texturePool.set(key, tex);
    return tex;
}

function parseHexColor(value) {
    const v = String(value || '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(v)) return null;
    return new THREE.Color(v);
}

function isTextureImageReady(tex) {
    const img = tex?.image;
    if (!img || tex.userData.failed) return false;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    return w > 1 && h > 1;
}

function invalidateTextureDependentCaches() {
    materialPool.clear();
    tiledMaterialPool.clear();
    seamSoftTexturePool.clear();
}

function requestModelRebuildAfterTexture() {
    const inst = typeof ensureInstance === 'function' ? ensureInstance() : null;
    if (!inst?.lastParams) return;
    inst.lastKey = '';
    inst.rebuildModel(inst.lastParams);
}

/** Web-friendly preview for heavy Egger sheets (original may be 20–90 MB). */
function toPreviewEggerTextureUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.includes('egger-textures-preview/')) return url;
    if (!url.includes('assets/egger-textures/')) return url;
    return url.replace('assets/egger-textures/', 'assets/egger-textures-preview/');
}

function getImageTexture(url, options = {}) {
    const canonicalUrl = String(url || '');
    const key = `img:${canonicalUrl}`;
    if (texturePool.has(key)) return texturePool.get(key);

    const previewUrl = options.skipPreview ? null : toPreviewEggerTextureUrl(canonicalUrl);
    const loadUrl = previewUrl && previewUrl !== canonicalUrl ? previewUrl : canonicalUrl;

    const tex = imageTextureLoader.load(
        loadUrl,
        (loaded) => {
            setupTextureCommon(loaded, loaded.repeat.x || 1, loaded.repeat.y || 1);
            loaded.needsUpdate = true;
            invalidateTextureDependentCaches();
            requestModelRebuildAfterTexture();
        },
        undefined,
        () => {
            if (loadUrl !== canonicalUrl && !options.skipPreview) {
                const fullTex = getImageTexture(canonicalUrl, { skipPreview: true });
                texturePool.set(key, fullTex);
                invalidateTextureDependentCaches();
                requestModelRebuildAfterTexture();
                return;
            }
            tex.userData.failed = true;
            invalidateTextureDependentCaches();
            requestModelRebuildAfterTexture();
        }
    );
    setupTextureCommon(tex, 1, 1);
    attachDefaultBoardSize(tex);
    texturePool.set(key, tex);
    return tex;
}

function pickDecorTexture({ decorCode, decorTextureUrl, decorTextureMissing }) {
    const mapped = decorTextureUrl
        ? getImageTexture(decorTextureUrl)
        : getMappedDecorTexture(decorCode);
    if (mapped) {
        if (mapped.userData.failed) {
            return getMissingDecorPlaceholderTexture(decorCode || 'ERR');
        }
        return mapped;
    }
    if (decorTextureMissing) return getMissingDecorPlaceholderTexture(decorCode);
    return null;
}

function getMappedDecorTexture(decorCode) {
    const decor = String(decorCode || '').toUpperCase();
    if (decor === 'H3730') {
        const tex = getImageTexture('assets/textures/H3730.png');
        tex.userData.decorCode = 'H3730';
        // Source board in sample image: approx. 2311 x 1300 mm.
        tex.userData.boardSizeMm = { x: 2311, y: 1300 };
        return tex;
    }
    if (decor === 'H1277') {
        const tex = getImageTexture('assets/textures/H1277.png');
        tex.userData.decorCode = 'H1277';
        // Egger decor sheet size.
        tex.userData.boardSizeMm = { x: 2800, y: 2070 };
        return tex;
    }
    if (decor === 'H1307') {
        const tex = getImageTexture('assets/textures/H1307.png');
        tex.userData.decorCode = 'H1307';
        // Egger decor sheet size.
        tex.userData.boardSizeMm = { x: 2800, y: 2070 };
        return tex;
    }
    if (/^[A-Z]\d{3,4}$/.test(decor)) {
        const tex = getImageTexture(`assets/egger-textures/${decor}.jpg`);
        tex.userData.decorCode = decor;
        // Egger decor sheet size.
        tex.userData.boardSizeMm = { x: 2800, y: 2070 };
        return tex;
    }
    return null;
}

function getMissingDecorPlaceholderTexture(decorCode) {
    const code = String(decorCode || 'MISSING').toUpperCase();
    const key = `missing:${textureQualityMode}:${code}`;
    if (texturePool.has(key)) return texturePool.get(key);

    const size = textureQualityMode === 'mobile' ? 256 : 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#6b7280';
    ctx.fillRect(0, 0, size, size);
    const cell = Math.max(24, Math.floor(size / 10));
    for (let y = 0; y < size; y += cell) {
        for (let x = 0; x < size; x += cell) {
            const odd = ((x / cell) + (y / cell)) % 2 === 1;
            ctx.fillStyle = odd ? '#9ca3af' : '#6b7280';
            ctx.fillRect(x, y, cell, cell);
        }
    }

    ctx.fillStyle = 'rgba(220,38,38,0.9)';
    const barH = Math.max(18, Math.floor(size * 0.1));
    ctx.fillRect(0, Math.floor(size * 0.45), size, barH);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(16, Math.floor(size * 0.06))}px sans-serif`;
    ctx.fillText(`NO TEX ${code}`, size / 2, Math.floor(size * 0.5));

    const tex = new THREE.CanvasTexture(canvas);
    setupTextureCommon(tex, 1, 1);
    tex.userData.decorCode = code;
    tex.userData.isMissingPlaceholder = true;
    texturePool.set(key, tex);
    return tex;
}

function getTiledMaterial(baseMat, dimAmm, dimBmm, axis = 'front') {
    if (!show3dTextures || !baseMat?.map) return baseMat;
    const a = Math.max(1, Number(dimAmm) || 1);
    const b = Math.max(1, Number(dimBmm) || 1);
    const { repX, repY } = computeTileRepeat(a, b, axis, baseMat, false);
    const scaledRepX = repX / DEFAULT_TEXTURE_SCALE;
    const scaledRepY = repY / DEFAULT_TEXTURE_SCALE;
    const key = `${baseMat.uuid}:${axis}:${scaledRepX.toFixed(2)}:${scaledRepY.toFixed(2)}:${textureQualityMode}:${grainRotationRad.toFixed(4)}:t${TEXTURE_TILE_MM}`;
    if (tiledMaterialPool.has(key)) return tiledMaterialPool.get(key);

    const mat = baseMat.clone();
    const map = baseMat.map.clone();
    const useRepeat = scaledRepX > 1.0001 || scaledRepY > 1.0001;
    map.wrapS = useRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    map.wrapT = useRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    map.repeat.set(scaledRepX, scaledRepY);
    map.userData = { ...(map.userData || {}), baseRepeatX: repX, baseRepeatY: repY };
    map.center.set(0.5, 0.5);
    map.rotation = grainRotationRad;
    map.anisotropy = anisotropyForQuality();
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    mat.map = map;
    mat.needsUpdate = true;
    tiledMaterialPool.set(key, mat);
    return mat;
}

function getMaterial(name, hexOrKey, opts = {}) {
    const bedRev = name.startsWith('bed') || name === 'mattress' ? BED_MESH_MAT_REV : 0;
    const id = `${name}:${hexOrKey}:${opts.edge ? 1 : 0}:${opts.emissive ? 1 : 0}:${opts.transparent ? 1 : 0}:${opts.decorCode || ''}:${opts.decorHex || ''}:${opts.decorTextureUrl || ''}:${opts.decorTextureMissing ? 1 : 0}:${show3dTextures ? 1 : 0}:${bedRev}`;
    if (materialPool.has(id)) return materialPool.get(id);
    const mappedColor = parseHexColor(opts.decorHex);
    const color = mappedColor
        ? mappedColor
        : (typeof hexOrKey === 'number' ? new THREE.Color(hexOrKey) : hashColor(String(hexOrKey)));
    if (opts.edge) color.offsetHSL(0.02, 0.08, -0.06);
    if (name === 'facade' || name === 'bed-facade') color.offsetHSL(0, -0.04, 0.1);
    if (name === 'bed-rail') color.offsetHSL(0, 0.02, -0.1);
    if (name === 'facade-door') color.offsetHSL(0, -0.06, 0.14);
    if (name === 'countertop') color.offsetHSL(0, -0.06, -0.1);
    if (name === 'mattress') color.offsetHSL(0, -0.02, 0.06);
    const isMattress = name === 'mattress';
    const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.72,
        metalness: opts.metalness ?? 0.04,
        emissive: opts.emissive ? color.clone().multiplyScalar(0.08) : 0x000000,
        transparent: !!opts.transparent,
        opacity: opts.opacity ?? 1,
        // Mattress draws on top at rail contact lines without z-fighting on side faces.
        depthWrite: !isMattress,
        polygonOffset: false,
    });
    if (show3dTextures) {
        if (name === 'facade-door' || name === 'facade' || name === 'bed-facade' || name === 'carcass' || name === 'bed-carcass' || name === 'back') {
            const facadeSeed = opts.decorCode || String(hexOrKey);
            const facadeTex = pickDecorTexture(opts) || getDemoTexture('facade', facadeSeed);
            if (facadeTex) mat.map = facadeTex;
        }
        if (name === 'countertop') {
            const ctSeed = opts.decorCode || String(hexOrKey);
            const ctTex = pickDecorTexture(opts) || getDemoTexture('countertop', ctSeed);
            if (ctTex) mat.map = ctTex;
        }
    }
    const decorUrl = show3dTextures ? (opts.decorTextureUrl || '') : '';
    const decorTex = decorUrl ? texturePool.get(`img:${decorUrl}`) : null;
    const pendingDecorImage = decorUrl && decorTex && !isTextureImageReady(decorTex) && !decorTex.userData.failed;
    if (!pendingDecorImage) materialPool.set(id, mat);
    return mat;
}

function sceneBackground() {
    return document.documentElement.classList.contains('theme-future') ? 0x080c14 : 0xf0f4f2;
}

function isNeonTheme() {
    return document.documentElement.classList.contains('theme-future');
}

function dimAccentColor() {
    return isNeonTheme() ? '#22ff88' : '#2d6a4f';
}

const TEXTURE_SCALE_STEPS = [0.125, 0.2, 0.25, 0.35, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6];
const DEFAULT_TEXTURE_SCALE = 0.35;

function inferMeshTileDimsMm(mesh) {
    const sx = mesh.scale.x / MM;
    const sy = mesh.scale.y / MM;
    const sz = mesh.scale.z / MM;
    const axes = [
        { v: sx, n: 'x' },
        { v: sy, n: 'y' },
        { v: sz, n: 'z' },
    ].sort((a, b) => a.v - b.v);
    const thinAxis = axes[0].n;
    let axis = 'front';
    if (thinAxis === 'y' && axes[2].v >= axes[1].v * 0.85) axis = 'top';
    return { dimAmm: axes[1].v, dimBmm: axes[2].v, axis };
}

function captureMeshTextureBase(mesh) {
    if (!mesh?.material?.map) return;
    if (!mesh.userData.tileDimA) {
        const dims = inferMeshTileDimsMm(mesh);
        mesh.userData.tileDimA = dims.dimAmm;
        mesh.userData.tileDimB = dims.dimBmm;
        mesh.userData.tileAxis = dims.axis;
    }
    if (mesh.userData.ldspBaseMaterial?.map) return;
    const mat = mesh.material.clone();
    const map = mesh.material.map.clone();
    map.repeat.set(1, 1);
    map.offset.set(0, 0);
    map.rotation = 0;
    map.center.set(0.5, 0.5);
    map.needsUpdate = true;
    mat.map = map;
    mat.needsUpdate = true;
    mesh.userData.ldspBaseMaterial = mat;
}

function computeTileRepeat(dimAmm, dimBmm, axis, baseMat, rotateQuarterTurn = false) {
    const a = Math.max(1, Number(dimAmm) || 1);
    const b = Math.max(1, Number(dimBmm) || 1);
    if (baseMat?.map?.userData?.isMissingPlaceholder) {
        const markMm = 280;
        return {
            repX: Math.max(2, a / markMm),
            repY: Math.max(2, b / markMm),
        };
    }
    let repX = Math.max(MIN_TEXTURE_REPEAT, a / TEXTURE_TILE_MM);
    let repY = Math.max(MIN_TEXTURE_REPEAT, b / TEXTURE_TILE_MM);
    if (rotateQuarterTurn) {
        const swap = repX;
        repX = repY;
        repY = swap;
    }
    return { repX, repY };
}

function syncMeshBaseRepeat(mesh, baseMat) {
    if (!mesh?.userData?.tileDimA) {
        const dims = inferMeshTileDimsMm(mesh);
        mesh.userData.tileDimA = dims.dimAmm;
        mesh.userData.tileDimB = dims.dimBmm;
        mesh.userData.tileAxis = dims.axis;
    }
    const mat = baseMat || mesh.userData.ldspBaseMaterial || mesh.material;
    const { repX, repY } = computeTileRepeat(
        mesh.userData.tileDimA,
        mesh.userData.tileDimB,
        mesh.userData.tileAxis || 'front',
        mat,
        false
    );
    mesh.userData.baseRepeatX = repX;
    mesh.userData.baseRepeatY = repY;
    return { repX, repY };
}

function blendPixelPair(data, idxA, idxB, t) {
    const ar = data[idxA];
    const ag = data[idxA + 1];
    const ab = data[idxA + 2];
    const aa = data[idxA + 3];
    const br = data[idxB];
    const bg = data[idxB + 1];
    const bb = data[idxB + 2];
    const ba = data[idxB + 3];
    data[idxA] = Math.round(ar * (1 - t) + br * t);
    data[idxA + 1] = Math.round(ag * (1 - t) + bg * t);
    data[idxA + 2] = Math.round(ab * (1 - t) + bb * t);
    data[idxA + 3] = Math.round(aa * (1 - t) + ba * t);
    data[idxB] = Math.round(br * (1 - t) + ar * t);
    data[idxB + 1] = Math.round(bg * (1 - t) + ag * t);
    data[idxB + 2] = Math.round(bb * (1 - t) + ab * t);
    data[idxB + 3] = Math.round(ba * (1 - t) + aa * t);
}

function getSeamSoftenedSourceMap(baseMap) {
    if (!baseMap?.image) return baseMap;
    const image = baseMap.image;
    const width = image.naturalWidth || image.videoWidth || image.width || 0;
    const height = image.naturalHeight || image.videoHeight || image.height || 0;
    if (width < 8 || height < 8) return baseMap;

    const key = `${baseMap.uuid}:${width}x${height}`;
    if (seamSoftTexturePool.has(key)) return seamSoftTexturePool.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return baseMap;

    ctx.drawImage(image, 0, 0, width, height);
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;
    const feather = Math.max(2, Math.min(16, Math.round(Math.min(width, height) * 0.02)));
    const strength = 0.22;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < feather; x += 1) {
            const t = ((feather - x) / feather) * strength;
            const idxA = (y * width + x) * 4;
            const idxB = (y * width + (width - 1 - x)) * 4;
            blendPixelPair(data, idxA, idxB, t);
        }
    }

    for (let x = 0; x < width; x += 1) {
        for (let y = 0; y < feather; y += 1) {
            const t = ((feather - y) / feather) * strength;
            const idxA = (y * width + x) * 4;
            const idxB = ((height - 1 - y) * width + x) * 4;
            blendPixelPair(data, idxA, idxB, t);
        }
    }

    ctx.putImageData(img, 0, 0);
    const softened = baseMap.clone();
    softened.image = canvas;
    softened.userData = { ...(baseMap.userData || {}) };
    softened.generateMipmaps = true;
    softened.minFilter = THREE.LinearMipmapLinearFilter;
    softened.magFilter = THREE.LinearFilter;
    softened.needsUpdate = true;
    seamSoftTexturePool.set(key, softened);
    return softened;
}

function applyMeshTextureState(mesh, extraDeg, textureScale) {
    if (!show3dTextures) return;
    captureMeshTextureBase(mesh);
    const baseMat = mesh.userData.ldspBaseMaterial;
    if (!baseMat?.map) return;

    const dimA = mesh.userData.tileDimA;
    const dimB = mesh.userData.tileDimB;
    const axis = mesh.userData.tileAxis || 'front';
    const scale = Math.max(0.125, Math.min(6, Number(textureScale) || DEFAULT_TEXTURE_SCALE));
    const deg = ((Number(extraDeg) || 0) % 360 + 360) % 360;

    const totalRotationRad = grainRotationRad + (deg * Math.PI) / 180;
    const twoPi = Math.PI * 2;
    const wrappedRotationRad = ((totalRotationRad % twoPi) + twoPi) % twoPi;
    const turnsFloat = wrappedRotationRad / (Math.PI / 2);
    const turnsRounded = Math.round(turnsFloat);
    const snappedToQuarterTurn = Math.abs(turnsFloat - turnsRounded) < 1e-4;
    const quarterTurnIndex = ((turnsRounded % 4) + 4) % 4;
    const isQuarterTurn = snappedToQuarterTurn && (quarterTurnIndex === 1 || quarterTurnIndex === 3);
    const { repX: baseRepX, repY: baseRepY } = syncMeshBaseRepeat(mesh, baseMat);
    const appliedRepX = (isQuarterTurn ? baseRepY : baseRepX) / scale;
    const appliedRepY = (isQuarterTurn ? baseRepX : baseRepY) / scale;

    const mat = baseMat.clone();
    const shouldSoftenSeams = scale < 0.999 && (appliedRepX > 1.0001 || appliedRepY > 1.0001);
    const sourceMap = shouldSoftenSeams ? getSeamSoftenedSourceMap(baseMat.map) : baseMat.map;
    const map = sourceMap.clone();
    const useRepeat = appliedRepX > 1.0001 || appliedRepY > 1.0001;
    map.wrapS = useRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    map.wrapT = useRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    map.repeat.set(appliedRepX, appliedRepY);
    map.center.set(0.5, 0.5);
    map.rotation = wrappedRotationRad;
    map.anisotropy = anisotropyForQuality();
    map.needsUpdate = true;
    mat.map = map;
    mat.needsUpdate = true;

    if (mesh.userData.hoverMaterial) {
        mesh.userData.hoverMaterial.dispose?.();
        mesh.userData.hoverMaterial = null;
    }
    mesh.userData.baseMaterial = mat;
    mesh.userData.baseMapRotation = grainRotationRad;
    mesh.userData.grainRotationDeg = deg;
    mesh.userData.textureScale = scale;
    mesh.material = mat;
}

function applyMeshGrain(mesh, extraDeg) {
    const scale = Number(mesh.userData.textureScale) || DEFAULT_TEXTURE_SCALE;
    applyMeshTextureState(mesh, extraDeg, scale);
}

function grainOverrideKey(mesh) {
    if (mesh.userData.grainKey) return mesh.userData.grainKey;
    const px = Math.round(mesh.position.x / MM);
    const py = Math.round(mesh.position.y / MM);
    const pz = Math.round(mesh.position.z / MM);
    const sx = Math.round(mesh.scale.x / MM);
    const sy = Math.round(mesh.scale.y / MM);
    const sz = Math.round(mesh.scale.z / MM);
    const decor = mesh.material?.map?.userData?.decorCode
        || mesh.userData.baseMaterial?.map?.userData?.decorCode
        || '';
    return `${decor}:${px},${py},${pz}:${sx}x${sy}x${sz}`;
}

function setFacadeHighlight(mesh, on) {
    if (!mesh) return;
    if (!mesh.userData.baseMaterial) mesh.userData.baseMaterial = mesh.material;
    if (on) {
        if (!mesh.userData.hoverMaterial) {
            const hoverMat = mesh.userData.baseMaterial.clone();
            if (hoverMat.map && mesh.userData.baseMaterial.map) {
                hoverMat.map = mesh.userData.baseMaterial.map.clone();
                hoverMat.map.copy(mesh.userData.baseMaterial.map);
                hoverMat.map.needsUpdate = true;
            }
            hoverMat.emissive.setHex(isNeonTheme() ? 0x22ff88 : 0x448866);
            hoverMat.emissiveIntensity = isNeonTheme() ? 0.75 : 0.5;
            mesh.userData.hoverMaterial = hoverMat;
        }
        mesh.material = mesh.userData.hoverMaterial;
    } else {
        mesh.material = mesh.userData.baseMaterial;
    }
}

function addPanel(group, w, h, d, mat, x, y, z, opts = {}) {
    if (w <= 0 || h <= 0 || d <= 0) return null;
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.scale.set(w * MM, h * MM, d * MM);
    mesh.position.set(x * MM, y * MM, z * MM);
    if (opts.renderOrder != null) mesh.renderOrder = opts.renderOrder;
    group.add(mesh);
    return mesh;
}

/**
 * Countertop slab with rounded front top/bottom edges (R in mm).
 * Cross-section is extruded along width (X).
 */
function addRoundedCountertop(group, w, h, d, mat, x, y, z, radiusMm = 5) {
    if (w <= 0 || h <= 0 || d <= 0) return null;
    const hM = h * MM;
    const dM = d * MM;
    const wM = w * MM;
    const rM = Math.max(0, Math.min(radiusMm * MM, hM / 2 - 0.0001, dM / 2 - 0.0001));
    if (rM <= 0.00001) return addPanel(group, w, h, d, mat, x, y, z);

    const halfH = hM / 2;
    const halfD = dM / 2;
    const xBack = -halfD;
    const xFront = halfD;

    const shape = new THREE.Shape();
    // Front face of countertop is on negative local depth axis in this scene.
    // Round top/bottom edges on the front (xBack) side.
    shape.moveTo(xFront, -halfH);
    shape.lineTo(xBack + rM, -halfH);
    shape.absarc(xBack + rM, -halfH + rM, rM, -Math.PI / 2, -Math.PI, true);
    shape.lineTo(xBack, halfH - rM);
    shape.absarc(xBack + rM, halfH - rM, rM, Math.PI, Math.PI / 2, true);
    shape.lineTo(xFront, halfH);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: wM,
        bevelEnabled: false,
        curveSegments: 10,
        steps: 1,
    });
    geo.translate(0, 0, -wM / 2);
    geo.rotateY(Math.PI / 2);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x * MM, y * MM, z * MM);
    group.add(mesh);
    return mesh;
}

function tagBedMesh(mesh, renderOrder = 0) {
    if (!mesh) return null;
    mesh.renderOrder = renderOrder;
    return mesh;
}

/**
 * Place a scaled cylinder mesh.  Default axis = Y; pass rotX=Math.PI/2 to align along Z.
 * All positions/sizes in mm.
 */
function addCylinder(group, r, h, mat, x, y, z, rotX = 0) {
    if (r <= 0 || h <= 0) return null;
    const mesh = new THREE.Mesh(unitCylinder, mat);
    mesh.scale.set(r * 2 * MM, h * MM, r * 2 * MM);
    mesh.position.set(x * MM, y * MM, z * MM);
    if (rotX) mesh.rotation.x = rotX;
    group.add(mesh);
    return mesh;
}

/** Thin edge-band hint on one visible face (procedural, no CSG). */
function addEdgeBand(group, w, h, d, mat, x, y, z, face = 'front') {
    // Keep edge strip slightly outside host face to avoid z-fighting flicker.
    const band = 1.2;
    const eps = 0.35;
    switch (face) {
        case 'top':
            return addPanel(group, w, band, d, mat, x, y + h / 2 + band / 2 + eps, z);
        case 'front':
            return addPanel(group, w, h, band, mat, x, y, z + d / 2 + band / 2 + eps);
        case 'side':
            return addPanel(group, band, h, d, mat, x + w / 2 + band / 2 + eps, y, z);
        default:
            return null;
    }
}

function setRodEndpoints(rod, ax, ay, az, bx, by, bz, radiusMm) {
    const a = new THREE.Vector3(ax * MM, ay * MM, az * MM);
    const b = new THREE.Vector3(bx * MM, by * MM, bz * MM);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-9) {
        rod.visible = false;
        return;
    }
    rod.visible = true;
    rod.scale.set(radiusMm * 2 * MM, len, radiusMm * 2 * MM);
    rod.position.copy(a).add(b).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

function addRod(group, ax, ay, az, bx, by, bz, radiusMm, mat) {
    const rod = new THREE.Mesh(unitBox, mat);
    setRodEndpoints(rod, ax, ay, az, bx, by, bz, radiusMm);
    group.add(rod);
    return rod;
}

/** Gas-lift side bracket (приёмка) — 2× catalog size for visibility in preview. */
const GAS_MOUNT_PLATE_THK_MM = 5.6;
const GAS_MOUNT_PLATE_H_MM = 108;
const GAS_MOUNT_PLATE_D_MM = 68;
/** After 90° rotation the long edge runs along cabinet depth (Z). */
const GAS_MOUNT_PLATE_DEPTH_MM = GAS_MOUNT_PLATE_H_MM;
/** Clearance from front opening to the front face of the bracket (toward door). */
const GAS_MOUNT_FRONT_CLEAR_MM = 10;
/** Extra offset below default mount height (mm, positive = lower). */
const GAS_MOUNT_LOWER_OFFSET_MM = 10;
/** Pull strut anchors inward so they stay inside opened facade silhouette. */
const GAS_STRUT_INSET_FROM_FACADE_MM = 14;

/** Center Z for bracket on side wall (mm, cabinet space). */
function gasLiftCabinetAttachZ(D) {
    const frontZ = D / 2;
    const clear = Math.min(GAS_MOUNT_FRONT_CLEAR_MM, Math.max(10, D * 0.05));
    return frontZ - GAS_MOUNT_PLATE_DEPTH_MM / 2 - clear - GAS_STRUT_INSET_FROM_FACADE_MM;
}

/** Plate center + rod joint on cavity face of bracket (mm, cabinet space). */
function gasLiftMountAnchor(W, carcassT, side) {
    const plateThk = GAS_MOUNT_PLATE_THK_MM;
    const xInner = side < 0 ? -W / 2 + carcassT : W / 2 - carcassT;
    const xPlate = side < 0 ? xInner + plateThk / 2 : xInner - plateThk / 2;
    const xRod = side < 0 ? xPlate + plateThk / 2 : xPlate - plateThk / 2;
    return { xPlate, xRod, plateThk, plateH: GAS_MOUNT_PLATE_H_MM, plateD: GAS_MOUNT_PLATE_D_MM };
}

/**
 * Rectangular gas-lift mounting plate on the cabinet side wall (приёмка).
 * Sits flush on the inner face of the side panel at the strut lower anchor.
 */
function addGasLiftMountPlate(group, W, carcassT, side, attachY, attachZ) {
    const { xPlate, plateThk, plateH, plateD } = gasLiftMountAnchor(W, carcassT, side);

    const mat = getMaterial('gas-bracket', 0x6a737a, { metalness: 0.78, roughness: 0.34 });

    const parts = [];
    // 90° on side wall: long edge along depth (Z), short edge along height (Y). Single flat plate — no screws/dots.
    const plateY = plateD;
    const plateZ = plateH;
    const base = addPanel(group, plateThk, plateY, plateZ, mat, xPlate, attachY, attachZ);
    if (base) {
        base.renderOrder = 1;
        parts.push(base);
    }

    return parts;
}

function disposeObject(obj) {
    if (!obj) return;
    obj.traverse((child) => {
        if (child.geometry && child.geometry !== unitBox && child.geometry !== unitCylinder) child.geometry.dispose();
        if (child.material && child.material !== unitBox && child.userData?.isDimLine) {
            /* line materials cached */
        }
    });
}

function getDimLineMaterial(colorHex) {
    const key = String(colorHex);
    if (dimLineMatCache.has(key)) return dimLineMatCache.get(key);
    const mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: isNeonTheme() ? 0.98 : 0.92,
        blending: isNeonTheme() ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthTest: !isNeonTheme(),
        depthWrite: false,
    });
    mat.userData.isDimLine = true;
    dimLineMatCache.set(key, mat);
    return mat;
}

function createDimLabel(text, className = 'gconfig-dim-label') {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    el.style.pointerEvents = 'none';
    el.style.padding = '2px 6px';
    el.style.borderRadius = '4px';
    el.style.font = "600 11px 'Segoe UI', system-ui, sans-serif";
    el.style.background = isNeonTheme() ? 'rgba(8,12,20,0.82)' : 'rgba(255,255,255,0.88)';
    el.style.color = dimAccentColor();
    el.style.border = `1px solid ${isNeonTheme() ? 'rgba(34,255,136,0.35)' : 'rgba(45,106,79,0.25)'}`;
    if (isNeonTheme()) {
        el.style.textShadow = '0 0 6px rgba(34,255,136,0.6)';
        el.style.boxShadow = '0 0 10px rgba(34,255,136,0.28)';
    }
    el.style.whiteSpace = 'nowrap';
    return new CSS2DObject(el);
}

function addDimensionLine(group, pointsMm, colorHex) {
    const verts = [];
    for (let i = 0; i < pointsMm.length; i += 1) {
        verts.push(pointsMm[i][0] * MM, pointsMm[i][1] * MM, pointsMm[i][2] * MM);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const line = new THREE.Line(geo, getDimLineMaterial(colorHex));
    line.userData.isDimLine = true;
    group.add(line);
    return line;
}

class Furniture3D {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.labelRenderer = null;
        this.controls = null;
        this.root = null;
        this.dimGroup = null;
        this.animFrom = 0.96;
        this.animT = 1;
        this.rebuildTimer = null;
        this.raf = 0;
        this.resizeObs = null;
        this.visibilityObs = null;
        this.isVisible = true;
        this.lastKey = '';
        this.lastParams = null;
        this.running = false;
        this.lastFrameTime = performance.now();
        this.isMobile = detectMobile();
        this.coarsePointer = detectCoarsePointer();
        this.dimensionsVisible = true;
        this.texturesVisible = true;
        this.mobileExpanded = false;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.gasLiftDoors = [];
        this.hingeDoors = [];
        this.hoverableMeshes = [];
        this.drawerSlides = [];
        this.texturedMeshes = [];
        this.elementGrainDeg = new Map();
        this.elementTextureScale = new Map();
        this.perElementGrain = false;
        this.perElementTextureScale = false;
        this.interactiveDoors = true;
        this.hoveredMesh = null;
        this.hoveredEntry = null;
        this._clickPending = null;
        this._pickMoveTimer = 0;
        this._onPointerDown = (e) => this.handlePointerDown(e);
        this._onPointerUp = (e) => this.handlePointerUp(e);
        this._onPointerMove = (e) => this.handlePointerMove(e);
        this._onPointerLeave = () => this.handlePointerLeave();
        this._onWheel = (e) => this.handleWheel(e);
    }

    init() {
        if (!this.container || this.renderer) return;

        this.isMobile = detectMobile();
        this.coarsePointer = detectCoarsePointer();

        const w = Math.max(1, this.container.clientWidth);
        const h = Math.max(1, this.container.clientHeight);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(sceneBackground());

        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.05, 80);
        this.camera.position.set(1.6, 1.1, 2.2);

        this.renderer = new THREE.WebGLRenderer({
            antialias: !this.isMobile,
            alpha: false,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.25 : 2));
        this.renderer.setSize(w, h, false);
        this.container.appendChild(this.renderer.domElement);

        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(w, h);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0';
        this.labelRenderer.domElement.style.left = '0';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.container.appendChild(this.labelRenderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 0.4;
        this.controls.maxDistance = 8;
        this.controls.target.set(0, 0.5, 0);
        this.applyControlProfile();

        const hemi = new THREE.HemisphereLight(0xffffff, 0x334433, 0.55);
        this.scene.add(hemi);
        const amb = new THREE.AmbientLight(0xffffff, 0.35);
        this.scene.add(amb);
        const key = new THREE.DirectionalLight(0xffffff, 0.65);
        key.position.set(3, 5, 4);
        this.scene.add(key);
        const fill = new THREE.DirectionalLight(0xaaccff, 0.25);
        fill.position.set(-2, 2, -3);
        this.scene.add(fill);

        const ground = new THREE.Mesh(
            unitBox,
            new THREE.MeshStandardMaterial({ color: sceneBackground(), roughness: 1, metalness: 0 })
        );
        ground.scale.set(12, 0.002, 12);
        ground.position.y = -0.001;
        this.scene.add(ground);

        this.root = new THREE.Group();
        this.scene.add(this.root);

        this.dimGroup = new THREE.Group();
        this.scene.add(this.dimGroup);

        this.resizeObs = new ResizeObserver(() => this.onResize());
        this.resizeObs.observe(this.container);

        this.visibilityObs = new IntersectionObserver(
            (entries) => {
                this.isVisible = entries.some((e) => e.isIntersecting);
            },
            { threshold: 0.08 }
        );
        this.visibilityObs.observe(this.container);

        this.renderer.domElement.style.cursor = 'default';
        this.renderer.domElement.style.touchAction = 'none';
        this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
        this.renderer.domElement.addEventListener('pointerup', this._onPointerUp);
        this.renderer.domElement.addEventListener('pointermove', this._onPointerMove);
        this.renderer.domElement.addEventListener('pointerleave', this._onPointerLeave);
        this.renderer.domElement.addEventListener('wheel', this._onWheel, { passive: false });

        this.running = true;
        this.lastFrameTime = performance.now();
        this.loop();
    }

    applyControlProfile() {
        if (!this.controls) return;
        if (this.isMobile || this.mobileExpanded) {
            this.controls.enablePan = false;
            this.controls.rotateSpeed = 0.45;
            this.controls.zoomSpeed = 0.7;
            this.controls.maxPolarAngle = Math.PI / 2.05;
        } else {
            this.controls.enablePan = true;
            this.controls.rotateSpeed = 0.65;
            this.controls.zoomSpeed = 1;
            this.controls.maxPolarAngle = Math.PI / 2;
        }
        this.controls.enableZoom = !this.perElementTextureScale;
    }

    setOptions(opts = {}) {
        if (typeof opts.quality === 'string') {
            this.isMobile = opts.quality === 'mobile' || detectMobile();
            const nextQuality = this.isMobile ? 'mobile' : 'desktop';
            if (textureQualityMode !== nextQuality) {
                textureQualityMode = nextQuality;
                materialPool.clear();
                tiledMaterialPool.clear();
            }
        }
        if (Number.isFinite(opts.grainRotationDeg)) {
            const nextRad = (Number(opts.grainRotationDeg) * Math.PI) / 180;
            if (Math.abs(nextRad - grainRotationRad) > 1e-6) {
                grainRotationRad = nextRad;
                tiledMaterialPool.clear();
                this.applyGlobalGrainRotation();
            }
        }
        if (typeof opts.perElementGrain === 'boolean') {
            const modeChanged = this.perElementGrain !== opts.perElementGrain;
            this.perElementGrain = opts.perElementGrain;
            if (modeChanged) this.handlePointerLeave();
        }
        if (typeof opts.perElementTextureScale === 'boolean') {
            const modeChanged = this.perElementTextureScale !== opts.perElementTextureScale;
            this.perElementTextureScale = opts.perElementTextureScale;
            if (modeChanged) this.handlePointerLeave();
        }
        if (typeof opts.interactiveDoors === 'boolean') {
            const wasInteractiveDoors = this.interactiveDoors;
            const modeChanged = this.interactiveDoors !== opts.interactiveDoors;
            this.interactiveDoors = opts.interactiveDoors;
            if (wasInteractiveDoors && !this.interactiveDoors) {
                this.closeAllInteractiveParts();
            }
            if (modeChanged) this.handlePointerLeave();
        }
        if (typeof opts.mobileExpanded === 'boolean') {
            this.mobileExpanded = opts.mobileExpanded;
        }
        if (typeof opts.dimensionsVisible === 'boolean') {
            this.dimensionsVisible = opts.dimensionsVisible;
        }
        if (typeof opts.texturesVisible === 'boolean') {
            this.setTexturesVisible(opts.texturesVisible);
        }
        if (this.dimGroup) this.dimGroup.visible = this.dimensionsVisible;
        if (this.renderer) {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.25 : 2));
        }
        this.applyControlProfile();
    }

    setTexturesVisible(visible) {
        const next = !!visible;
        if (this.texturesVisible === next && show3dTextures === next) return;
        this.texturesVisible = next;
        show3dTextures = next;
        materialPool.clear();
        tiledMaterialPool.clear();
        if (this.lastParams) this.rebuildModel(this.lastParams);
    }

    setDimensionsVisible(visible) {
        this.dimensionsVisible = !!visible;
        if (!this.dimGroup) return;
        if (this.dimensionsVisible) {
            if (!this.dimGroup.children.length && this.lastParams) {
                this.buildDimensions(this.lastParams, this.getModelBoundsMm());
            }
            this.dimGroup.visible = true;
        } else {
            this.dimGroup.visible = false;
            this.clearDimGroup();
        }
    }

    setMobileExpanded(expanded) {
        this.mobileExpanded = !!expanded;
        this.applyControlProfile();
        this.onResize();
    }

    updatePointerFromEvent(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
    }

    pickInteractable(event) {
        if (!this.camera || !this.renderer || !this.hoverableMeshes.length) return null;
        this.updatePointerFromEvent(event);
        const meshes = this.hoverableMeshes.map((entry) => entry.mesh);
        const hits = this.raycaster.intersectObjects(meshes, false);
        if (!hits.length) return null;
        const hitMesh = hits[0].object;
        return this.hoverableMeshes.find((entry) => entry.mesh === hitMesh) ?? null;
    }

    pickTexturedMesh(event) {
        if (!this.camera || !this.renderer || !this.texturedMeshes.length) return null;
        this.updatePointerFromEvent(event);
        const hits = this.raycaster.intersectObjects(this.texturedMeshes, false);
        if (!hits.length) return null;
        return hits[0].object || null;
    }

    snapshotElementTextureStates() {
        const grainSnap = new Map(this.elementGrainDeg);
        const scaleSnap = new Map(this.elementTextureScale);
        for (const mesh of this.texturedMeshes) {
            const key = grainOverrideKey(mesh);
            const deg = Number(mesh.userData.grainRotationDeg || 0);
            const scale = Number(mesh.userData.textureScale || DEFAULT_TEXTURE_SCALE);
            if (deg) grainSnap.set(key, deg);
            else grainSnap.delete(key);
            if (Math.abs(scale - DEFAULT_TEXTURE_SCALE) > 1e-6) scaleSnap.set(key, scale);
            else scaleSnap.delete(key);
        }
        return { grainSnap, scaleSnap };
    }

    applyAllElementTextureStates() {
        for (const mesh of this.texturedMeshes) {
            const key = grainOverrideKey(mesh);
            const deg = this.elementGrainDeg.get(key) || 0;
            const scale = this.elementTextureScale.get(key) || DEFAULT_TEXTURE_SCALE;
            applyMeshTextureState(mesh, deg, scale);
        }
    }

    applyGlobalGrainRotation() {
        if (!this.texturedMeshes.length) return;
        tiledMaterialPool.clear();
        for (const mesh of this.texturedMeshes) {
            const key = grainOverrideKey(mesh);
            const deg = this.elementGrainDeg.get(key) || 0;
            const scale = this.elementTextureScale.get(key) || DEFAULT_TEXTURE_SCALE;
            applyMeshTextureState(mesh, deg, scale);
        }
    }

    rotateMeshGrain(mesh) {
        if (!mesh?.material?.map) return;
        const wasHovered = this.hoveredMesh === mesh;
        if (wasHovered) setFacadeHighlight(mesh, false);

        const currentDeg = Number(mesh.userData.grainRotationDeg || 0);
        const nextDeg = (currentDeg + 90) % 360;
        const key = grainOverrideKey(mesh);
        const scale = Number(mesh.userData.textureScale) || DEFAULT_TEXTURE_SCALE;
        if (nextDeg) this.elementGrainDeg.set(key, nextDeg);
        else this.elementGrainDeg.delete(key);
        applyMeshTextureState(mesh, nextDeg, scale);

        if (wasHovered) setFacadeHighlight(mesh, true);
    }

    scaleMeshTexture(mesh, direction) {
        if (!mesh?.material?.map) return;

        let current = Number(mesh.userData.textureScale) || DEFAULT_TEXTURE_SCALE;
        let idx = TEXTURE_SCALE_STEPS.findIndex((s) => Math.abs(s - current) < 0.02);
        if (idx < 0) idx = TEXTURE_SCALE_STEPS.findIndex((s) => Math.abs(s - DEFAULT_TEXTURE_SCALE) < 0.02);
        if (idx < 0) idx = TEXTURE_SCALE_STEPS.indexOf(1);
        const nextIdx = Math.max(0, Math.min(TEXTURE_SCALE_STEPS.length - 1, idx + direction));
        const nextScale = TEXTURE_SCALE_STEPS[nextIdx];
        const key = grainOverrideKey(mesh);
        const deg = Number(mesh.userData.grainRotationDeg || 0);
        if (Math.abs(nextScale - DEFAULT_TEXTURE_SCALE) < 1e-6) this.elementTextureScale.delete(key);
        else this.elementTextureScale.set(key, nextScale);
        applyMeshTextureState(mesh, deg, nextScale);
    }

    collectTexturedMeshes() {
        this.texturedMeshes = [];
        if (!this.root) return;
        this.root.traverse((child) => {
            if (!child?.isMesh) return;
            if (!child.material?.map) return;
            captureMeshTextureBase(child);
            this.texturedMeshes.push(child);
        });
    }

    handleWheel(event) {
        if (!this.perElementTextureScale || !show3dTextures) return;
        const mesh = this.pickTexturedMesh(event);
        if (!mesh?.material?.map) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.scaleMeshTexture(mesh, event.deltaY < 0 ? 1 : -1);
    }

    handlePointerMove(event) {
        if (this._clickPending) return;
        const now = performance.now();
        if (now - this._pickMoveTimer < 48) return;
        this._pickMoveTimer = now;

        if (this.perElementTextureScale) {
            const scaleMesh = this.pickTexturedMesh(event);
            this.renderer.domElement.style.cursor = scaleMesh ? 'ns-resize' : 'default';
            if (this.hoveredMesh) {
                setFacadeHighlight(this.hoveredMesh, false);
                this.hoveredMesh = null;
                this.hoveredEntry = null;
            }
            return;
        }

        const picked = this.perElementGrain ? null : this.pickInteractable(event);
        const grainMesh = this.perElementGrain ? this.pickTexturedMesh(event) : null;
        const mesh = grainMesh || picked?.mesh || null;
        if (mesh !== this.hoveredMesh) {
            if (this.hoveredMesh) setFacadeHighlight(this.hoveredMesh, false);
            this.hoveredMesh = mesh;
            this.hoveredEntry = picked;
            if (mesh) setFacadeHighlight(mesh, true);
        }
        this.renderer.domElement.style.cursor = mesh ? 'pointer' : 'default';
    }

    handlePointerLeave() {
        if (this.hoveredMesh) setFacadeHighlight(this.hoveredMesh, false);
        this.hoveredMesh = null;
        this.hoveredEntry = null;
        this.renderer.domElement.style.cursor = 'default';
    }

    handlePointerDown(event) {
        if (event.button !== 0) return;
        if (this.perElementTextureScale) return;
        if (this.perElementGrain) {
            const mesh = this.pickTexturedMesh(event);
            if (!mesh) return;
            this._clickPending = { kind: 'grain', mesh, x: event.clientX, y: event.clientY };
            this.controls.enabled = false;
            return;
        }
        const picked = this.pickInteractable(event);
        if (!picked) return;
        this._clickPending = picked;
        this.controls.enabled = false;
    }

    handlePointerUp(event) {
        if (event.button !== 0) return;
        if (this._clickPending) {
            if (this._clickPending.kind === 'grain') {
                const mesh = this.pickTexturedMesh(event);
                const dx = event.clientX - (this._clickPending.x ?? event.clientX);
                const dy = event.clientY - (this._clickPending.y ?? event.clientY);
                if (mesh && mesh === this._clickPending.mesh && dx * dx + dy * dy < 36) {
                    this.rotateMeshGrain(mesh);
                }
            } else if (this.interactiveDoors) {
                const picked = this.pickInteractable(event);
                if (picked && picked.mesh === this._clickPending.mesh) {
                    if (picked.state) {
                        picked.state.baseTargetT = picked.state.baseTargetT > 0.5 ? 0 : 1;
                        picked.state.targetT = picked.state.baseTargetT;
                    } else if (picked.kind === 'drawer' && picked.drawerIndex != null) {
                        const slide = this.drawerSlides[picked.drawerIndex];
                        if (slide) {
                            slide.baseTargetT = slide.baseTargetT > 0.5 ? 0 : 1;
                            slide.targetT = slide.baseTargetT;
                        }
                    }
                }
            }
        }
        this._clickPending = null;
        this.controls.enabled = true;
    }

    animateDoorState(state, deltaSec) {
        const animSpeed = state.animSpeed ?? FACADE_ANIM_SPEED;
        const ease = state.ease ?? FACADE_ANIM_EASE;
        if (Math.abs(state.t - state.targetT) > 0.001) {
            state.t = expSmooth(state.t, state.targetT, animSpeed, deltaSec);
        } else {
            state.t = state.targetT;
        }
        const eased = ease(state.t);
        const angle = state.closedAngle + eased * (state.openAngle - state.closedAngle);
        if (state.rotationAxis === 'x') {
            state.group.rotation.x = angle;
            state.group.rotation.y = 0;
        } else {
            state.group.rotation.y = angle;
            state.group.rotation.x = 0;
        }
        return eased;
    }

    updateGasLiftDoors(deltaSec) {
        for (const lift of this.gasLiftDoors) {
            this.animateDoorState(lift, deltaSec);
        }
    }

    updateHingeDoors(deltaSec) {
        for (const hinge of this.hingeDoors) {
            this.animateDoorState(hinge, deltaSec);
        }
    }

    updateDrawerSlides(deltaSec) {
        for (const slide of this.drawerSlides) {
            const animSpeed = slide.animSpeed ?? FACADE_ANIM_SPEED;
            const ease = slide.ease ?? FACADE_ANIM_EASE;
            if (Math.abs(slide.t - slide.targetT) > 0.001) {
                slide.t = expSmooth(slide.t, slide.targetT, animSpeed, deltaSec);
            } else {
                slide.t = slide.targetT;
            }
            const eased = ease(slide.t);
            slide.group.position.z = eased * slide.slideMm * MM;
        }
    }

    closeAllInteractiveParts() {
        for (const lift of this.gasLiftDoors) {
            lift.baseTargetT = 0;
            lift.targetT = 0;
            lift.t = 0;
            this.animateDoorState(lift, 0);
        }
        for (const hinge of this.hingeDoors) {
            hinge.baseTargetT = 0;
            hinge.targetT = 0;
            hinge.t = 0;
            this.animateDoorState(hinge, 0);
        }
        for (const slide of this.drawerSlides) {
            slide.baseTargetT = 0;
            slide.targetT = 0;
            slide.t = 0;
            slide.group.position.z = 0;
        }
    }

    onResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const w = Math.max(1, this.container.clientWidth);
        const h = Math.max(1, this.container.clientHeight);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
        this.labelRenderer?.setSize(w, h);
    }

    loop() {
        if (!this.running) return;
        this.raf = requestAnimationFrame(() => this.loop());
        if (!this.isVisible) return;

        const now = performance.now();
        const deltaSec = Math.min(0.05, (now - this.lastFrameTime) / 1000);
        this.lastFrameTime = now;

        if (this.animT < 1) {
            this.animT = Math.min(1, expSmooth(this.animT, 1, 8, deltaSec));
            const eased = easeOutCubic(this.animT);
            const s = this.animFrom + (1 - this.animFrom) * eased;
            if (this.root) {
                this.root.scale.setScalar(s);
                this.root.position.y = (1 - eased) * -0.035;
            }
        }

        this.updateGasLiftDoors(deltaSec);
        this.updateHingeDoors(deltaSec);
        this.updateDrawerSlides(deltaSec);
        this.controls?.update();
        this.renderer?.render(this.scene, this.camera);
        if (this.labelRenderer && this.dimensionsVisible) {
            this.labelRenderer.render(this.scene, this.camera);
        }
    }

    scheduleRebuild(params) {
        if (!params) return;
        const key = JSON.stringify(params);
        if (key === this.lastKey && this.root?.children.length) return;
        if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
        const ms = rebuildDebounceMs(params.quality === 'mobile' || this.isMobile);
        this.rebuildTimer = setTimeout(() => {
            this.rebuildTimer = null;
            this.rebuildModel(params);
        }, ms);
    }

    clearDimGroup() {
        if (!this.dimGroup) return;
        while (this.dimGroup.children.length) {
            const child = this.dimGroup.children[0];
            this.dimGroup.remove(child);
            disposeObject(child);
        }
    }

    buildDimensions(params, bounds) {
        this.clearDimGroup();
        if (!this.dimensionsVisible) return;
        if (params.mode === 'closets') {
            this.buildClosetDimensions(params, bounds);
            return;
        }
        if (params.mode === 'beds') {
            this.buildBedDimensions(params, bounds);
            return;
        }
        if (!bounds) return;
        this.buildGenericDimensions(params, bounds);
    }

    buildBedDimensions(params, bounds) {
        const lang = params.lang === 'en' ? 'en' : 'ru';
        const unit = lang === 'en' ? 'mm' : 'мм';
        const color = isNeonTheme() ? 0x22ff88 : 0x2d6a4f;
        const labelPad = 0.03;
        const stack = getBedStackMetrics(params);
        const min = bounds?.min ?? { x: -stack.outerL / 2, y: 0, z: -stack.outerW / 2 };
        const max = bounds?.max ?? { x: stack.outerL / 2, y: stack.totalH, z: stack.outerW / 2 };
        const xR = max.x;
        const zF = max.z;
        const y0 = min.y;
        const xL = min.x;
        const zB = min.z;

        const summary = lang === 'en'
            ? `${stack.wMm} × ${stack.hMm} × ${stack.lMm} ${unit}`
            : `${stack.wMm} × ${stack.hMm} × ${stack.lMm} ${unit}`;

        const summaryLabel = createDimLabel(summary, 'gconfig-dim-summary');
        summaryLabel.position.set(0, max.y * MM + 0.12, 0);
        this.dimGroup.add(summaryLabel);

        // Length — front bottom edge.
        addDimensionLine(this.dimGroup, [[xL, y0, zF], [xR, y0, zF]], color);
        const lenLabel = createDimLabel(`${stack.lMm} ${unit}`, 'gconfig-dim-bed-length');
        lenLabel.position.set(((xL + xR) / 2) * MM, y0 * MM - labelPad, zF * MM + labelPad);
        this.dimGroup.add(lenLabel);

        // Height — right front vertical edge.
        addDimensionLine(this.dimGroup, [[xR, y0, zF], [xR, max.y, zF]], color);
        const hLabel = createDimLabel(`${stack.hMm} ${unit}`, 'gconfig-dim-bed-height');
        hLabel.position.set(xR * MM + labelPad, ((y0 + max.y) / 2) * MM, zF * MM + labelPad);
        this.dimGroup.add(hLabel);

        // Width — right bottom edge (depth in plan).
        addDimensionLine(this.dimGroup, [[xR, y0, zB], [xR, y0, zF]], color);
        const wLabel = createDimLabel(`${stack.wMm} ${unit}`, 'gconfig-dim-bed-width');
        wLabel.position.set(xR * MM + labelPad, y0 * MM - labelPad, ((zB + zF) / 2) * MM);
        this.dimGroup.add(wLabel);

        if (stack.headboardH > stack.frameH + 0.5) {
            addDimensionLine(
                this.dimGroup,
                [[xL, stack.frameH, zF], [xL, stack.headboardH, zF]],
                color
            );
            const hbLabel = createDimLabel(`${Math.round(stack.headboardH)} ${unit}`, 'gconfig-dim-bed-headboard');
            hbLabel.position.set(xL * MM - labelPad, ((stack.frameH + stack.headboardH) / 2) * MM, zF * MM + labelPad);
            this.dimGroup.add(hbLabel);
        }
    }

    buildGenericDimensions(params, bounds) {
        const lang = params.lang === 'en' ? 'en' : 'ru';
        const unit = lang === 'en' ? 'mm' : 'мм';
        const color = isNeonTheme() ? 0x22ff88 : 0x2d6a4f;
        const { min, max } = bounds;
        const pad = 80;
        const wMm = Math.round(max.z - min.z);
        const hMm = Math.round(max.y - min.y);
        const dMm = Math.round(max.x - min.x);

        const summary = lang === 'en'
            ? `${wMm} × ${hMm} × ${dMm} ${unit}`
            : `${wMm} × ${hMm} × ${dMm} ${unit}`;

        const summaryLabel = createDimLabel(summary, 'gconfig-dim-summary');
        summaryLabel.position.set(0, max.y * MM + 0.12, 0);
        this.dimGroup.add(summaryLabel);

        const yBase = min.y - pad * 0.35;
        const zFront = max.z + pad * 0.55;
        const xRight = max.x + pad * 0.45;

        addDimensionLine(
            this.dimGroup,
            [[min.x, yBase, zFront], [max.x, yBase, zFront]],
            color
        );
        const lenLabel = createDimLabel(`${dMm} ${unit}`);
        lenLabel.position.set(((min.x + max.x) / 2) * MM, yBase * MM - 0.03, zFront * MM);
        this.dimGroup.add(lenLabel);

        addDimensionLine(
            this.dimGroup,
            [[xRight, min.y, min.z], [xRight, max.y, min.z]],
            color
        );
        const hLabel = createDimLabel(`${hMm} ${unit}`);
        hLabel.position.set(xRight * MM + 0.03, ((min.y + max.y) / 2) * MM, min.z * MM);
        this.dimGroup.add(hLabel);

        addDimensionLine(
            this.dimGroup,
            [[xRight, yBase, min.z], [xRight, yBase, max.z]],
            color
        );
        const wLabel = createDimLabel(`${wMm} ${unit}`);
        wLabel.position.set(xRight * MM + 0.03, yBase * MM - 0.03, ((min.z + max.z) / 2) * MM);
        this.dimGroup.add(wLabel);
    }

    buildClosetDimensions(params, bounds) {
        const lang = params.lang === 'en' ? 'en' : 'ru';
        const unit = lang === 'en' ? 'mm' : 'мм';
        const color = isNeonTheme() ? 0x22ff88 : 0x2d6a4f;
        const labelPad = 0.03;

        const stack = getClosetStackMetrics(params);
        const { hasUpper, hasLower, lower, upper, upperBaseY, totalH, wMm, dMm, sameDepth, sameWidth } = stack;
        const lowerHm = Math.round(lower.h);
        const upperHm = Math.round(upper.h);

        // Use carcass stack extents for dimension anchoring, so open facades
        // do not shift lines away from the cabinet edges.
        const xR = wMm / 2;
        const zF = dMm / 2;
        const y0 = 0;
        const xL = -wMm / 2;
        const zB = -dMm / 2;
        const wallPlaneZ = zB;

        // Split layout already has explicit edge dimensions; summary boxes are
        // intentionally omitted to avoid duplicated size data.

        const splitDepth = hasUpper && hasLower && !sameDepth;
        const splitWidth = hasUpper && hasLower && !sameWidth;

        const addHeightDim = (yStart, yEnd, labelMm, className, xEdge = xR, zEdge = zF) => {
            addDimensionLine(this.dimGroup, [[xEdge, yStart, zEdge], [xEdge, yEnd, zEdge]], color);
            const label = createDimLabel(`${labelMm} ${unit}`, className);
            label.position.set(xEdge * MM + labelPad, ((yStart + yEnd) / 2) * MM, zEdge * MM + labelPad);
            this.dimGroup.add(label);
        };

        const addDepthDim = (yAt, zNear, zFar, labelMm, className, xEdge = xR) => {
            addDimensionLine(this.dimGroup, [[xEdge, yAt, zNear], [xEdge, yAt, zFar]], color);
            const label = createDimLabel(`${Math.round(labelMm)} ${unit}`, className);
            label.position.set(xEdge * MM + labelPad, yAt * MM + labelPad, ((zNear + zFar) / 2) * MM);
            this.dimGroup.add(label);
        };

        const addWidthDim = (yAt, xNear, xFar, labelMm, className, zEdge = zF) => {
            addDimensionLine(this.dimGroup, [[xNear, yAt, zEdge], [xFar, yAt, zEdge]], color);
            const label = createDimLabel(`${Math.round(labelMm)} ${unit}`, className);
            label.position.set(((xNear + xFar) / 2) * MM, yAt * MM - labelPad, zEdge * MM + labelPad);
            this.dimGroup.add(label);
        };

        if (hasUpper && hasLower && sameWidth && sameDepth) {
            addHeightDim(0, totalH, Math.round(totalH), 'gconfig-dim-total-h');
            addWidthDim(y0, xL, xR, wMm, 'gconfig-dim-width');
            addDepthDim(y0, zB, zF, dMm, 'gconfig-dim-depth');
        } else {
            if (hasLower) {
                const lx = lower.w / 2;
                const lFront = wallPlaneZ + lower.d;
                addHeightDim(0, lower.h, lowerHm, 'gconfig-dim-lower', lx, lFront);
                if (splitWidth) addWidthDim(0, -lx, lx, lower.w, 'gconfig-dim-lower-w', lFront);
                if (splitDepth) addDepthDim(0, wallPlaneZ, wallPlaneZ + lower.d, lower.d, 'gconfig-dim-lower-d', lx);
            }
            if (hasUpper) {
                const ux = upper.w / 2;
                const uFront = wallPlaneZ + upper.d;
                addHeightDim(upperBaseY, upperBaseY + upper.h, upperHm, 'gconfig-dim-upper', ux, uFront);
                if (splitWidth) addWidthDim(upperBaseY, -ux, ux, upper.w, 'gconfig-dim-upper-w', uFront);
                if (splitDepth) addDepthDim(upperBaseY, wallPlaneZ, wallPlaneZ + upper.d, upper.d, 'gconfig-dim-upper-d', ux);
            }
            if (!splitWidth && (hasUpper || hasLower)) {
                addWidthDim(y0, xL, xR, wMm, 'gconfig-dim-width');
                if (hasUpper && hasLower) {
                    const ux = upper.w / 2;
                    const uFront = wallPlaneZ + upper.d;
                    addWidthDim(upperBaseY, -ux, ux, upper.w, 'gconfig-dim-upper-w', uFront);
                }
            }
            if (!splitDepth && (hasUpper || hasLower)) {
                addDepthDim(y0, zB, zF, dMm, 'gconfig-dim-depth');
            }
        }
    }

    getModelBoundsMm() {
        const box = new THREE.Box3().setFromObject(this.root);
        if (box.isEmpty()) return null;
        return {
            min: { x: box.min.x / MM, y: box.min.y / MM, z: box.min.z / MM },
            max: { x: box.max.x / MM, y: box.max.y / MM, z: box.max.z / MM },
        };
    }

    rebuildModel(params) {
        if (!this.scene) this.init();
        if (!this.root) return;

        const { grainSnap, scaleSnap } = this.snapshotElementTextureStates();

        this.lastParams = params;
        if (params.quality === 'mobile') this.isMobile = true;
        if (typeof params.dimensionsVisible === 'boolean') {
            this.dimensionsVisible = params.dimensionsVisible;
        }
        if (typeof params.texturesVisible === 'boolean') {
            this.texturesVisible = params.texturesVisible;
            show3dTextures = params.texturesVisible;
        }
        this.lastKey = JSON.stringify(params);

        this.scene.background.setHex(sceneBackground());
        this.gasLiftDoors = [];
        this.hingeDoors = [];
        this.drawerSlides = [];
        this.hoverableMeshes = [];
        this.texturedMeshes = [];
        if (this.hoveredMesh) {
            setFacadeHighlight(this.hoveredMesh, false);
            this.hoveredMesh = null;
        }
        this.hoveredEntry = null;
        this._clickPending = null;

        while (this.root.children.length) {
            const child = this.root.children[0];
            this.root.remove(child);
            disposeObject(child);
        }

        if (params.mode === 'beds') this.buildBed(params);
        else this.buildCloset(params);
        this.elementGrainDeg = grainSnap;
        this.elementTextureScale = scaleSnap;
        this.collectTexturedMeshes();
        this.applyAllElementTextureStates();

        const bounds = this.getModelBoundsMm();
        this.buildDimensions(params, bounds);
        this.dimGroup.visible = this.dimensionsVisible;

        this.fitCamera(params, bounds);
        this.animFrom = 0.96;
        this.animT = 0;
        if (this.root) {
            this.root.scale.setScalar(this.animFrom);
            this.root.position.y = -0.035;
        }
    }

    fitCamera(params, boundsMm) {
        const box = new THREE.Box3().setFromObject(this.root);
        if (boundsMm) {
            box.expandByPoint(new THREE.Vector3(boundsMm.min.x * MM, boundsMm.min.y * MM, boundsMm.min.z * MM));
            box.expandByPoint(new THREE.Vector3(boundsMm.max.x * MM, boundsMm.max.y * MM, boundsMm.max.z * MM));
        }
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.5);
        const dist = maxDim / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) + maxDim * 0.65;
        this.controls.target.copy(center);
        if (params?.mode === 'beds') {
            // Show side-rail thickness (facadeT along Z): more side-on than closet default.
            this.camera.position.set(
                center.x + dist * 0.28,
                center.y + dist * 0.42,
                center.z + dist * 1.05
            );
        } else {
            this.camera.position.set(center.x + dist * 0.55, center.y + dist * 0.35, center.z + dist * 0.75);
        }
        this.controls.update();
    }

    buildCloset(p) {
        const T = Math.max(12, p.carcassT || 16);
        const facadeT = Math.max(12, p.facadeT || 16);
        const carcassMat = getMaterial('carcass', p.material || 'ldsp', {
            decorCode: p.carcassDecorCode,
            decorHex: p.carcassDecorHex,
            decorTextureUrl: p.carcassDecorTextureUrl,
            decorTextureMissing: p.carcassDecorTextureMissing,
        });
        const edgeMat = getMaterial('edge', p.edge || p.material || 'edge', { edge: true });
        const doorMat = getMaterial('facade-door', p.facadeMaterial || p.material || 'facade-door', {
            decorCode: p.facadeDecorCode,
            decorHex: p.facadeDecorHex,
            decorTextureUrl: p.facadeDecorTextureUrl,
            decorTextureMissing: p.facadeDecorTextureMissing,
        });
        const bp = p.backPanelMaterial || {};
        const backMat = getMaterial('back', bp.material || p.material || 'back', {
            decorCode: bp.decorCode,
            decorHex: bp.decorHex,
            decorTextureUrl: bp.decorTextureUrl,
            decorTextureMissing: bp.decorTextureMissing,
        });

        const stack = getClosetStackMetrics(p);
        const { hasUpper, lower, upper, ctT, upperBaseY, dMm } = stack;
        const lowerZ = (lower.d - dMm) / 2;
        const upperZ = (upper.d - dMm) / 2;
        const lowerGroup = new THREE.Group();
        lowerGroup.position.z = lowerZ * MM;
        this.root.add(lowerGroup);
        this.buildCarcassSection(lowerGroup, lower.w, lower.h, lower.d, T, 0, carcassMat, edgeMat, p.backWall, backMat);
        if (ctT > 0) this.buildCountertop(p, lower, edgeMat, lowerGroup);

        let upperGroup = null;
        if (hasUpper) {
            upperGroup = new THREE.Group();
            upperGroup.position.z = upperZ * MM;
            this.root.add(upperGroup);
            this.buildCarcassSection(upperGroup, upper.w, upper.h, upper.d, T, upperBaseY, carcassMat, edgeMat, p.backWall, backMat);
        }

        const shelfDefs = Array.isArray(p.shelves) ? p.shelves : [];
        shelfDefs.forEach((sec) => {
            if (sec.zone === 'upper' && !hasUpper) return;
            const baseY = sec.zone === 'upper' ? upperBaseY : 0;
            const sw = sec.w || lower.w;
            const sh = sec.h || lower.h;
            const sd = sec.d || lower.d;
            const targetGroup = sec.zone === 'upper' ? (upperGroup || lowerGroup) : lowerGroup;
            this.addShelves(targetGroup, sec, sw, sh, sd, T, baseY, carcassMat);
        });

        const doors = p.doors || {};
        const upperMode = doors.upper || 'gas';
        const lowerMode = doors.lower || 'hinge';
        const upperCenterY = upperBaseY + upper.h / 2;
        const lowerCenterY = lower.h / 2;

        const upperHingeOpts = {
            hingeSpec: p.hinges?.upper,
            cabinetTopY: upperBaseY + upper.h,
            cabinetHeightMm: upper.h,
        };
        const lowerHingeOpts = {
            hingeSpec: p.hinges?.lower,
            cabinetTopY: lower.h,
            cabinetHeightMm: lower.h,
        };

        if (hasUpper) {
            if (upperMode === 'gas') {
                this.addDoor(upperGroup, upper.w, upper.h, facadeT, upper.d, upperCenterY, doorMat, true, { interactive: true, startOpen: false, carcassT: T });
            } else if (upperMode === 'hinge') {
                const upperPos = p.hinges?.upper?.position || 'both';
                this.addDoor(upperGroup, upper.w, upper.h, facadeT, upper.d, upperCenterY, doorMat, false, {
                    interactive: true,
                    hingeSide: upperPos === 'right' ? 'right' : 'left',
                    ...upperHingeOpts,
                });
            }
        }

        if (lowerMode === 'drawer' || p.drawers?.enabled) {
            this.addDrawers(lowerGroup, lower.w, lower.h, lower.d, facadeT, doorMat, p.drawers?.count || 1, {
                interactive: true,
                drawerSpec: p.drawers?.spec,
                drawerTypes: p.drawers?.types || [],
                carcassT: T,
            });
        } else if (lowerMode === 'gas') {
            this.addDoor(lowerGroup, lower.w, lower.h, facadeT, lower.d, lowerCenterY, doorMat, true, { interactive: true, startOpen: false, carcassT: T });
        } else if (lowerMode === 'hinge') {
            if (p.lowerSplitDoor) {
                this.addSplitDoors(lowerGroup, lower.w, lower.h, facadeT, lower.d, lowerCenterY, doorMat, {
                    interactive: true,
                    carcassT: T,
                    ...lowerHingeOpts,
                });
            } else {
                const lowerPos = p.hinges?.lower?.position || 'left';
                this.addDoor(lowerGroup, lower.w, lower.h, facadeT, lower.d, lowerCenterY, doorMat, false, {
                    interactive: true,
                    hingeSide: lowerPos === 'right' ? 'right' : 'left',
                    carcassT: T,
                    ...lowerHingeOpts,
                });
            }
        }
    }

    buildCountertop(p, lower, edgeMat, targetGroup = this.root) {
        const ct = p.countertop || {};
        const ctT = ct.thickness > 0 ? ct.thickness : 0;
        if (!ctT) return;
        const front = ct.frontOverhang || 0;
        const side = ct.sideOverhang || 0;
        const ctW = lower.w + side * 2;
        const ctD = lower.d + front;
        const ctMat = getMaterial('countertop', ct.material || 'countertop', {
            decorCode: ct.decorCode,
            decorHex: ct.decorHex,
            decorTextureUrl: ct.decorTextureUrl,
            decorTextureMissing: ct.decorTextureMissing,
        });
        const ctTopMat = getTiledMaterial(ctMat, ctW, ctD, 'top');
        const isRoundedFront = Math.abs(ctT - 38) < 0.5;
        const ctSlabMat = ctTopMat?.map ? ctTopMat : ctMat;
        if (isRoundedFront) {
            addRoundedCountertop(targetGroup, ctW, ctT, ctD, ctSlabMat, 0, lower.h + ctT / 2, front / 2, 5);
        } else {
            addPanel(targetGroup, ctW, ctT, ctD, ctTopMat, 0, lower.h + ctT / 2, front / 2);
            // Straight front edge for 12/20 mm countertops, same color as slab.
            addEdgeBand(targetGroup, ctW, ctT, ctD, ctMat, 0, lower.h + ctT / 2, front / 2, 'front');
        }
    }

    buildCarcassSection(group, W, H, D, T, baseY, mat, edgeMat, backWall, backMat) {
        const carcassRender = 2;
        const sideD = carcassSideDepthMm(D, T);
        const innerW = Math.max(1, W - 2 * T);
        const sideY0 = baseY + H / 2;
        const backY0 = baseY + H / 2;

        // Match BOM: full-height sides, bottom/top between sides (no overlap at corners).
        addPanel(group, T, H, sideD, mat, -W / 2 + T / 2, sideY0, 0, { renderOrder: carcassRender });
        addPanel(group, T, H, sideD, mat, W / 2 - T / 2, sideY0, 0, { renderOrder: carcassRender });
        addPanel(group, innerW, T, sideD, mat, 0, baseY + T / 2, 0, { renderOrder: carcassRender });
        addPanel(group, innerW, T, sideD, mat, 0, baseY + H - T / 2, 0, { renderOrder: carcassRender });

        if (backWall) {
            const spec = getBackPanelSpec(W, H, D, T);
            const backDisplayMat = getTiledMaterial(backMat, spec.w, spec.h, 'front');
            addInteriorBackPanel(group, spec.w, spec.h, backDisplayMat?.map ? backDisplayMat : backMat, backY0, spec.z);
        }
    }

    addShelves(group, sec, W, H, D, T, baseY, mat) {
        const innerW = W - 2 * T;
        const innerD = D - 2 * T;
        const countH = Math.max(0, Math.min(5, sec.horizontal || 0));
        const countV = Math.max(0, Math.min(4, sec.vertical || 0));

        const fallbackSpacingH = Math.floor((H - 2 * T) / (countH + 1));
        const spacingH = (sec.spacingH > 0) ? sec.spacingH : fallbackSpacingH;
        for (let i = 1; i <= countH; i += 1) {
            const y = baseY + T + i * spacingH;
            if (y + T > baseY + H - T) break;           // out-of-bounds guard
            addPanel(group, innerW, T, innerD, mat, 0, y, 0);
        }

        const fallbackSpacingV = Math.floor(innerW / (countV + 1));
        const spacingV = (sec.spacingV > 0) ? sec.spacingV : fallbackSpacingV;
        for (let i = 1; i <= countV; i += 1) {
            const x = -innerW / 2 + i * spacingV;
            if (Math.abs(x) > innerW / 2 - T) break;   // out-of-bounds guard
            addPanel(group, T, H - 2 * T, innerD, mat, x, baseY + H / 2, 0);
        }
    }

    addDoor(group, W, H, facadeT, D, centerY, mat, isLift, opts = {}) {
        const carcassT = opts.carcassT || 16;
        const doorW = W - FACADE_GAP * 2;
        const doorH = H - FACADE_GAP * 2;
        const z = facadeFrontCenterZ(D, facadeT, carcassT);
        const doorFaceMat = getTiledMaterial(mat, doorW, doorH, 'front');

        if (!isLift) {
            if (opts.interactive) {
                const hingeSide = opts.hingeSide === 'right' ? 'right' : 'left';
                const openSign = hingeSide === 'right' ? 1 : -1;
                const hingeX = hingeSide === 'right' ? doorW / 2 : -doorW / 2;
                this.addHingedDoor(group, doorW, doorH, facadeT, D, centerY, mat, {
                    hingeX,
                    doorCenterX: 0,
                    openSign,
                    startOpen: opts.startOpen === true,
                    hingeSpec: opts.hingeSpec,
                    cabinetTopY: opts.cabinetTopY,
                    cabinetHeightMm: opts.cabinetHeightMm,
                    facadeZ: z,
                });
            } else {
                addPanel(group, doorW, doorH, facadeT, doorFaceMat, 0, centerY, z);
            }
            return;
        }

        const cabinetTopY = centerY + H / 2;
        const pivotZ = z;
        const pivotGroup = new THREE.Group();
        pivotGroup.position.set(0, cabinetTopY * MM, pivotZ * MM);
        group.add(pivotGroup);

        const doorMesh = addPanel(pivotGroup, doorW, doorH, facadeT, doorFaceMat, 0, -doorH / 2, 0);
        if (doorMesh) doorMesh.renderOrder = 2;
        const openAngle = GAS_LIFT_OPEN_RAD;
        const closedAngle = 0;
        const startT = opts.startOpen === true ? 1 : 0;
        pivotGroup.rotation.x = closedAngle + startT * (openAngle - closedAngle);

        const gasState = {
            group: pivotGroup,
            doorMesh,
            rotationAxis: 'x',
            openAngle,
            closedAngle,
            animSpeed: FACADE_ANIM_SPEED,
            ease: FACADE_ANIM_EASE,
            t: startT,
            targetT: startT,
            baseTargetT: startT,
        };

        if (opts.interactive && doorMesh) {
            doorMesh.userData.baseMaterial = doorMesh.material;
            this.gasLiftDoors.push(gasState);
            this.hoverableMeshes.push({ mesh: doorMesh, kind: 'gasLift', state: gasState });
            this.updateGasLiftDoors(0);
        }
    }

    addHingedDoor(group, doorW, doorH, facadeT, D, centerY, mat, opts = {}) {
        const z = opts.facadeZ ?? facadeFrontCenterZ(D, facadeT, opts.carcassT || 16);
        const hingeX = opts.hingeX ?? -doorW / 2;
        const doorCenterX = opts.doorCenterX ?? 0;
        const openSign = opts.openSign ?? 1;
        const openAngle = openSign * Math.PI * 0.55;
        const closedAngle = 0;
        const startT = opts.startOpen ? 1 : 0;

        const pivotGroup = new THREE.Group();
        pivotGroup.position.set(hingeX * MM, centerY * MM, z * MM);
        group.add(pivotGroup);

        const doorFaceMat = getTiledMaterial(mat, doorW, doorH, 'front');
        const doorMesh = addPanel(pivotGroup, doorW, doorH, facadeT, doorFaceMat, doorCenterX - hingeX, 0, 0);
        pivotGroup.rotation.y = closedAngle + startT * (openAngle - closedAngle);

        const hingeState = {
            group: pivotGroup,
            doorMesh,
            rotationAxis: 'y',
            openAngle,
            closedAngle,
            animSpeed: FACADE_ANIM_SPEED,
            ease: FACADE_ANIM_EASE,
            t: startT,
            targetT: startT,
            baseTargetT: startT,
        };

        if (doorMesh) {
            doorMesh.userData.baseMaterial = doorMesh.material;
            this.hingeDoors.push(hingeState);
            this.hoverableMeshes.push({ mesh: doorMesh, kind: 'hinge', state: hingeState });
        }
    }

    addSplitDoors(group, W, H, facadeT, D, centerY, mat, opts = {}) {
        const carcassT = opts.carcassT || 16;
        const z = facadeFrontCenterZ(D, facadeT, carcassT);
        const gap = FACADE_GAP * 2;
        const leafW = (W - FACADE_GAP * 2 - gap) / 2;
        if (!opts.interactive) {
            const leafH = H - FACADE_GAP * 2;
            const leafMat = getTiledMaterial(mat, leafW, leafH, 'front');
            addPanel(group, leafW, leafH, facadeT, leafMat, -(leafW / 2 + gap / 2), centerY, z);
            addPanel(group, leafW, leafH, facadeT, leafMat, leafW / 2 + gap / 2, centerY, z);
            return;
        }
        const leftCenterX = -(leafW / 2 + gap / 2);
        const rightCenterX = leafW / 2 + gap / 2;
        const doorHm = H - FACADE_GAP * 2;
        const hingePass = {
            hingeSpec: opts.hingeSpec,
            cabinetTopY: opts.cabinetTopY,
            cabinetHeightMm: opts.cabinetHeightMm,
            facadeZ: z,
        };
        this.addHingedDoor(group, leafW, doorHm, facadeT, D, centerY, mat, {
            hingeX: leftCenterX - leafW / 2,
            doorCenterX: leftCenterX,
            openSign: -1,
            ...hingePass,
        });
        this.addHingedDoor(group, leafW, doorHm, facadeT, D, centerY, mat, {
            hingeX: rightCenterX + leafW / 2,
            doorCenterX: rightCenterX,
            openSign: 1,
            ...hingePass,
        });
    }

    addDrawerBox(drawerGroup, innerW, slotH, innerD, cy, spec, innerMat, boxCenterZ = 0) {
        // spec: { sideThick, sideH, sideColor } from drawer system DB
        // slotH — full height of the slot this drawer occupies (cabinet interior / count)
        // boxCenterZ — Z-center of the box so the front face sits just behind the facade
        const sideT   = spec?.sideThick || 16;
        // Use the REAL catalog side height, not the slot height.
        const sideH   = Math.min(spec?.sideH || Math.max(50, slotH - 32), slotH - 20);
        const bottomT = 16;         // chipboard bottom panel, always 16mm
        const runnerGap = 4;        // small clearance at slot bottom for runner bracket

        // Bottom panel: flush with slot bottom + runner clearance
        const bottomY = cy - slotH / 2 + runnerGap + bottomT / 2;
        // Sides sit directly on top of the bottom panel
        const sideY   = bottomY + bottomT / 2 + sideH / 2;

        const sideMat = spec?.sideColor != null
            ? getMaterial('drawer-side', spec.sideColor, { roughness: 0.25, metalness: 0.55 })
            : innerMat;

        // Back panel Z: relative to box center
        const backZ = boxCenterZ - innerD / 2 + sideT / 2;

        // Bottom (chipboard)
        addPanel(drawerGroup, innerW, bottomT, innerD, innerMat, 0, bottomY, boxCenterZ);
        // Sides — aluminum rails at their real catalog height
        addPanel(drawerGroup, sideT, sideH, innerD, sideMat, -innerW / 2 + sideT / 2, sideY, boxCenterZ);
        addPanel(drawerGroup, sideT, sideH, innerD, sideMat,  innerW / 2 - sideT / 2, sideY, boxCenterZ);
        // Back panel (chipboard, same height as sides)
        addPanel(drawerGroup, innerW - 2 * sideT, sideH, sideT, innerMat, 0, sideY, backZ);
    }

    addDrawers(group, W, H, D, facadeT, mat, count, opts = {}) {
        const n    = Math.max(1, Math.min(5, count));
        const spec = opts.drawerSpec || null;   // { sideH, sideThick, gap, sideColor, runners }
        // Per-drawer types array (index 0 = top drawer in user view).
        // 3D renders i=0 at bottom, so user index for 3D slot i is (n-1-i).
        const drawerTypes = opts.drawerTypes || [];

        // Runner length: largest standard ≤ available depth
        const RUNNERS = (spec?.runners) || [250, 300, 350, 400, 450, 500, 550, 600];
        let runnerL = RUNNERS[0];
        for (const l of RUNNERS) { if (l <= D - 24) runnerL = l; }

        const carcassT = opts.carcassT || 16;
        const gap      = spec?.gap ?? 16;       // total lateral clearance consumed by system
        const drawerH  = (H - FACADE_GAP * 2) / n;  // full slot height per drawer
        const frontZ   = carcassFrontFaceZ(D, carcassT);
        const facadeZ  = facadeFrontCenterZ(D, facadeT, carcassT);
        const slideMm  = runnerL * 0.92;        // realistic slide-out distance
        const innerW   = W - 32 - gap;          // 16mm carcass side each side + system clearance
        const innerD   = runnerL;
        const innerMat = getMaterial('drawer-inner', 'ldsp');

        const boxFrontZ  = frontZ - 3;
        const boxCenterZ = boxFrontZ - innerD / 2;

        for (let i = 0; i < n; i += 1) {
            const cy = drawerH * i + drawerH / 2 + FACADE_GAP;
            const drawerGroup = new THREE.Group();
            group.add(drawerGroup);

            const drawerFaceW = W - FACADE_GAP * 2;
            const drawerFaceH = drawerH - 4;
            const drawerFaceMat = getTiledMaterial(mat, drawerFaceW, drawerFaceH, 'front');
            const facadeMesh = addPanel(drawerGroup, drawerFaceW, drawerFaceH, facadeT, drawerFaceMat, 0, cy, facadeZ);
            this.addDrawerBox(drawerGroup, innerW, drawerH, innerD, cy, spec, innerMat, boxCenterZ);

            // Per-drawer push-to-open flag: user index 0 = top = 3D index (n-1)
            const userIdx  = n - 1 - i;
            const isPto    = drawerTypes.length > 0
                ? drawerTypes[userIdx] === 'pto'
                : (spec?.pushToOpen ?? false);

            // Regular drawers get a horizontal bar handle; push-to-open drawers don't
            if (!isPto) {
                const handleW = Math.min(160, (W - FACADE_GAP * 2) * 0.55);
                const handleH = 13;
                const handleD = 10;
                const handleMat = getMaterial('drawer-handle', 0xb8bcc2, { roughness: 0.18, metalness: 0.88 });
                addPanel(drawerGroup, handleW, handleH, handleD, handleMat, 0, cy, facadeZ + facadeT / 2 + handleD / 2);
            }

            if (opts.interactive && facadeMesh) {
                facadeMesh.userData.baseMaterial = facadeMesh.material;
                this.hoverableMeshes.push({ mesh: facadeMesh, kind: 'drawer', drawerIndex: i });
                this.drawerSlides.push({
                    group: drawerGroup,
                    facadeMesh,
                    animSpeed: FACADE_ANIM_SPEED,
                    ease: FACADE_ANIM_EASE,
                    t: 0,
                    targetT: 0,
                    baseTargetT: 0,
                    slideMm,
                });
            }
        }
    }

    buildBed(p) {
        const mattressW = p.width || 1600;
        const bedLen = p.length || 2000;
        const frameH = p.height || 420;
        const headboardH = p.headboardH || 900;
        const footboardH = p.footboardH || frameH;
        const panelT = Math.max(12, p.facadeT || 16);
        const railT = normalizeBedMdfCarcassThicknessMm(p.carcassT || 16);
        const ledgerT = railT;
        const baseType = p.baseType === 'sheet' ? 'sheet' : 'slats';

        const carcassMat = getMaterial('bed-carcass', p.material || 'bed', {
            decorCode: p.carcassDecorCode,
            decorHex: p.carcassDecorHex,
            decorTextureUrl: p.carcassDecorTextureUrl,
            decorTextureMissing: p.carcassDecorTextureMissing,
        });
        const panelMat = getMaterial('bed-facade', p.facadeMaterial || p.material || 'bed-facade', {
            decorCode: p.facadeDecorCode,
            decorHex: p.facadeDecorHex,
            decorTextureUrl: p.facadeDecorTextureUrl,
            decorTextureMissing: p.facadeDecorTextureMissing,
        });
        const mattressMat = getMaterial('mattress', 'mattress', { roughness: 0.92 });

        // Top view: | rail (carcassT) | mattressW | rail (carcassT) |
        const outerW = mattressW + 2 * railT;
        const outerL = bedLen + 2 * panelT;
        const railLen = bedLen;
        const railInnerLeftZ = -mattressW / 2;
        const railInnerRightZ = mattressW / 2;
        const railOuterLeftZ = -outerW / 2;
        const railOuterRightZ = outerW / 2;
        const { centerSupportCount } = getBedCenterSupportConfig(mattressW);

        const stripLayout = getBedDeckStripLayout({
            bedLength: bedLen,
            mattressW,
            ledgerW: LEDGER_W_MM,
            centerSupportCount,
            centerSupportT: ledgerT,
            stripThicknessMm: ledgerT,
        });

        const bedVert = getBedVerticalGeometryMm({
            frameH,
            baseType,
            stripLayout,
            ledgerT,
            mattressNominalT: BED_MATTRESS_THICKNESS_NOMINAL_MM,
        });

        // Headboard / footboard: facade thickness along length, full outer width.
        const headFootW = mattressW + 2 * panelT;
        tagBedMesh(
            addPanel(this.root, panelT, headboardH, headFootW, panelMat, -outerL / 2 + panelT / 2, headboardH / 2, 0),
            0
        );
        tagBedMesh(
            addPanel(this.root, panelT, footboardH, headFootW, panelMat, outerL / 2 - panelT / 2, footboardH / 2, 0),
            0
        );

        // Side rails (царги): carcass board OUTSIDE mattress zone (not on mattress edge).
        // Center Z = ±(mattressW/2 + railT/2) → inner face at ±mattressW/2, outer at ±outerW/2.
        const railCenterY = frameH / 2;
        const railLeftZ = -(mattressW / 2 + railT / 2);
        const railRightZ = mattressW / 2 + railT / 2;
        // Keep exact butt-joint with head/foot panels (no X overhang).
        const railRenderLen = railLen;
        tagBedMesh(addPanel(this.root, railRenderLen, frameH, railT, panelMat, 0, railCenterY, railLeftZ), 1);
        tagBedMesh(addPanel(this.root, railRenderLen, frameH, railT, panelMat, 0, railCenterY, railRightZ), 1);

        // Inner ledgers inset from rail inner face (toward mattress center).
        const ledgerCenterY = bedVert.supportPlaneFromFloor - ledgerT / 2;
        const ledgerLeftZ = railInnerLeftZ + BED_LEDGER_INSET_MM + LEDGER_W_MM / 2;
        const ledgerRightZ = railInnerRightZ - BED_LEDGER_INSET_MM - LEDGER_W_MM / 2;
        tagBedMesh(
            addPanel(this.root, railLen, ledgerT, LEDGER_W_MM, carcassMat, 0, ledgerCenterY, ledgerLeftZ),
            2
        );
        tagBedMesh(
            addPanel(this.root, railLen, ledgerT, LEDGER_W_MM, carcassMat, 0, ledgerCenterY, ledgerRightZ),
            2
        );

        // Center longitudinal supports.
        if (centerSupportCount > 0) {
            const supportH = bedVert.centerSupportHeightMm;
            const ledgerSeatLeftZ = ledgerLeftZ + LEDGER_W_MM / 2;
            const ledgerSeatRightZ = ledgerRightZ - LEDGER_W_MM / 2;
            const supportZoneW = ledgerSeatRightZ - ledgerSeatLeftZ;
            for (let i = 0; i < centerSupportCount; i += 1) {
                const z = ledgerSeatLeftZ + ((i + 1) * supportZoneW) / (centerSupportCount + 1);
                tagBedMesh(
                    addPanel(this.root, railLen, supportH, ledgerT, carcassMat, 0, supportH / 2, z),
                    2
                );
            }
        }

        const deckCenterY = bedVert.supportPlaneFromFloor + bedVert.deckT / 2;
        const deckSpanZ = Math.max(200, stripLayout.stripSupportSpanW - 2 * BED_LEDGER_INSET_MM);
        const deckRunL = Math.min(stripLayout.innerBedLength, railLen - 4);
        if (baseType === 'sheet') {
            tagBedMesh(
                addPanel(this.root, deckRunL, bedVert.deckT, deckSpanZ, carcassMat, 0, deckCenterY, 0),
                2
            );
        } else {
            const { stripWidthW, stripAlongCount, stripActualGap } = stripLayout;
            const stripRunStartX = -deckRunL / 2 + stripWidthW / 2;
            for (let i = 0; i < stripAlongCount; i += 1) {
                const x = stripRunStartX + i * (stripWidthW + stripActualGap);
                tagBedMesh(
                    addPanel(this.root, stripWidthW, bedVert.deckT, deckSpanZ, carcassMat, x, deckCenterY, 0),
                    2
                );
            }
        }

        // Mattress stays inside rail inner faces (mattressW), never in the rail strip.
        const mattressDrawW = Math.max(200, mattressW - 2 * BED_MATTRESS_SIDE_CLEAR_MM);
        const mattressDrawL = Math.max(200, railLen - 2 * BED_MATTRESS_SIDE_CLEAR_MM);
        const mattressLiftMm = 1;
        const mattressCenterY = bedVert.deckTopFromFloor + mattressLiftMm + bedVert.mattressNominalT / 2;
        const mattressMesh = addPanel(
            this.root,
            mattressDrawL,
            bedVert.mattressNominalT,
            mattressDrawW,
            mattressMat,
            0,
            mattressCenterY,
            0
        );
        if (mattressMesh) {
            mattressMesh.renderOrder = 20;
        }
    }

    setThemeBackground() {
        if (this.scene) this.scene.background.setHex(sceneBackground());
        if (this.lastParams) this.buildDimensions(this.lastParams, this.getModelBoundsMm());
    }

    dispose() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
        this.resizeObs?.disconnect();
        this.visibilityObs?.disconnect();
        this.clearDimGroup();
        if (this.root) {
            while (this.root.children.length) {
                const c = this.root.children[0];
                this.root.remove(c);
                disposeObject(c);
            }
        }
        this.controls?.dispose();
        this.renderer?.domElement?.removeEventListener('pointerdown', this._onPointerDown);
        this.renderer?.domElement?.removeEventListener('pointerup', this._onPointerUp);
        this.renderer?.domElement?.removeEventListener('pointermove', this._onPointerMove);
        this.renderer?.domElement?.removeEventListener('pointerleave', this._onPointerLeave);
        this.renderer?.domElement?.removeEventListener('wheel', this._onWheel);
        this.labelRenderer?.domElement?.remove();
        this.labelRenderer = null;
        this.renderer?.dispose();
        if (this.renderer?.domElement?.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
    }
}

let instance = null;

function ensureInstance() {
    const el = document.getElementById('furniture-3d');
    if (!el) return null;
    if (!instance) instance = new Furniture3D(el);
    if (!instance.renderer) instance.init();
    return instance;
}

window.GConfig3D = {
    init() {
        return ensureInstance();
    },
    scheduleRebuild(params) {
        const inst = ensureInstance();
        inst?.scheduleRebuild(params);
    },
    rebuildModel(params) {
        const inst = ensureInstance();
        inst?.rebuildModel(params);
    },
    onThemeChange() {
        instance?.setThemeBackground();
    },
    resize() {
        instance?.onResize();
    },
    setDimensionsVisible(visible) {
        instance?.setDimensionsVisible(visible);
    },
    setTexturesVisible(visible) {
        instance?.setTexturesVisible(visible);
    },
    setOptions(opts) {
        instance?.setOptions(opts);
    },
    setMobileExpanded(expanded) {
        instance?.setMobileExpanded(expanded);
    },
    dispose() {
        instance?.dispose();
        instance = null;
    },
};

