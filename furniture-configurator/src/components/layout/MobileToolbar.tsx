import { useConfigStore } from '../../store/configStore';

export function MobileToolbar() {
  const setSidebarOpen = useConfigStore((s) => s.setSidebarOpen);
  const sidebarOpen = useConfigStore((s) => s.sidebarOpen);

  return (
    <div className="mobile-toolbar">
      {!sidebarOpen && (
        <button
          type="button"
          className="btn btn--primary mobile-toolbar__catalog"
          onClick={() => setSidebarOpen(true)}
        >
          Catalog
        </button>
      )}
      <span className="mobile-toolbar__hint">Drag to rotate · Pinch to zoom</span>
    </div>
  );
}
