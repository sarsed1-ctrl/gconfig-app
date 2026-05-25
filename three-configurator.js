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
const FACADE_GAP = 3;
/** Gas-lift flip-up door open angle (degrees from closed). */
const GAS_LIFT_OPEN_DEG = 135;
const GAS_LIFT_OPEN_RAD = -(GAS_LIFT_OPEN_DEG * Math.PI) / 180;
const LEDGER_W_MM = 40;

/** Sync with configurator.html v1 bed math. */
const BED_MAX_MATTRESS_PROTRUSION_ABOVE_RAIL_MM = 60;
const BED_MATTRESS_THICKNESS_NOMINAL_MM = 250;
const BED_LEDGER_TOP_OFFSET_DESIGN_MM = 8;
const BED_RAIL_SOLID_BOTTOM_MIN_MM = 20;
const BED_SHEET_BASE_THICKNESS_MM = 16;
const BED_MDF_CARCASS_THICKNESS_MM = [16, 18, 19, 25, 28];

/** @type {Map<string, THREE.Material>} */
const materialPool = new Map();
/** Shared unit box — meshes use scale for dimensions (geometry reuse). */
const unitBox = new THREE.BoxGeometry(1, 1, 1);
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

function hashColor(key, fallback = 0xc8b496) {
    if (!key) return new THREE.Color(fallback);
    let h = 0;
    for (let i = 0; i < key.length; i += 1) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
    const hue = 0.07 + ((Math.abs(h) % 1000) / 1000) * 0.12;
    return new THREE.Color().setHSL(hue, 0.28, 0.68);
}

function getMaterial(name, hexOrKey, opts = {}) {
    const id = `${name}:${hexOrKey}:${opts.edge ? 1 : 0}:${opts.emissive ? 1 : 0}:${opts.transparent ? 1 : 0}`;
    if (materialPool.has(id)) return materialPool.get(id);
    const color = typeof hexOrKey === 'number' ? new THREE.Color(hexOrKey) : hashColor(String(hexOrKey));
    if (opts.edge) color.offsetHSL(0.02, 0.08, -0.06);
    if (name === 'facade' || name === 'bed-facade') color.offsetHSL(0, -0.04, 0.1);
    if (name === 'facade-door') color.offsetHSL(0, -0.06, 0.14);
    if (name === 'countertop') color.offsetHSL(0, -0.06, -0.1);
    if (name === 'mattress') color.offsetHSL(0, -0.02, 0.06);
    const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.72,
        metalness: opts.metalness ?? 0.04,
        emissive: opts.emissive ? color.clone().multiplyScalar(0.08) : 0x000000,
        transparent: !!opts.transparent,
        opacity: opts.opacity ?? 1,
    });
    materialPool.set(id, mat);
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

function setFacadeHighlight(mesh, on) {
    if (!mesh) return;
    if (!mesh.userData.baseMaterial) mesh.userData.baseMaterial = mesh.material;
    if (on) {
        if (!mesh.userData.hoverMaterial) {
            mesh.userData.hoverMaterial = mesh.userData.baseMaterial.clone();
            mesh.userData.hoverMaterial.emissive.setHex(isNeonTheme() ? 0x22ff88 : 0x448866);
            mesh.userData.hoverMaterial.emissiveIntensity = 0.35;
        }
        mesh.material = mesh.userData.hoverMaterial;
    } else {
        mesh.material = mesh.userData.baseMaterial;
    }
}

function addPanel(group, w, h, d, mat, x, y, z) {
    if (w <= 0 || h <= 0 || d <= 0) return null;
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.scale.set(w * MM, h * MM, d * MM);
    mesh.position.set(x * MM, y * MM, z * MM);
    group.add(mesh);
    return mesh;
}

