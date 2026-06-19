import type { ModelLoadError } from '../../types/catalog';

type Props = {
  error: ModelLoadError;
  message: string;
  onRetry?: () => void;
  onUseFallback?: () => void;
};

export function ModelErrorFallback({ error, message, onRetry, onUseFallback }: Props) {
  return (
    <div className="model-error-fallback" role="alert">
      <div className="model-error-fallback__icon" aria-hidden>
        ⚠
      </div>
      <h3>Model could not load</h3>
      <p>{message}</p>
      <p className="model-error-fallback__code">Code: {error.code}</p>
      <div className="model-error-fallback__actions">
        {onRetry && (
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Retry
          </button>
        )}
        {onUseFallback && (
          <button type="button" className="btn btn--ghost" onClick={onUseFallback}>
            Show parametric preview
          </button>
        )}
      </div>
    </div>
  );
}
