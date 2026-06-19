import type { CatalogProduct, ProductConfiguration, MaterialVariant } from '../../types/catalog';

export function buildDefaultConfiguration(product: CatalogProduct): ProductConfiguration {
  return {
    productId: product.id,
    materialId: product.materials[0]?.id ?? 'default',
    width: product.dimensions.width.default,
    height: product.dimensions.height.default,
    depth: product.dimensions.depth.default,
  };
}

export function clampDimension(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  return min + steps * step;
}

export function applyDimensionChange(
  config: ProductConfiguration,
  product: CatalogProduct,
  key: 'width' | 'height' | 'depth',
  value: number,
): ProductConfiguration {
  const range = product.dimensions[key];
  return {
    ...config,
    [key]: clampDimension(value, range.min, range.max, range.step),
  };
}

export function getMaterialVariant(
  product: CatalogProduct,
  materialId: string,
): MaterialVariant | undefined {
  return product.materials.find((m) => m.id === materialId);
}

/** Scale factors relative to product default dimensions (mm → unit scale in scene) */
export function getDimensionScale(
  config: ProductConfiguration,
  product: CatalogProduct,
): { x: number; y: number; z: number } {
  const dw = product.dimensions.width.default;
  const dh = product.dimensions.height.default;
  const dd = product.dimensions.depth.default;
  return {
    x: config.width / dw,
    y: config.height / dh,
    z: config.depth / dd,
  };
}

export function catalogItemMatchesQuery(product: CatalogProduct, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    product.name.toLowerCase().includes(q) ||
    product.category.toLowerCase().includes(q) ||
    product.description.toLowerCase().includes(q)
  );
}
