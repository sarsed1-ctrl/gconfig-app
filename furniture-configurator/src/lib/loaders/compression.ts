import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { WebGLRenderer } from 'three';

const DRACO_CDN =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const BASIS_CDN =
  'https://unpkg.com/three@0.184.0/examples/jsm/libs/basis/';

let dracoLoader: DRACOLoader | null = null;
let ktx2Loader: KTX2Loader | null = null;

export function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_CDN);
    dracoLoader.preload();
  }
  return dracoLoader;
}

export function getKtx2Loader(renderer: WebGLRenderer): KTX2Loader {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(BASIS_CDN);
    ktx2Loader.detectSupport(renderer);
  }
  return ktx2Loader;
}

export function getMeshoptDecoder() {
  return MeshoptDecoder;
}

/** Texture format hints for pipeline — ASTC used on mobile when GPU supports it via KTX2 */
export const TEXTURE_COMPRESSION_NOTES = {
  desktop: 'Use KTX2 Basis UASTC for high quality',
  mobile: 'KTX2 transcodes to ASTC / ETC1S on supported GPUs',
  fallback: 'JPEG/PNG with max 2K for slow networks',
} as const;
