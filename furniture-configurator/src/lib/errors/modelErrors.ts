import type { ModelLoadError, ModelLoadErrorCode } from '../../types/catalog';

export class ModelLoaderError extends Error {
  readonly code: ModelLoadErrorCode;
  readonly statusCode?: number;
  readonly cause?: unknown;

  constructor(
    code: ModelLoadErrorCode,
    message: string,
    options?: { statusCode?: number; cause?: unknown },
  ) {
    super(message);
    this.name = 'ModelLoaderError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;
  }

  toPayload(): ModelLoadError {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      cause: this.cause,
    };
  }
}

export function classifyFetchError(
  err: unknown,
  url: string,
  statusCode?: number,
): ModelLoaderError {
  if (err instanceof ModelLoaderError) return err;

  if (typeof statusCode === 'number' && statusCode >= 400) {
    return new ModelLoaderError(
      'HTTP',
      `Model not found or server error (${statusCode}) for ${url}`,
      { statusCode, cause: err },
    );
  }

  if (err instanceof TypeError && /fetch|network|failed/i.test(String(err.message))) {
    return new ModelLoaderError(
      'NETWORK',
      'Network failure while loading model. Check connection and try again.',
      { cause: err },
    );
  }

  if (err instanceof DOMException && err.name === 'AbortError') {
    return new ModelLoaderError('TIMEOUT', 'Model load timed out.', { cause: err });
  }

  return new ModelLoaderError(
    'UNKNOWN',
    err instanceof Error ? err.message : 'Unknown model load error.',
    { cause: err },
  );
}

export function userFacingMessage(error: ModelLoadError): string {
  switch (error.code) {
    case 'NETWORK':
      return 'No connection. Model cannot load right now.';
    case 'HTTP':
      return error.statusCode === 404
        ? 'Model file missing on server.'
        : `Server error (${error.statusCode ?? '?'}). Try again later.`;
    case 'PARSE':
      return 'Model file is corrupted or not valid GLB/GLTF.';
    case 'INVALID_MODEL':
      return 'Model loaded but has no visible geometry.';
    case 'TIMEOUT':
      return 'Loading took too long. Try again or use a smaller model.';
    case 'UNKNOWN':
      return error.message || 'Something went wrong loading the model.';
    default: {
      const _exhaustive: never = error.code;
      return String(_exhaustive);
    }
  }
}
