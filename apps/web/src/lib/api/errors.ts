import type { ErrorCode, ErrorPayload } from '@fakhri/shared';

/** The API's structured error (`{ error: { code, message, details, traceId } }`), thrown on both sides. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK',
    message: string,
    public readonly details?: unknown,
    public readonly traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static async from(response: Response): Promise<ApiError> {
    const body = (await response.json().catch(() => null)) as { error?: ErrorPayload } | null;
    const error = body?.error;
    return new ApiError(
      response.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? `Request failed (${response.status})`,
      error?.details,
      error?.traceId,
    );
  }
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
