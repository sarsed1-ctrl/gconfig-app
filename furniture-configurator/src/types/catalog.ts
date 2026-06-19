export type MaterialVariant = {
  id: string;
  label: string;
  color: string;
  textureUrl?: string;
  roughness?: number;
  metalness?: number;
};

export type DimensionRange = {
  min: number;
  max: number;
  step: number;
  default: number;
};

export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  description: string;
  thumbnail: string;
  /** GLB/GLTF path; omit for procedural parametric preview */
  modelUrl?: string;
  /** Named mesh groups in GLB for variant visibility */
  meshGroups?: string[];
  materials: MaterialVariant[];
  dimensions: {
    width: DimensionRange;
    height: DimensionRange;
    depth: DimensionRange;
  };
};

export type ProductConfiguration = {
  productId: string;
  materialId: string;
  width: number;
  height: number;
  depth: number;
};

export type ModelLoadState =
  | { status: 'idle' }
  | { status: 'loading'; url: string }
  | { status: 'ready'; url: string }
  | { status: 'error'; url: string; error: ModelLoadError };

export type ModelLoadErrorCode =
  | 'NETWORK'
  | 'HTTP'
  | 'PARSE'
  | 'INVALID_MODEL'
  | 'TIMEOUT'
  | 'UNKNOWN';

export type ModelLoadError = {
  code: ModelLoadErrorCode;
  message: string;
  statusCode?: number;
  cause?: unknown;
};
