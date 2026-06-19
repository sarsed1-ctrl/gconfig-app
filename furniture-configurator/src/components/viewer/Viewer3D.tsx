import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useState } from 'react';
import { getMaterialVariant } from '../../lib/config/configLogic';
import { useConfigStore } from '../../store/configStore';
import { ModelErrorBoundary } from '../errors/ModelErrorBoundary';
import { CameraControls } from './CameraControls';
import { FurnitureModel } from './FurnitureModel';
import { LoadingOverlay } from './LoadingOverlay';
import { SceneSetup } from './SceneSetup';
import type { CatalogProduct, ProductConfiguration } from '../../types/catalog';

type Props = {
  product: CatalogProduct;
  configuration: ProductConfiguration;
};

export function Viewer3D({ product, configuration }: Props) {
  const modelLoadState = useConfigStore((s) => s.modelLoadState);
  const useProceduralFallback = useConfigStore((s) => s.useProceduralFallback);
  const setModelError = useConfigStore((s) => s.setModelError);
  const resetModelState = useConfigStore((s) => s.resetModelState);
  const [retryKey, setRetryKey] = useState(0);

  const material =
    getMaterialVariant(product, configuration.materialId) ?? product.materials[0]!;

  const handleError = useCallback(
    (error: Parameters<typeof setModelError>[0]) => {
      setModelError(error);
    },
    [setModelError],
  );

  const handleRetry = useCallback(() => {
    resetModelState();
    setRetryKey((k) => k + 1);
  }, [resetModelState]);

  const isLoading = modelLoadState === 'loading' && Boolean(product.modelUrl);

  return (
    <div className="viewer-3d">
      <LoadingOverlay visible={isLoading} />
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        className="viewer-3d__canvas"
      >
        <SceneSetup />
        <CameraControls targetY={configuration.height * 0.0005} />
        <ModelErrorBoundary
          key={`${product.id}-${retryKey}`}
          onError={handleError}
          onRetry={handleRetry}
        >
          <Suspense fallback={null}>
            <FurnitureModel
              product={product}
              configuration={configuration}
              material={material}
              useProceduralFallback={useProceduralFallback}
            />
          </Suspense>
        </ModelErrorBoundary>
      </Canvas>
    </div>
  );
}