/** Thin edge-band hint on one visible face (procedural, no CSG). */
function addEdgeBand(group, w, h, d, mat, x, y, z, face = 'front') {
    const band = 1.5;
    switch (face) {
        case 'top':
            return addPanel(group, w, band, d, mat, x, y + h / 2 - band / 2, z);
        case 'front':
            return addPanel(group, w, h, band, mat, x, y, z + d / 2 - band / 2);
        case 'side':
            return addPanel(group, band, h, d, mat, x + w / 2 - band / 2, y, z);
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

function disposeObject(obj) {
    if (!obj) return;
    obj.traverse((child) => {
        if (child.geometry && child.geometry !== unitBox) child.geometry.dispose();
        if (child.material && child.material !== unitBox && child.userData?.isDimLine) {
            /* line materials cached */
        }
    });
}

function getDimLineMaterial(colorHex) {
    const key = String(colorHex);
    if (dimLineMatCache.has(key)) return dimLineMatCache.get(key);
    const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.92 });
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
        this.mobileExpanded = false;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.gasLiftDoors = [];
        this.hingeDoors = [];
        this.hoverableMeshes = [];
        this.drawerSlides = [];
        this.hoveredMesh = null;
        this.hoveredEntry = null;
        this._clickPending = null;
        this._pickMoveTimer = 0;
        this._onPointerDown = (e) => this.handlePointerDown(e);
        this._onPointerUp = (e) => this.handlePointerUp(e);
        this._onPointerMove = (e) => this.handlePointerMove(e);
        this._onPointerLeave = () => this.handlePointerLeave();
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
    }

    setOptions(opts = {}) {
        if (typeof opts.quality === 'string') {
            this.isMobile = opts.quality === 'mobile' || detectMobile();
        }
        if (typeof opts.mobileExpanded === 'boolean') {
            this.mobileExpanded = opts.mobileExpanded;
        }
        if (typeof opts.dimensionsVisible === 'boolean') {
            this.dimensionsVisible = opts.dimensionsVisible;
        }
        if (this.dimGroup) this.dimGroup.visible = this.dimensionsVisible;
        if (this.renderer) {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.25 : 2));
        }
        this.applyControlProfile();
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

    handlePointerMove(event) {
        if (this._clickPending) return;
        const now = performance.now();
        if (now - this._pickMoveTimer < 48) return;
        this._pickMoveTimer = now;
        const picked = this.pickInteractable(event);
        const mesh = picked?.mesh ?? null;
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
        const picked = this.pickInteractable(event);
        if (!picked) return;
        this._clickPending = picked;
        this.controls.enabled = false;
    }

    handlePointerUp(event) {
        if (event.button !== 0) return;
        if (this._clickPending) {
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
        const attachScratch = new THREE.Vector3();
        for (const lift of this.gasLiftDoors) {
            const eased = this.animateDoorState(lift, deltaSec);
            if (!lift.strutSpecs?.length) continue;
            lift.group.updateMatrixWorld(true);
            const showStruts = eased > 0.08;
            lift.strutSpecs.forEach(({ rod, x, rodR, cabinetAttachY, cabinetAttachZ, side }) => {
                if (!showStruts) {
                    rod.visible = false;
                    return;
                }
                const attachLocal = side < 0 ? lift.attachLocalLeft : lift.attachLocalRight;
                attachScratch.copy(attachLocal).applyMatrix4(lift.group.matrixWorld);
                setRodEndpoints(
                    rod,
                    x,
                    cabinetAttachY,
                    cabinetAttachZ,
                    attachScratch.x / MM,
                    attachScratch.y / MM,
                    attachScratch.z / MM,
                    rodR
                );
            });
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
        if (!bounds) return;
        this.buildGenericDimensions(params, bounds);
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
        const pad = 80;

        const lowerH = params.height || 500;
        const upperH = params.upperHeight || 400;
        const lowerW = params.width || 800;
        const upperW = params.upperWidth || lowerW;
        const lowerD = params.depth || 450;
        const upperD = params.upperDepth || lowerD;
        const ctT = params.countertop?.enabled && params.countertop.thickness > 0
            ? params.countertop.thickness
            : 0;
        const stackGap = 400;
        const upperBaseY = lowerH + ctT + stackGap;

        const wMm = Math.round(Math.max(lowerW, upperW));
        const dMm = Math.round(Math.max(lowerD, upperD));
        const upperHm = Math.round(upperH);
        const lowerHm = Math.round(lowerH);
        const stackH = Math.round(upperBaseY + upperH);

        const min = bounds?.min ?? { x: -wMm / 2, y: 0, z: -lowerD / 2 };
        const max = bounds?.max ?? { x: wMm / 2, y: stackH, z: lowerD / 2 };

        const summary = lang === 'en'
            ? `${wMm} × ${upperHm} × ${dMm} ${unit}`
            : `${wMm} × ${upperHm} × ${dMm} ${unit}`;

        const summaryLabel = createDimLabel(summary, 'gconfig-dim-summary');
        summaryLabel.position.set(0, (upperBaseY + upperH) * MM + 0.12, 0);
        this.dimGroup.add(summaryLabel);

        const yBase = min.y - pad * 0.35;
        const zFront = max.z + pad * 0.55;
        const xRight = max.x + pad * 0.45;
        const zDim = (min.z + max.z) / 2;

        addDimensionLine(
            this.dimGroup,
            [[min.x, yBase, zFront], [max.x, yBase, zFront]],
            color
        );
        const lenLabel = createDimLabel(`${dMm} ${unit}`);
        lenLabel.position.set(((min.x + max.x) / 2) * MM, yBase * MM - 0.03, zFront * MM);
        this.dimGroup.add(lenLabel);

        const upperY0 = upperBaseY;
        const upperY1 = upperBaseY + upperH;
        addDimensionLine(
            this.dimGroup,
            [[xRight, upperY0, zDim], [xRight, upperY1, zDim]],
            color
        );
        const upperLabel = createDimLabel(`${upperHm} ${unit}`, 'gconfig-dim-upper');
        upperLabel.position.set(xRight * MM + 0.03, ((upperY0 + upperY1) / 2) * MM, zDim * MM);
        this.dimGroup.add(upperLabel);

        const lowerY0 = 0;
        const lowerY1 = lowerH;
        addDimensionLine(
            this.dimGroup,
            [[xRight, lowerY0, zDim], [xRight, lowerY1, zDim]],
            color
        );
        const lowerLabel = createDimLabel(`${lowerHm} ${unit}`, 'gconfig-dim-lower');
        lowerLabel.position.set(xRight * MM + 0.03, ((lowerY0 + lowerY1) / 2) * MM, zDim * MM);
        this.dimGroup.add(lowerLabel);

        addDimensionLine(
            this.dimGroup,
            [[xRight, yBase, min.z], [xRight, yBase, max.z]],
            color
        );
        const wLabel = createDimLabel(`${wMm} ${unit}`);
        wLabel.position.set(xRight * MM + 0.03, yBase * MM - 0.03, ((min.z + max.z) / 2) * MM);
        this.dimGroup.add(wLabel);
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

        this.lastParams = params;
        if (params.quality === 'mobile') this.isMobile = true;
        if (typeof params.dimensionsVisible === 'boolean') {
            this.dimensionsVisible = params.dimensionsVisible;
        }
        this.lastKey = JSON.stringify(params);

        this.scene.background.setHex(sceneBackground());
        this.gasLiftDoors = [];
        this.hingeDoors = [];
        this.drawerSlides = [];
        this.hoverableMeshes = [];
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
        this.camera.position.set(center.x + dist * 0.55, center.y + dist * 0.35, center.z + dist * 0.75);
        this.controls.update();
    }

    buildCloset(p) {
        const T = Math.max(12, p.carcassT || 16);
        const facadeT = Math.max(12, p.facadeT || 16);
        const carcassMat = getMaterial('carcass', p.material || 'ldsp');
        const edgeMat = getMaterial('edge', p.edge || p.material || 'edge', { edge: true });
        const doorMat = getMaterial('facade-door', p.facadeMaterial || p.material || 'facade-door');
        const backMat = getMaterial('back', 0xd8dde0);
        const gap = 400;

        const lower = { w: p.width || 800, h: p.height || 500, d: p.depth || 450 };
        const upper = {
            w: p.upperWidth || lower.w,
            h: p.upperHeight || 400,
            d: p.upperDepth || lower.d,
        };
        const ctT = p.countertop?.enabled && p.countertop.thickness > 0
            ? p.countertop.thickness
            : 0;
        const upperBaseY = lower.h + ctT + gap;

        this.buildCarcassSection(this.root, lower.w, lower.h, lower.d, T, 0, carcassMat, edgeMat, p.backWall, backMat);
        if (ctT > 0) this.buildCountertop(p, lower, edgeMat);
        this.buildCarcassSection(this.root, upper.w, upper.h, upper.d, T, upperBaseY, carcassMat, edgeMat, p.backWall, backMat);

        const shelfDefs = Array.isArray(p.shelves) ? p.shelves : [];
        shelfDefs.forEach((sec) => {
            const baseY = sec.zone === 'upper' ? upperBaseY : 0;
            const sw = sec.w || lower.w;
            const sh = sec.h || lower.h;
            const sd = sec.d || lower.d;
            this.addShelves(this.root, sec, sw, sh, sd, T, baseY, carcassMat);
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

        if (upperMode === 'gas') {
            this.addDoor(this.root, upper.w, upper.h, facadeT, upper.d, upperCenterY, doorMat, true, { interactive: true, startOpen: true });
        } else if (upperMode === 'hinge') {
            const upperPos = p.hinges?.upper?.position || 'both';
            this.addDoor(this.root, upper.w, upper.h, facadeT, upper.d, upperCenterY, doorMat, false, {
                interactive: true,
                hingeSide: upperPos === 'right' ? 'right' : 'left',
                ...upperHingeOpts,
            });
        }

        if (lowerMode === 'drawer' || p.drawers?.enabled) {
            this.addDrawers(this.root, lower.w, lower.h, lower.d, facadeT, doorMat, p.drawers?.count || 1, { interactive: true });
        } else if (lowerMode === 'gas') {
            this.addDoor(this.root, lower.w, lower.h, facadeT, lower.d, lowerCenterY, doorMat, true, { interactive: true, startOpen: true });
        } else if (lowerMode === 'hinge') {
            if (p.lowerSplitDoor) {
                this.addSplitDoors(this.root, lower.w, lower.h, facadeT, lower.d, lowerCenterY, doorMat, {
                    interactive: true,
                    ...lowerHingeOpts,
                });
            } else {
                const lowerPos = p.hinges?.lower?.position || 'left';
                this.addDoor(this.root, lower.w, lower.h, facadeT, lower.d, lowerCenterY, doorMat, false, {
                    interactive: true,
                    hingeSide: lowerPos === 'right' ? 'right' : 'left',
                    ...lowerHingeOpts,
                });
            }
        }
    }

    buildCountertop(p, lower, edgeMat) {
        const ct = p.countertop || {};
        const ctT = ct.thickness > 0 ? ct.thickness : 0;
        if (!ctT) return;
        const front = ct.frontOverhang || 0;
        const side = ct.sideOverhang || 0;
        const ctW = lower.w + side * 2;
        const ctD = lower.d + front;
        const ctMat = getMaterial('countertop', ct.material || 'countertop');
        addPanel(this.root, ctW, ctT, ctD, ctMat, 0, lower.h + ctT / 2, front / 2);
        addEdgeBand(this.root, ctW, ctT, ctD, edgeMat, 0, lower.h + ctT / 2, front / 2, 'front');
    }

    buildCarcassSection(group, W, H, D, T, baseY, mat, edgeMat, backWall, backMat) {
        const y0 = baseY + H / 2;
        addPanel(group, T, H, D, mat, -W / 2 + T / 2, y0, 0);
        addPanel(group, T, H, D, mat, W / 2 - T / 2, y0, 0);
        addPanel(group, W, T, D, mat, 0, baseY + T / 2, 0);
        addPanel(group, W, T, D, mat, 0, baseY + H - T / 2, 0);
        addPanel(group, W, H, T, edgeMat, 0, y0, -D / 2 + T / 2);
        addEdgeBand(group, W, H, T, edgeMat, 0, y0, -D / 2 + T / 2, 'front');
        if (backWall) addPanel(group, W - 2 * T, H - 2 * T, 4, backMat, 0, y0, -D / 2 + T + 2);
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
        const doorW = W - FACADE_GAP * 2;
        const doorH = H - FACADE_GAP * 2;
        const z = D / 2 + facadeT / 2 + 2;

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
                addPanel(group, doorW, doorH, facadeT, mat, 0, centerY, z);
            }
            return;
        }

        const cabinetTopY = centerY + H / 2;
        const pivotZ = D / 2 + facadeT / 2 + 2;
        const pivotGroup = new THREE.Group();
        pivotGroup.position.set(0, cabinetTopY * MM, pivotZ * MM);
        group.add(pivotGroup);

        const doorMesh = addPanel(pivotGroup, doorW, doorH, facadeT, mat, 0, -doorH / 2, 0);
        if (doorMesh) doorMesh.renderOrder = 2;
        const openAngle = GAS_LIFT_OPEN_RAD;
        const closedAngle = 0;
        const startT = opts.startOpen !== false ? 1 : 0;
        pivotGroup.rotation.x = closedAngle + startT * (openAngle - closedAngle);

        const strutMat = getMaterial('gas-strut', 0x707880, { metalness: 0.55, roughness: 0.38 });
        const strutX = W / 2 - 48;
        const rodR = 3.5;
        const cabinetAttachY = cabinetTopY - Math.min(28, H * 0.08);
        const cabinetAttachZ = D / 2 - 22;
        const doorAttachFromTop = doorH * 0.22;
        /** Inner face of door (toward cabinet) — keeps struts behind the facade, not through it. */
        const doorInnerZMm = -(facadeT / 2 + 4);
        const doorAttachY = cabinetTopY - doorAttachFromTop;
        const doorAttachZ = pivotZ + doorInnerZMm;
        const attachLocalLeft = new THREE.Vector3(-strutX * MM, -doorAttachFromTop * MM, doorInnerZMm * MM);
        const attachLocalRight = new THREE.Vector3(strutX * MM, -doorAttachFromTop * MM, doorInnerZMm * MM);

        const gasState = {
            group: pivotGroup,
            doorMesh,
            rotationAxis: 'x',
            openAngle,
            closedAngle,
            animSpeed: FACADE_ANIM_SPEED,
            ease: FACADE_ANIM_EASE,
            attachLocalLeft,
            attachLocalRight,
            t: startT,
            targetT: startT,
            baseTargetT: startT,
            strutSpecs: [],
        };

        if (opts.interactive && doorMesh) {
            const strutSpecs = [];
            [-1, 1].forEach((side) => {
                const x = side * strutX;
                const rod = addRod(
                    group,
                    x,
                    cabinetAttachY,
                    cabinetAttachZ,
                    x,
                    doorAttachY,
                    doorAttachZ,
                    rodR,
                    strutMat
                );
                rod.renderOrder = 0;
                strutSpecs.push({ rod, x, rodR, cabinetAttachY, cabinetAttachZ, side });
            });
            gasState.strutSpecs = strutSpecs;
            doorMesh.userData.baseMaterial = mat;
            this.gasLiftDoors.push(gasState);
            this.hoverableMeshes.push({ mesh: doorMesh, kind: 'gasLift', state: gasState });
        } else {
            [-1, 1].forEach((side) => {
                const x = side * strutX;
                const rod = addRod(group, x, cabinetAttachY, cabinetAttachZ, x, doorAttachY, doorAttachZ, rodR, strutMat);
                rod.renderOrder = 0;
            });
        }
    }

    addHingedDoor(group, doorW, doorH, facadeT, D, centerY, mat, opts = {}) {
        const z = D / 2 + facadeT / 2 + 2;
        const hingeX = opts.hingeX ?? -doorW / 2;
        const doorCenterX = opts.doorCenterX ?? 0;
        const openSign = opts.openSign ?? 1;
        const openAngle = openSign * Math.PI * 0.55;
        const closedAngle = 0;
        const startT = opts.startOpen ? 1 : 0;

        const pivotGroup = new THREE.Group();
        pivotGroup.position.set(hingeX * MM, centerY * MM, z * MM);
        group.add(pivotGroup);

        const doorMesh = addPanel(pivotGroup, doorW, doorH, facadeT, mat, doorCenterX - hingeX, 0, 0);
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
            doorMesh.userData.baseMaterial = mat;
            addEdgeBand(pivotGroup, doorW, doorH, facadeT, getMaterial('edge', 'facade-edge', { edge: true }), doorCenterX - hingeX, 0, 0, 'side');
            this.hingeDoors.push(hingeState);
            this.hoverableMeshes.push({ mesh: doorMesh, kind: 'hinge', state: hingeState });
        }
    }

    addSplitDoors(group, W, H, facadeT, D, centerY, mat, opts = {}) {
        const gap = FACADE_GAP * 2;
        const leafW = (W - FACADE_GAP * 2 - gap) / 2;
        if (!opts.interactive) {
            const z = D / 2 + facadeT / 2 + 2;
            addPanel(group, leafW, H - FACADE_GAP * 2, facadeT, mat, -(leafW / 2 + gap / 2), centerY, z);
            addPanel(group, leafW, H - FACADE_GAP * 2, facadeT, mat, leafW / 2 + gap / 2, centerY, z);
            return;
        }
        const leftCenterX = -(leafW / 2 + gap / 2);
        const rightCenterX = leafW / 2 + gap / 2;
        const doorHm = H - FACADE_GAP * 2;
        const hingePass = {
            hingeSpec: opts.hingeSpec,
            cabinetTopY: opts.cabinetTopY,
            cabinetHeightMm: opts.cabinetHeightMm,
            facadeZ: D / 2 + facadeT / 2 + 2,
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

    addDrawerBox(drawerGroup, innerW, innerH, innerD, cy, wallT, mat) {
        const sideH = innerH - wallT;
        const sideY = cy - wallT / 2;
        addPanel(drawerGroup, innerW, wallT, innerD, mat, 0, cy - innerH / 2 + wallT / 2, 0);
        addPanel(drawerGroup, wallT, sideH, innerD, mat, -innerW / 2 + wallT / 2, sideY, 0);
        addPanel(drawerGroup, wallT, sideH, innerD, mat, innerW / 2 - wallT / 2, sideY, 0);
        addPanel(drawerGroup, innerW - 2 * wallT, sideH, wallT, mat, 0, sideY, -innerD / 2 + wallT / 2);
    }

    addDrawers(group, W, H, D, facadeT, mat, count, opts = {}) {
        const n = Math.max(1, Math.min(5, count));
        const drawerH = (H - FACADE_GAP * 2) / n;
        const facadeZ = D / 2 + facadeT / 2 + 2;
        const slideMm = 0.72 * (D - 24);
        const innerW = W - 16;
        const innerH = drawerH - 12;
        const innerD = D - 24;
        const wallT = 16;
        const innerMat = getMaterial('drawer-inner', 'ldsp');

        for (let i = 0; i < n; i += 1) {
            const cy = drawerH * i + drawerH / 2 + FACADE_GAP;
            const drawerGroup = new THREE.Group();
            group.add(drawerGroup);

            const facadeMesh = addPanel(drawerGroup, W - FACADE_GAP * 2, drawerH - 4, facadeT, mat, 0, cy, facadeZ);
            this.addDrawerBox(drawerGroup, innerW, innerH, innerD, cy, wallT, innerMat);

            if (opts.interactive && facadeMesh) {
                facadeMesh.userData.baseMaterial = mat;
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
        const railT = Math.max(12, p.facadeT || 16);
        const ledgerT = normalizeBedMdfCarcassThicknessMm(p.carcassT || 16);
        const baseType = p.baseType === 'sheet' ? 'sheet' : 'slats';

        const carcassMat = getMaterial('bed-carcass', p.material || 'bed');
        const facadeMat = getMaterial('bed-facade', p.facadeMaterial || p.material || 'bed-facade');
        const edgeMat = getMaterial('bed-edge', p.edge || p.material || 'edge', { edge: true });
        const mattressMat = getMaterial('mattress', 'mattress', { roughness: 0.92 });

        const outerW = mattressW + 2 * railT;
        const outerL = bedLen + 2 * railT;
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

        // Headboard / footboard on floor (Y=0), full outer width.
        addPanel(this.root, railT, headboardH, outerW, facadeMat, -outerL / 2 + railT / 2, headboardH / 2, 0);
        addPanel(this.root, railT, footboardH, outerW, facadeMat, outerL / 2 - railT / 2, footboardH / 2, 0);
        addEdgeBand(this.root, railT, headboardH, outerW, edgeMat, -outerL / 2 + railT / 2, headboardH / 2, 0, 'top');
        addEdgeBand(this.root, railT, footboardH, outerW, edgeMat, outerL / 2 - railT / 2, footboardH / 2, 0, 'top');

        // Side rails between head/foot panels, sitting on floor.
        const railCenterY = frameH / 2;
        addPanel(this.root, bedLen, frameH, railT, facadeMat, 0, railCenterY, -mattressW / 2 + railT / 2);
        addPanel(this.root, bedLen, frameH, railT, facadeMat, 0, railCenterY, mattressW / 2 - railT / 2);
        addEdgeBand(this.root, bedLen, frameH, railT, edgeMat, 0, railCenterY, -mattressW / 2 + railT / 2, 'top');
        addEdgeBand(this.root, bedLen, frameH, railT, edgeMat, 0, railCenterY, mattressW / 2 - railT / 2, 'top');

        // Inner ledgers (cleats) — top face at supportPlaneFromFloor.
        const ledgerCenterY = bedVert.supportPlaneFromFloor - ledgerT / 2;
        const ledgerLeftZ = -mattressW / 2 + railT + LEDGER_W_MM / 2;
        const ledgerRightZ = mattressW / 2 - railT - LEDGER_W_MM / 2;
        addPanel(this.root, bedLen, ledgerT, LEDGER_W_MM, carcassMat, 0, ledgerCenterY, ledgerLeftZ);
        addPanel(this.root, bedLen, ledgerT, LEDGER_W_MM, carcassMat, 0, ledgerCenterY, ledgerRightZ);

        // Center longitudinal supports.
        if (centerSupportCount > 0) {
            const supportH = bedVert.centerSupportHeightMm;
            const ledgerSeatLeftZ = -mattressW / 2 + railT + LEDGER_W_MM;
            const ledgerSeatRightZ = mattressW / 2 - railT - LEDGER_W_MM;
            const supportZoneW = ledgerSeatRightZ - ledgerSeatLeftZ;
            for (let i = 0; i < centerSupportCount; i += 1) {
                const z = ledgerSeatLeftZ + ((i + 1) * supportZoneW) / (centerSupportCount + 1);
                addPanel(this.root, bedLen, supportH, ledgerT, carcassMat, 0, supportH / 2, z);
            }
        }

        const deckCenterY = bedVert.supportPlaneFromFloor + bedVert.deckT / 2;

        if (baseType === 'sheet') {
            const sheetL = stripLayout.innerBedLength;
            const sheetW = Math.max(300, stripLayout.stripSupportSpanW);
            addPanel(this.root, sheetL, bedVert.deckT, sheetW, carcassMat, 0, deckCenterY, 0);
        } else {
            const { stripWidthW, stripLengthL, stripAlongCount, stripActualGap, innerBedLength } = stripLayout;
            const stripRunStartX = -innerBedLength / 2 + stripWidthW / 2;
            for (let i = 0; i < stripAlongCount; i += 1) {
                const x = stripRunStartX + i * (stripWidthW + stripActualGap);
                addPanel(this.root, stripWidthW, bedVert.deckT, stripLengthL, carcassMat, x, deckCenterY, 0);
            }
        }

        const mattressCenterY = bedVert.deckTopFromFloor + bedVert.mattressNominalT / 2;
        addPanel(this.root, bedLen, bedVert.mattressNominalT, mattressW, mattressMat, 0, mattressCenterY, 0);
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
