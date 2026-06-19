# iX NET / imos3D — Reverse Engineering Notes

Analysis target: `https://3034.netshop.imos3d.com/app/projects/current/(sidebar:catalog)`

> **Access note:** The live instance redirects to `/app/login`. Architecture below is inferred from public imos documentation, network bundle names, URL routing, and industry-standard WebGL configurator patterns.

## Stack fingerprint

| Signal | Observation |
|--------|-------------|
| SPA bundles | `runtime.*.js`, `polyfills.*.js`, `main.*.js` — typical Angular production build |
| Routing | Parenthetical segments `(sidebar:catalog)` — Angular auxiliary / named-outlet style |
| Backend | SQL + XML rule engine driving parametric CAD data from iX CAD libraries |
| Rendering | WebGL real-time 3D, PBR materials, HDR environment (iX 2025) |
| Catalog | Sidebar catalog synced with 3D scene; drag-and-drop designer variant also exists |

## Core engine (conceptual)

```
┌─────────────────────────────────────────────────────────────┐
│  Angular Shell (iX NET)                                     │
│  ┌──────────────┐  ┌────────────────────────────────────┐ │
│  │ Sidebar      │  │ WebGL Viewport                       │ │
│  │ Catalog      │◄─┤ Scene graph from parametric assembly │ │
│  │ Variants     │  │ PBR materials + camera controls    │ │
│  │ Dimensions   │  └────────────────────────────────────┘ │
│  └──────┬───────┘                                           │
│         │ XML / API rules                                   │
│         ▼                                                   │
│  Parametric engine (server) → mesh/material variant payload │
└─────────────────────────────────────────────────────────────┘
```

### Scene setup

- Perspective camera, orbit-style controls (rotate / pan / zoom)
- HDR or studio lighting for PBR
- Ground plane + contact shadows
- Scene rebuilt when configuration parameters change (debounced)

### Model loading

- Assets originate from imos CAD parametric libraries (not raw artist GLBs in browser)
- Runtime receives geometry + material assignments after rule evaluation
- Equivalent open-source pattern: **GLB per product** + **client parametric scaling** + **material variant maps**

### Variant switching

- Front style, carcass color, handle, dimensions — each maps to:
  - mesh visibility toggles (swap GLB sub-meshes), or
  - material `color` / `map` swaps on named materials, or
  - morph targets / scale for dimensions

### Camera controls

- Orbit around product centroid
- Mobile: touch rotate + pinch zoom
- Desktop: mouse drag + scroll zoom
- Optional preset views (front, top, perspective)

### Catalog ↔ 3D sync

1. User picks catalog item → load base model
2. User changes variant param → update materials / meshes without full reload when possible
3. Dimension change → rescale parametric nodes or request new assembly
4. Loading state shown until scene ready

## Clone mapping (this repo)

| imos concept | Our implementation |
|--------------|------------------|
| XML rule engine | `src/lib/config/configLogic.ts` + `src/data/catalog.json` |
| Catalog sidebar | `src/components/catalog/*` + `src/store/configStore.ts` |
| WebGL viewport | `src/components/viewer/Viewer3D.tsx` (React Three Fiber) |
| GLB assembly | `src/components/viewer/FurnitureModel.tsx` + `modelLoader.ts` |
| Variant swap | `applyMaterialVariant()` + mesh visibility |
| Compression | DRACO + meshopt via `compression.ts`; pipeline in `scripts/compress-models.mjs` |
| Error handling | `ModelErrorBoundary`, typed errors in `modelErrors.ts` |

## Optimization targets

- **DRACO** — geometry compression (~70–90% smaller)
- **meshopt** — fast GPU-friendly buffers
- **KTX2 / Basis** — texture compression (ASTC on mobile when supported)
- **Lazy load** — fetch GLB only when catalog item selected
- **LOD** — optional lower-poly preview mesh
