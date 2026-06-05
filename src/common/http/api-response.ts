export type ApiError = {
  code: string;
  message: string;
  details?: any;
};

export type ApiMeta = {
  page?: number;
  limit?: number;
  total?: number;
};

export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  meta?: ApiMeta;
  error?: ApiError;
};

export function ok<T>(data: T, meta?: ApiMeta): ApiResponse<T> {
  return { ok: true, data, meta };
}

export function fail(
  code: string,
  message: string,
  details?: any,
): ApiResponse<null> {
  return { ok: false, error: { code, message, details } };
}

export function page<T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
): ApiResponse<T[]> {
  return ok(items, { page, limit, total });
}
