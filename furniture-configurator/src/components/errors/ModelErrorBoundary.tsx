import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { ModelLoadError } from '../../types/catalog';
import { ModelLoaderError } from '../../lib/errors/modelErrors';
type Props = {
  children: ReactNode;
  onError?: (error: ModelLoadError) => void;
  onRetry?: () => void;
};

type State = {
  error: ModelLoadError | null;
};

export class ModelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: unknown): State {
    if (err instanceof ModelLoaderError) {
      return { error: err.toPayload() };
    }
    return {
      error: {
        code: 'UNKNOWN',
        message: err instanceof Error ? err.message : '3D model failed to render.',
        cause: err,
      },
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ModelErrorBoundary]', error, info.componentStack);
    if (this.state.error) {
      this.props.onError?.(this.state.error);
    }
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}
