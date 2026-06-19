import { catalogItemMatchesQuery } from '../../lib/config/configLogic';
import { useConfigStore } from '../../store/configStore';
import { CatalogItem } from './CatalogItem';

export function CatalogList() {
  const catalog = useConfigStore((s) => s.catalog);
  const query = useConfigStore((s) => s.catalogQuery);
  const selectedId = useConfigStore((s) => s.selectedProductId);
  const selectProduct = useConfigStore((s) => s.selectProduct);

  const filtered = catalog.filter((p) => catalogItemMatchesQuery(p, query));

  return (
    <div className="catalog-list" role="list">
      {filtered.length === 0 ? (
        <p className="catalog-list__empty">No products match your search.</p>
      ) : (
        filtered.map((product) => (
          <CatalogItem
            key={product.id}
            product={product}
            selected={product.id === selectedId}
            onSelect={selectProduct}
          />
        ))
      )}
    </div>
  );
}
