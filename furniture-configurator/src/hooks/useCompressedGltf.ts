import { useGLTF } from '@react-three/drei';
import { getDracoLoader } from '../lib/loaders/compression';

const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
useGLTF.setDecoderPath(DRACO_PATH);

/** Lazy preload — call when catalog item enters viewport */
export function preloadGltf(url: string): void {
  getDracoLoader();
  useGLTF.preload(url);
}
