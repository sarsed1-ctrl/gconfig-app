/**
 * GConfig v2 — procedural Three.js furniture preview
 * ES module; exposes window.GConfig3D for script-v2.js (IIFE bridge).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MM = 0.001;
const REBUILD_MS = 120;
const LERP_SPEED = 0.12;
const LIFT_LERP = 0.1;

/** @type {Map<string, THREE.Material>} */
const materialPool = new Map();
/** Shared unit box — meshes use scale for dimensions (geometry reuse). */
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function hashColor(key, fallback = 0xc8b496) {
    if (!key) return new THREE.Color(fallback);
    let h = 0;
    for (let i = 0; i < key.length; i += 1) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
    const hue = 0.07 + ((Math.abs(h) % 1000) / 1000) * 0.12;
    return new THREE.Color().setHSL(hue, 0.28, 0.68);
}

function getMaterial(name, hexOrKey, opts = {}) {
    const id = `${name}:${hexOrKey}:${opts.edge ? 1 : 0}:${opts.emissive ? 1 : 0}`;
    if (materialPool.has(id)) return materialPool.get(id);
    const color = typeof hexOrKey === 'number' ? new THREE.Color(hexOrKey) : hashColor(String(hexOrKey));
    if (opts.edge) color.offsetHSL(0.02, 0.08, -0.06);
    if (name === 'facade' || name === 'bed-facade') color.offsetHSL(0, -0.04, 0.1);
    if (name === 'facade-door') color.offsetHSL(0, -0.06, 0.14);
    if (name === 'countertop') color.offsetHSL(0, -0.06, -0.1);
    const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.72,
        metalness: opts.metalness ?? 0.04,
        emissive: opts.emissive ? color.clone().multiplyScalar(0.08) : 0x000000,
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
    if (w <= 0 || h <= 0 || d <= 0) return;
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.scale.set(w * MM, h * MM, d * MM);
    mesh.position.set(x * MM, y * MM, z * MM);
    group.add(mesh);
    return mesh;
}

/** Thin cylinder between two mm-space points (gas struts, etc.). */
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
    });
}

