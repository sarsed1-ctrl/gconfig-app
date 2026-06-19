import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WebGLRenderer } from 'three';
import { ModelLoaderError } from '../errors/modelErrors';
import { getDracoLoader, getKtx2Loader, getMeshoptDecoder } from './compression';

const DEFAULT_TIMEOUT_MS = 30_000;

export type LoadGltfOptions = {
  renderer?: WebGLRenderer;
  timeoutMs?: number;
  signal?: AbortSignal;
};

function assertHasGeometry(gltf: GLTF): void {
  let meshCount = 0;
  gltf.scene.traverse((obj) => {
    if ('isMesh' in obj && (obj as { isMesh: boolean }).isMesh) meshCount += 1;
  });
  if (meshCount === 0) {
    throw new ModelLoaderError('INVALID_MODEL', 'GLB contains no mesh geometry.');
  }
}

export async function prefetchModel(url: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(url, { signal, method: 'HEAD' });
  if (!res.ok) {
    throw new ModelLoaderError('HTTP', `HEAD ${res.status} for ${url}`, {
      statusCode: res.status,
    });
  }
  const type = res.headers.get('content-type') ?? '';
  if (type && !/gltf|model|octet|binary/i.test(type)) {
    console.warn(`Unexpected content-type for GLB: ${type}`);
  }
}

export function createConfiguredGltfLoader(renderer?: WebGLRenderer): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(getDracoLoader());
  loader.setMeshoptDecoder(getMeshoptDecoder());
  if (renderer) {
    loader.setKTX2Loader(getKtx2Loader(renderer));
  }
  return loader;
}

export function loadGltfAsync(
  url: string,
  options: LoadGltfOptions = {},
): Promise<GLTF> {
  const { renderer, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const loader = createConfiguredGltfLoader(renderer);

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      reject(new ModelLoaderError('TIMEOUT', `Load exceeded ${timeoutMs}ms`));
    }, timeoutMs);

    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);

    loader.load(
      url,
      (gltf) => {
        window.clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        try {
          assertHasGeometry(gltf);
          resolve(gltf);
        } catch (e) {
          reject(e);
        }
      },
      undefined,
      (err) => {
        window.clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        const msg = err instanceof Error ? err.message : String(err);
        if (/parse|json|gltf/i.test(msg)) {
          reject(new ModelLoaderError('PARSE', msg, { cause: err }));
        } else {
          reject(new ModelLoaderError('UNKNOWN', msg, { cause: err }));
        }
      },
    );
  });
}
