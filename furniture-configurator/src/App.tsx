import { AppShell } from './components/layout/AppShell';
import { Viewer3D } from './components/viewer/Viewer3D';
import { useCatalogSync } from './hooks/useCatalogSync';
import { useConfigStore } from './store/configStore';
import { userFacingMessage } from './lib/errors/modelErrors';
import { ModelErrorFallback } from './components/errors/ModelErrorFallback';

export default function App() {
  const { product, configuration } = useCatalogSync();
  const modelError = useConfigStore((s) => s.modelError);
  const modelLoadState = useConfigStore((s) => s.modelLoadState);
  const enableProceduralFallback = useConfigStore((s) => s.enableProceduralFallback);
  const resetModelState = useConfigStore((s) => s.resetModelState);

  const showErrorOverlay =
    modelLoadState === 'error' && modelError && !enableProceduralFallback;

  return (
    <AppShell>
      <Viewer3D product={product} configuration={configuration} />
      {showErrorOverlay && (
        <div className="viewer-error-overlay">
          <ModelErrorFallback
            error={modelError}
            message={userFacingMessage(modelError)}
            onRetry={() => resetModelState()}
            onUseFallback={enableProceduralFallback}
          />
        </div>
      )}
    </AppShell>
  );
}
