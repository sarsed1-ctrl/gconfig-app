import { applyDimensionChange, getMaterialVariant } from '../../lib/config/configLogic';
import { useConfigStore, useSelectedProduct } from '../../store/configStore';

export function VariantPicker() {
  const product = useSelectedProduct();
  const configuration = useConfigStore((s) => s.configuration);
  const setConfiguration = useConfigStore((s) => s.setConfiguration);

  const material = getMaterialVariant(product, configuration.materialId);

  return (
    <div className="variant-picker">
      <section className="variant-picker__section">
        <h3 className="variant-picker__title">Finish</h3>
        <div className="variant-picker__swatches" role="radiogroup" aria-label="Material finish">
          {product.materials.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={configuration.materialId === m.id}
              className={`swatch${configuration.materialId === m.id ? ' swatch--active' : ''}`}
              style={{ backgroundColor: m.color }}
              title={m.label}
              onClick={() => setConfiguration({ ...configuration, materialId: m.id })}
            />
          ))}
        </div>
        {material && <p className="variant-picker__label">{material.label}</p>}
      </section>

      {(['width', 'height', 'depth'] as const).map((key) => {
        const range = product.dimensions[key];
        const value = configuration[key];
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        return (
          <section key={key} className="variant-picker__section">
            <div className="variant-picker__row">
              <h3 className="variant-picker__title">{label}</h3>
              <span className="variant-picker__value">{value} mm</span>
            </div>
            <input
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={value}
              aria-label={`${label} in millimeters`}
              onChange={(e) =>
                setConfiguration(
                  applyDimensionChange(configuration, product, key, Number(e.target.value)),
                )
              }
            />
          </section>
        );
      })}
    </div>
  );
}
