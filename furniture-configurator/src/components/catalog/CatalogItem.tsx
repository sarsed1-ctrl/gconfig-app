import type { CatalogProduct } from '../../types/catalog';

type Props = {
  product: CatalogProduct;
  selected: boolean;
  onSelect: (id: string) => void;
};

export function CatalogItem({ product, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      className={`catalog-item${selected ? ' catalog-item--selected' : ''}`}
      onClick={() => onSelect(product.id)}
      aria-pressed={selected}
    >
      <img
        src={product.thumbnail}
        alt=""
        className="catalog-item__thumb"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/thumbnails/placeholder.svg';
        }}
      />
      <div className="catalog-item__body">
        <span className="catalog-item__name">{product.name}</span>
        <span className="catalog-item__category">{product.category}</span>
      </div>
    </button>
  );
}
