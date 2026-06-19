import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MaterialVariant } from '../../types/catalog';
import { getDimensionScale } from '../../lib/config/configLogic';
import type { CatalogProduct, ProductConfiguration } from '../../types/catalog';
import { useConfigStore } from '../../store/configStore';
import { ParametricCabinet } from './ParametricCabinet';

type GltfModelProps = {
  url: string;
  product: CatalogProduct;
  configuration: ProductConfiguration;
  material: MaterialVariant;
};

function GltfModel({ url, product, configuration, material }: GltfModelProps) {
  const setModelLoading = useConfigStore((s) => s.setModelLoading);
  const setModelReady = useConfigStore((s) => s.setModelReady);

  useEffect(() => {
    setModelLoading();
  }, [url, setModelLoading]);

  const { scene } = useGLTF(url);
  const scale = getDimensionScale(configuration, product);

  const cloned = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material = child.material.clone();
          child.material.color.set(material.color);
          child.material.roughness = material.roughness ?? child.material.roughness;
          child.material.metalness = material.metalness ?? child.material.metalness;
        }
      }
    });
    return root;
  }, [scene, material]);

  useEffect(() => {
    setModelReady();
  }, [setModelReady, url]);

  const box = useMemo(() => new THREE.Box3().setFromObject(cloned), [cloned]);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const fitScale = 1.2 / maxDim;

  return (
    <group
      scale={[scale.x * fitScale, scale.y * fitScale, scale.z * fitScale]}
      position={[-center.x * fitScale, -box.min.y * fitScale, -center.z * fitScale]}
    >
      <primitive object={cloned} />
    </group>
  );
}

type FurnitureModelProps = {
  product: CatalogProduct;
  configuration: ProductConfiguration;
  material: MaterialVariant;
  useProceduralFallback: boolean;
};

export function FurnitureModel({
  product,
  configuration,
  material,
  useProceduralFallback,
}: FurnitureModelProps) {
  const showGltf = Boolean(product.modelUrl) && !useProceduralFallback;

  if (showGltf && product.modelUrl) {
    return (
      <GltfModel
        url={product.modelUrl}
        product={product}
        configuration={configuration}
        material={material}
      />
    );
  }

  return (
    <ParametricCabinet
      width={configuration.width}
      height={configuration.height}
      depth={configuration.depth}
      material={material}
    />
  );
}