class Furniture3D {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.root = null;
        this.animFrom = 0.98;
        this.animT = 1;
        this.rebuildTimer = null;
        this.raf = 0;
        this.resizeObs = null;
        this.lastKey = '';
        this.running = false;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        /** @type {object[]} */
        this.gasLiftDoors = [];
        /** @type {object[]} */
        this.hingeDoors = [];
        /** @type {{ mesh: THREE.Mesh, kind: string, drawerIndex?: number, state?: object }[]} */
        this.hoverableMeshes = [];
        /** @type {{ group: THREE.Group, facadeMesh: THREE.Mesh, t: number, targetT: number, slideMm: number }[]} */
        this.drawerSlides = [];
        this.hoveredMesh = null;
        /** @type {{ mesh: THREE.Mesh, kind: string, drawerIndex?: number } | null} */
        this._clickPending = null;
        this._onPointerDown = (e) => this.handlePointerDown(e);
        this._onPointerUp = (e) => this.handlePointerUp(e);
        this._onPointerMove = (e) => this.handlePointerMove(e);
        this._onPointerLeave = () => this.handlePointerLeave();
    }

    init() {
        if (!this.container || this.renderer) return;

        const w = Math.max(1, this.container.clientWidth);
        const h = Math.max(1, this.container.clientHeight);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(sceneBackground());

        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.05, 80);
        this.camera.position.set(1.6, 1.1, 2.2);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(w, h, false);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 0.4;
        this.controls.maxDistance = 8;
        this.controls.target.set(0, 0.5, 0);

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
        ground.receiveShadow = false;
        this.scene.add(ground);

        this.root = new THREE.Group();
        this.scene.add(this.root);

        this.resizeObs = new ResizeObserver(() => this.onResize());
        this.resizeObs.observe(this.container);

        this.renderer.domElement.style.cursor = 'default';
        this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
        this.renderer.domElement.addEventListener('pointerup', this._onPointerUp);
        this.renderer.domElement.addEventListener('pointermove', this._onPointerMove);
        this.renderer.domElement.addEventListener('pointerleave', this._onPointerLeave);

        this.running = true;
        this.loop();
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
        const picked = this.pickInteractable(event);
        const mesh = picked?.mesh ?? null;
        if (mesh === this.hoveredMesh) {
            this.renderer.domElement.style.cursor = mesh ? 'pointer' : 'default';
            return;
        }
        if (this.hoveredMesh) setFacadeHighlight(this.hoveredMesh, false);
        this.hoveredMesh = mesh;
        if (mesh) setFacadeHighlight(mesh, true);
        this.renderer.domElement.style.cursor = mesh ? 'pointer' : 'default';
    }

    handlePointerLeave() {
        if (this.hoveredMesh) {
            setFacadeHighlight(this.hoveredMesh, false);
            this.hoveredMesh = null;
        }
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
                    picked.state.targetT = picked.state.targetT > 0.5 ? 0 : 1;
                } else if (picked.kind === 'drawer' && picked.drawerIndex != null) {
                    const slide = this.drawerSlides[picked.drawerIndex];
                    if (slide) slide.targetT = slide.targetT > 0.5 ? 0 : 1;
                }
            }
        }
        this._clickPending = null;
        this.controls.enabled = true;
    }

    updateGasLiftDoors() {
        const attachScratch = new THREE.Vector3();
        for (const lift of this.gasLiftDoors) {
            if (Math.abs(lift.t - lift.targetT) > 0.002) {
                lift.t += (lift.targetT - lift.t) * LIFT_LERP;
            } else {
                lift.t = lift.targetT;
            }
            const angle = lift.closedAngle + lift.t * (lift.openAngle - lift.closedAngle);
            lift.group.rotation.x = angle;
            if (!lift.strutSpecs?.length) continue;
            lift.group.updateMatrixWorld(true);
            const showStruts = lift.t > 0.08;
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

    updateHingeDoors() {
        for (const hinge of this.hingeDoors) {
            if (Math.abs(hinge.t - hinge.targetT) > 0.002) {
                hinge.t += (hinge.targetT - hinge.t) * LIFT_LERP;
            } else {
                hinge.t = hinge.targetT;
            }
            const angle = hinge.closedAngle + hinge.t * (hinge.openAngle - hinge.closedAngle);
            hinge.group.rotation.y = angle;
        }
    }

    updateDrawerSlides() {
        for (const slide of this.drawerSlides) {
            if (Math.abs(slide.t - slide.targetT) > 0.002) {
                slide.t += (slide.targetT - slide.t) * LIFT_LERP;
            } else {
                slide.t = slide.targetT;
            }
            slide.group.position.z = slide.t * slide.slideMm * MM;
        }
    }

    onResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const w = Math.max(1, this.container.clientWidth);
        const h = Math.max(1, this.container.clientHeight);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
    }

    loop() {
        if (!this.running) return;
        this.raf = requestAnimationFrame(() => this.loop());
        if (this.animT < 1) {
            this.animT = Math.min(1, this.animT + LERP_SPEED);
            const s = this.animFrom + (1 - this.animFrom) * this.animT;
            if (this.root) {
                this.root.scale.setScalar(s);
                this.root.position.y = (1 - this.animT) * -0.04;
            }
        }
        this.updateGasLiftDoors();
        this.updateHingeDoors();
        this.updateDrawerSlides();
        this.controls?.update();
        this.renderer?.render(this.scene, this.camera);
    }

    /** Throttled entry from v2 shell */
    scheduleRebuild(params) {
        if (!params) return;
        const key = JSON.stringify(params);
        if (key === this.lastKey && this.root?.children.length) return;
        if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
        this.rebuildTimer = setTimeout(() => {
            this.rebuildTimer = null;
            this.rebuildModel(params);
        }, REBUILD_MS);
    }

    rebuildModel(params) {
        if (!this.scene) this.init();
        if (!this.root) return;

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
        this._clickPending = null;

        while (this.root.children.length) {
            const child = this.root.children[0];
            this.root.remove(child);
            disposeObject(child);
        }

        if (params.mode === 'beds') this.buildBed(params);
        else this.buildCloset(params);

        this.fitCamera(params);
        this.animFrom = 0.98;
        this.animT = 0;
        if (this.root) {
            this.root.scale.setScalar(this.animFrom);
            this.root.position.y = -0.04;
        }
    }

    fitCamera(params) {
        const box = new THREE.Box3().setFromObject(this.root);
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.5);
        const dist = maxDim / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) + maxDim * 0.6;
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
        const ctT = p.countertop?.enabled ? (p.countertop.thickness || 38) : 0;
        const upperBaseY = lower.h + ctT + gap;

        this.buildCarcassSection(this.root, lower.w, lower.h, lower.d, T, 0, carcassMat, edgeMat, p.backWall, backMat);
        if (p.countertop?.enabled) this.buildCountertop(p, lower);
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

        // Upper: gas = lift-up flap, hinge = hinged facade
        if (upperMode === 'gas') {
            this.addDoor(this.root, upper.w, upper.h, facadeT, upper.d, upperCenterY, doorMat, true, { interactive: true, startOpen: true });
        } else if (upperMode === 'hinge') {
            this.addDoor(this.root, upper.w, upper.h, facadeT, upper.d, upperCenterY, doorMat, false);
        }

        // Lower: hinge / gas = doors, drawer = drawer fronts
        if (lowerMode === 'drawer' || p.drawers?.enabled) {
            this.addDrawers(this.root, lower.w, lower.h, lower.d, facadeT, doorMat, p.drawers?.count || 1, { interactive: true });
        } else if (lowerMode === 'gas') {
            this.addDoor(this.root, lower.w, lower.h, facadeT, lower.d, lowerCenterY, doorMat, true, { interactive: true, startOpen: true });
        } else if (lowerMode === 'hinge') {
            if (p.lowerSplitDoor) {
                this.addSplitDoors(this.root, lower.w, lower.h, facadeT, lower.d, lowerCenterY, doorMat, { interactive: true });
            } else {
                this.addDoor(this.root, lower.w, lower.h, facadeT, lower.d, lowerCenterY, doorMat, false, { interactive: true });
            }
        }
    }

    buildCountertop(p, lower) {
        const ct = p.countertop || {};
        const ctT = ct.thickness || 38;
        const front = ct.frontOverhang || 0;
        const side = ct.sideOverhang || 0;
        const ctW = lower.w + side * 2;
        const ctD = lower.d + front;
        const ctMat = getMaterial('countertop', ct.material || 'countertop');
        addPanel(this.root, ctW, ctT, ctD, ctMat, 0, lower.h + ctT / 2, front / 2);
    }

    buildCarcassSection(group, W, H, D, T, baseY, mat, edgeMat, backWall, backMat) {
        const y0 = baseY + H / 2;
        addPanel(group, T, H, D, mat, -W / 2 + T / 2, y0, 0);
        addPanel(group, T, H, D, mat, W / 2 - T / 2, y0, 0);
        addPanel(group, W, T, D, mat, 0, baseY + T / 2, 0);
        addPanel(group, W, T, D, mat, 0, baseY + H - T / 2, 0);
        addPanel(group, W, H, T, edgeMat, 0, y0, -D / 2 + T / 2);
        if (backWall) addPanel(group, W - 2 * T, H - 2 * T, 4, backMat, 0, y0, -D / 2 + T + 2);
    }

    addShelves(group, sec, W, H, D, T, baseY, mat) {
        const innerW = W - 2 * T;
        const innerD = D - 2 * T;
        const countH = Math.max(0, Math.min(5, sec.horizontal || 0));
        const countV = Math.max(0, Math.min(4, sec.vertical || 0));

        for (let i = 1; i <= countH; i += 1) {
            const y = baseY + T + (i * (H - 2 * T)) / (countH + 1);
            addPanel(group, innerW, T, innerD, mat, 0, y, 0);
        }
        for (let i = 1; i <= countV; i += 1) {
            const x = -innerW / 2 + (i * innerW) / (countV + 1);
            addPanel(group, T, H - 2 * T, innerD, mat, x, baseY + H / 2, 0);
        }
    }

    addDoor(group, W, H, facadeT, D, centerY, mat, isLift, opts = {}) {
        const doorW = W - 6;
        const doorH = H - 6;
        const z = D / 2 + facadeT / 2 + 4;

        if (!isLift) {
            if (opts.interactive) {
                this.addHingedDoor(group, doorW, doorH, facadeT, D, centerY, mat, {
                    hingeX: -doorW / 2,
                    doorCenterX: 0,
                    openSign: -1,
                    startOpen: opts.startOpen === true,
                });
            } else {
                addPanel(group, doorW, doorH, facadeT, mat, 0, centerY, z);
            }
            return;
        }

        // Parallel lift: pivot at cabinet top front edge; door folds around upper dead center.
        const cabinetTopY = centerY + H / 2;
        const pivotZ = D / 2 + facadeT / 2 + 4;
        const pivotGroup = new THREE.Group();
        pivotGroup.position.set(0, cabinetTopY * MM, pivotZ * MM);
        group.add(pivotGroup);

        const doorMesh = addPanel(pivotGroup, doorW, doorH, facadeT, mat, 0, -doorH / 2, 0);
        const openAngle = -Math.PI;
        const closedAngle = 0;
        const startT = opts.startOpen !== false ? 1 : 0;
        pivotGroup.rotation.x = closedAngle + startT * (openAngle - closedAngle);

        const strutMat = getMaterial('gas-strut', 0x707880, { metalness: 0.55, roughness: 0.38 });
        const strutX = W / 2 - 48;
        const rodR = 4;
        const cabinetAttachY = cabinetTopY - Math.min(28, H * 0.08);
        const cabinetAttachZ = D / 2 - 18;
        const doorAttachFromTop = doorH * 0.22;
        const attachLocalLeft = new THREE.Vector3(-strutX * MM, -doorAttachFromTop * MM, 0);
        const attachLocalRight = new THREE.Vector3(strutX * MM, -doorAttachFromTop * MM, 0);

        const gasState = {
            group: pivotGroup,
            doorMesh,
            openAngle,
            closedAngle,
            attachLocalLeft,
            attachLocalRight,
            t: startT,
            targetT: startT,
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
                    cabinetTopY + doorAttachFromTop,
                    pivotZ,
                    rodR,
                    strutMat
                );
                strutSpecs.push({ rod, x, rodR, cabinetAttachY, cabinetAttachZ, side });
            });
            gasState.strutSpecs = strutSpecs;
            doorMesh.userData.baseMaterial = mat;
            this.gasLiftDoors.push(gasState);
            this.hoverableMeshes.push({ mesh: doorMesh, kind: 'gasLift', state: gasState });
        } else {
            const openAttachY = cabinetTopY + doorAttachFromTop;
            [-1, 1].forEach((side) => {
                const x = side * strutX;
                addRod(
                    group,
                    x,
                    cabinetAttachY,
                    cabinetAttachZ,
                    x,
                    openAttachY,
                    pivotZ,
                    rodR,
                    strutMat
                );
            });
        }
    }

    addHingedDoor(group, doorW, doorH, facadeT, D, centerY, mat, opts = {}) {
        const z = D / 2 + facadeT / 2 + 4;
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
            openAngle,
            closedAngle,
            t: startT,
            targetT: startT,
        };

        if (doorMesh) {
            doorMesh.userData.baseMaterial = mat;
            this.hingeDoors.push(hingeState);
            this.hoverableMeshes.push({ mesh: doorMesh, kind: 'hinge', state: hingeState });
        }
    }

    addSplitDoors(group, W, H, facadeT, D, centerY, mat, opts = {}) {
        const gap = 6;
        const leafW = (W - 6 - gap) / 2;
        const z = D / 2 + facadeT / 2 + 4;
        if (!opts.interactive) {
            addPanel(group, leafW, H - 6, facadeT, mat, -(leafW / 2 + gap / 2), centerY, z);
            addPanel(group, leafW, H - 6, facadeT, mat, leafW / 2 + gap / 2, centerY, z);
            return;
        }
        const leftCenterX = -(leafW / 2 + gap / 2);
        const rightCenterX = leafW / 2 + gap / 2;
        this.addHingedDoor(group, leafW, H - 6, facadeT, D, centerY, mat, {
            hingeX: leftCenterX - leafW / 2,
            doorCenterX: leftCenterX,
            openSign: -1,
        });
        this.addHingedDoor(group, leafW, H - 6, facadeT, D, centerY, mat, {
            hingeX: rightCenterX + leafW / 2,
            doorCenterX: rightCenterX,
            openSign: 1,
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
        const drawerH = (H - 8) / n;
        const facadeZ = D / 2 + facadeT / 2 + 2;
        const slideMm = 0.72 * (D - 24);
        const innerW = W - 16;
        const innerH = drawerH - 12;
        const innerD = D - 24;
        const wallT = 16;
        const innerMat = getMaterial('drawer-inner', 'ldsp');

        for (let i = 0; i < n; i += 1) {
            const cy = drawerH * i + drawerH / 2 + 4;
            const drawerGroup = new THREE.Group();
            group.add(drawerGroup);

            const facadeMesh = addPanel(drawerGroup, W - 8, drawerH - 6, facadeT, mat, 0, cy, facadeZ);
            this.addDrawerBox(drawerGroup, innerW, innerH, innerD, cy, wallT, innerMat);

            if (opts.interactive && facadeMesh) {
                facadeMesh.userData.baseMaterial = mat;
                this.hoverableMeshes.push({ mesh: facadeMesh, kind: 'drawer', drawerIndex: i });
                this.drawerSlides.push({
                    group: drawerGroup,
                    facadeMesh,
                    t: 0,
                    targetT: 0,
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
        const carcassMat = getMaterial('bed-carcass', p.material || 'bed');
        const facadeMat = getMaterial('bed-facade', p.facadeMaterial || p.material || 'bed-facade');
        const mattressMat = getMaterial('mattress', 0xe8ece8, { roughness: 0.95 });

        const outerL = bedLen + 2 * panelT;
        const railY = footboardH + frameH / 2;

        addPanel(this.root, panelT, headboardH, mattressW + 2 * panelT, facadeMat, -outerL / 2 + panelT / 2, headboardH / 2, 0);
        addPanel(this.root, panelT, footboardH, mattressW + 2 * panelT, facadeMat, outerL / 2 - panelT / 2, footboardH / 2, 0);
        addPanel(this.root, bedLen, frameH, panelT, carcassMat, 0, footboardH + frameH / 2, -mattressW / 2 + panelT / 2);
        addPanel(this.root, bedLen, frameH, panelT, carcassMat, 0, footboardH + frameH / 2, mattressW / 2 - panelT / 2);

        const deckY = footboardH + frameH - 20;
        if (p.baseType === 'sheet') {
            addPanel(this.root, bedLen - panelT, 16, mattressW - panelT, carcassMat, 0, deckY, 0);
        } else {
            const strips = Math.min(12, Math.max(4, Math.floor(bedLen / 140)));
            const stripW = Math.max(40, (mattressW - panelT) / 4);
            for (let i = 0; i < strips; i += 1) {
                const x = -bedLen / 2 + panelT + ((i + 0.5) * (bedLen - 2 * panelT)) / strips;
                addPanel(this.root, stripW, 16, 80, carcassMat, x, deckY, 0);
            }
        }

        addPanel(this.root, bedLen, 180, mattressW, mattressMat, 0, deckY + 100, 0);
    }

    setThemeBackground() {
        if (this.scene) this.scene.background.setHex(sceneBackground());
    }

    dispose() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
        this.resizeObs?.disconnect();
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
    dispose() {
        instance?.dispose();
        instance = null;
    },
};
