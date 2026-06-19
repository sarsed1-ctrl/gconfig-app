import { useEffect } from 'react';
import { useConfigStore, useSelectedProduct } from '../store/configStore';

/**
 * Keeps catalog selection and 3D viewer in sync.
 * Resets load state when product or external model URL changes.
 */
export function useCatalogSync() {
  const product = useSelectedProduct();
  const configuration = useConfigStore((s) => s.configuration);
  const resetModelState = useConfigStore((s) => s.resetModelState);

  useEffect(() => {
    resetModelState();
  }, [product.id, product.modelUrl, resetModelState]);

  return { product, configuration };
}
