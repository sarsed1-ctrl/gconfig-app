import { ContactShadows, Environment, Grid } from '@react-three/drei';

export function SceneSetup() {
  return (
    <>
      <color attach="background" args={['#e8eaed']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 8, 3]} intensity={1.1} castShadow />
      <directionalLight position={[-3, 4, -2]} intensity={0.35} />
      <Environment preset="apartment" />
      <Grid
        infiniteGrid
        fadeDistance={12}
        fadeStrength={1}
        cellSize={0.25}
        sectionSize={1}
        sectionColor="#b8bcc4"
        cellColor="#d0d4dc"
        position={[0, 0, 0]}
      />
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.35}
        scale={12}
        blur={2.5}
        far={4}
      />
    </>
  );
}
