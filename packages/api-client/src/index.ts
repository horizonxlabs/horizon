export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    traceId?: string;
  };
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function success<T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> {
  return { ok: true, data, meta };
}

export function failure(code: string, message: string, traceId?: string): ApiFailure {
  return {
    ok: false,
    error: { code, message, traceId }
  };
}

