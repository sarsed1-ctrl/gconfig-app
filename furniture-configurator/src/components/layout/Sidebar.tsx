import { CatalogList } from '../catalog/CatalogList';
import { VariantPicker } from '../catalog/VariantPicker';
import { useConfigStore, useSelectedProduct } from '../../store/configStore';

export function Sidebar() {
  const product = useSelectedProduct();
  const query = useConfigStore((s) => s.catalogQuery);
  const setCatalogQuery = useConfigStore((s) => s.setCatalogQuery);
  const sidebarOpen = useConfigStore((s) => s.sidebarOpen);
  const setSidebarOpen = useConfigStore((s) => s.setSidebarOpen);

  if (!sidebarOpen) return null;

  return (
    <aside className="sidebar" aria-label="Product catalog and options">
      <header className="sidebar__header">
        <h1 className="sidebar__title">Catalog</h1>
        <button
          type="button"
          className="sidebar__close btn btn--icon"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        >
          ×
        </button>
      </header>

      <div className="sidebar__search">
        <input
          type="search"
          placeholder="Search products…"
          value={query}
          onChange={(e) => setCatalogQuery(e.target.value)}
          aria-label="Search catalog"
        />
      </div>

      <CatalogList />

      <div className="sidebar__config">
        <h2 className="sidebar__product-name">{product.name}</h2>
        <p className="sidebar__description">{product.description}</p>
        <VariantPicker />
      </div>
    </aside>
  );
}
