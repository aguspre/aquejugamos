const APP_ERROR_BRAND = Symbol.for('aquejugamos.AppError');

export class AppError extends Error {
  public readonly [APP_ERROR_BRAND] = true as const;
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static [Symbol.hasInstance](instance: unknown): boolean {
    return isAppError(instance);
  }
}

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<PropertyKey, unknown>;
  return (
    candidate[APP_ERROR_BRAND] === true ||
    (candidate.name === 'AppError' &&
      typeof candidate.statusCode === 'number' &&
      Number.isInteger(candidate.statusCode) &&
      candidate.statusCode >= 100 &&
      candidate.statusCode <= 599 &&
      typeof candidate.code === 'string' &&
      typeof candidate.message === 'string')
  );
}

export const badRequest = (message: string, details?: unknown, code = 'BAD_REQUEST') =>
  new AppError(400, code, message, details);

export const unauthorized = (message = 'No autenticado', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);

export const forbidden = (message = 'Acceso denegado', code = 'FORBIDDEN') =>
  new AppError(403, code, message);

export const notFound = (message = 'Recurso no encontrado', code = 'NOT_FOUND') =>
  new AppError(404, code, message);

export const conflict = (message: string, code = 'CONFLICT') =>
  new AppError(409, code, message);

export const tooManyRequests = (
  message: string,
  code = 'TOO_MANY_REQUESTS',
  details?: unknown,
) => new AppError(429, code, message, details);

export const badGateway = (message: string, code = 'BAD_GATEWAY', details?: unknown) =>
  new AppError(502, code, message, details);

export const serviceUnavailable = (message: string, code = 'SERVICE_UNAVAILABLE') =>
  new AppError(503, code, message);
