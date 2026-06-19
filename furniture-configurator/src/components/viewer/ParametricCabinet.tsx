import type { MaterialVariant } from '../../types/catalog';

type Props = {
  width: number;
  height: number;
  depth: number;
  material: MaterialVariant;
};

const MM = 0.001;
const CARCASS_T = 18;

/**
 * Procedural parametric cabinet — works offline, no GLB required.
 * Mirrors imos-style dimension-driven assembly.
 */
export function ParametricCabinet({ width, height, depth, material }: Props) {
  const w = width * MM;
  const h = height * MM;
  const d = depth * MM;
  const t = CARCASS_T * MM;
  const y0 = h / 2;

  const color = material.color;
  const roughness = material.roughness ?? 0.5;
  const metalness = material.metalness ?? 0;

  return (
    <group position={[0, 0, 0]}>
      {/* bottom */}
      <mesh position={[0, t / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, t, d]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
      {/* top */}
      <mesh position={[0, h - t / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, t, d]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
      {/* left side */}
      <mesh position={[-w / 2 + t / 2, y0, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, h - 2 * t, d]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
      {/* right side */}
      <mesh position={[w / 2 - t / 2, y0, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, h - 2 * t, d]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
      {/* back */}
      <mesh position={[0, y0, -d / 2 + 0.003]} receiveShadow>
        <boxGeometry args={[w - 2 * t, h - 2 * t, 0.006]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.9} />
      </mesh>
      {/* door */}
      <mesh position={[0, y0, d / 2 - t / 2 - 0.002]} castShadow>
        <boxGeometry args={[w - 4 * MM - 2 * t, h - 2 * t - 4 * MM, t]} />
        <meshStandardMaterial
          color={color}
          roughness={roughness * 0.9}
          metalness={metalness}
        />
      </mesh>
      {/* handle */}
      <mesh position={[w / 4, y0, d / 2 + 0.008]} castShadow>
        <boxGeometry args={[0.12, 0.02, 0.02]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.85} roughness={0.2} />
      </mesh>
    </group>
  );
}
