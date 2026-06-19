# Furniture Configurator (React Three Fiber)

Open-source clone of imos iX NET–style 3D furniture configurator. React + React Three Fiber + Three.js.

## Features

- **Catalog sidebar** — search, pick product, sync with 3D view
- **Parametric dimensions** — width / height / depth sliders (mm)
- **Material variants** — swatch-based finish switching
- **GLB/GLTF loading** — DRACO + meshopt via drei / GLTFLoader
- **Error handling** — network, HTTP, parse, invalid model, timeout; retry + procedural fallback
- **Mobile responsive** — collapsible sidebar, touch orbit controls
- **Compression pipeline** — `scripts/compress-models.mjs` (gltf-transform)

## Quick start

```bash
cd furniture-configurator
npm install
npm run dev
```

Open http://localhost:5173

## Project structure

```
src/
├── App.tsx                    # Root layout + error overlay
├── main.tsx
├── types/catalog.ts           # Product, variant, error types
├── store/configStore.ts       # Zustand — catalog ↔ 3D state
├── hooks/
│   ├── useCatalogSync.ts      # Product change resets model state
│   └── useCompressedGltf.ts   # DRACO preload helper
├── lib/
│   ├── config/configLogic.ts  # Dimensions, materials, search
│   ├── loaders/
│   │   ├── modelLoader.ts     # Async GLTF load + validation
│   │   └── compression.ts     # DRACO, meshopt, KTX2 setup
│   └── errors/modelErrors.ts  # Typed errors + user messages
├── components/
│   ├── catalog/               # CatalogList, VariantPicker
│   ├── layout/                # AppShell, Sidebar, MobileToolbar
│   ├── viewer/                # Viewer3D, FurnitureModel, SceneSetup
│   └── errors/                # ModelErrorBoundary, fallback UI
└── data/catalog.json          # Product catalog
docs/REVERSE_ENGINEERING.md    # imos iX NET analysis notes
scripts/compress-models.mjs    # DRACO + KTX2 batch compress
public/models/                 # Place compressed GLBs here
```

## Add your models

1. Put raw GLBs in `raw-models/`
2. Run `node scripts/compress-models.mjs`
3. Add catalog entry in `src/data/catalog.json` with `modelUrl: "/models/your-file.glb"`

Products without `modelUrl` use the built-in **parametric cabinet** mesh.

## Reverse engineering notes

See [docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md). The live imos instance requires login; architecture is mapped from public docs + standard WebGL configurator patterns.

## Stack

- Vite + React 19 + TypeScript
- @react-three/fiber, @react-three/drei, three
- zustand
