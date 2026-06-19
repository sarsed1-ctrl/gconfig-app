import { create } from 'zustand';
import catalogData from '../data/catalog.json';
import type { CatalogProduct, ModelLoadError, ProductConfiguration } from '../types/catalog';
import { buildDefaultConfiguration } from '../lib/config/configLogic';

const catalog = catalogData as CatalogProduct[];
const initialProduct = catalog[0]!;

type ConfigState = {
  catalog: CatalogProduct[];
  selectedProductId: string;
  configuration: ProductConfiguration;
  catalogQuery: string;
  sidebarOpen: boolean;
  modelLoadState: 'idle' | 'loading' | 'ready' | 'error';
  modelError: ModelLoadError | null;
  useProceduralFallback: boolean;

  selectProduct: (id: string) => void;
  setConfiguration: (config: ProductConfiguration) => void;
  setCatalogQuery: (q: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setModelLoading: (url?: string) => void;
  setModelReady: () => void;
  setModelError: (error: ModelLoadError) => void;
  enableProceduralFallback: () => void;
  resetModelState: () => void;
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  catalog,
  selectedProductId: initialProduct.id,
  configuration: buildDefaultConfiguration(initialProduct),
  catalogQuery: '',
  sidebarOpen: true,
  modelLoadState: 'idle',
  modelError: null,
  useProceduralFallback: false,

  selectProduct: (id) => {
    const product = get().catalog.find((p) => p.id === id);
    if (!product) return;
    set({
      selectedProductId: id,
      configuration: buildDefaultConfiguration(product),
      modelLoadState: 'idle',
      modelError: null,
      useProceduralFallback: false,
    });
  },

  setConfiguration: (configuration) => set({ configuration }),

  setCatalogQuery: (catalogQuery) => set({ catalogQuery }),

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  setModelLoading: () => set({ modelLoadState: 'loading', modelError: null }),

  setModelReady: () => set({ modelLoadState: 'ready', modelError: null }),

  setModelError: (modelError) =>
    set({ modelLoadState: 'error', modelError, useProceduralFallback: false }),

  enableProceduralFallback: () =>
    set({ useProceduralFallback: true, modelLoadState: 'ready', modelError: null }),

  resetModelState: () =>
    set({ modelLoadState: 'idle', modelError: null, useProceduralFallback: false }),
}));

export function useSelectedProduct(): CatalogProduct {
  const catalog = useConfigStore((s) => s.catalog);
  const id = useConfigStore((s) => s.selectedProductId);
  return catalog.find((p) => p.id === id) ?? catalog[0]!;
}
