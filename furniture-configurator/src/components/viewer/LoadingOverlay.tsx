type Props = {
  visible: boolean;
  label?: string;
};

export function LoadingOverlay({ visible, label = 'Loading 3D model…' }: Props) {
  if (!visible) return null;
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-overlay__spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
