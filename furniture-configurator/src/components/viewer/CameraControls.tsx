import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';

type Props = {
  targetY?: number;
};

export function CameraControls({ targetY = 0.5 }: Props) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useEffect(() => {
    camera.position.set(2.2, 1.6, 2.8);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = size.width < 768 ? 50 : 42;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(0, targetY, 0);
  }, [camera, size.width, targetY]);

  return (
    <OrbitControls
      makeDefault
      target={[0, targetY, 0]}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2 - 0.05}
      minDistance={0.8}
      maxDistance={8}
      enableDamping
      dampingFactor={0.08}
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
    />
  );
}
