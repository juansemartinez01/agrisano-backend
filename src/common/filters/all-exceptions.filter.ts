import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { captureException } from 'src/infra/observability/sentry/sentry';
import { AuditService } from 'src/modules/audit/audit.service';
import { ErrorCodes, type ErrorCode } from '../errors/error-codes';
import { ApiResponse } from '../http/api-response';

const ERROR_CODE_SET = new Set<string>(Object.values(ErrorCodes));

function isErrorCode(v: any): v is ErrorCode {
  return typeof v === 'string' && ERROR_CODE_SET.has(v);
}

type NormalizedError = {
  code: string;
  message: string;
  details?: any;
};

export function fail(
  code: ErrorCode,
  message: string,
  details?: any,
): ApiResponse<null> {
  return { ok: false, error: { code, message, details } };
}

function isObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Soporta:
 * 1) AppError nuevo: { code, message, details }
 * 2) AppError viejo (por compat): { ok:false, error:{ code,message,details } }
 * 3) HttpException nest: { message: string | string[], error: 'Bad Request', statusCode: 400 }
 */
function extractNormalizedError(
  exception: any,
  status: number,
): NormalizedError {
  // defaults
  let code: ErrorCode =
    status >= 500 ? ErrorCodes.INTERNAL : ErrorCodes.BAD_REQUEST;
  let message = exception?.message ?? 'Unexpected error';
  let details: any = undefined;

  // Clasificación por tipo de excepción (cuando NO es AppError)
  if (exception instanceof UnauthorizedException)
    code = ErrorCodes.AUTH_INVALID;
  else if (exception instanceof ForbiddenException)
    code = ErrorCodes.AUTH_FORBIDDEN;
  else if (exception instanceof NotFoundException) code = ErrorCodes.NOT_FOUND;
  else if (exception instanceof ConflictException) code = ErrorCodes.CONFLICT;
  else if (exception instanceof BadRequestException)
    code = ErrorCodes.BAD_REQUEST;

  // Throttler (si está instalado)
  // Evitamos importar ThrottlerException para no acoplar; detectamos por name
  if (exception?.name === 'ThrottlerException') {
    code = ErrorCodes.RATE_LIMITED;
    message = 'Too many requests';
  }

  // Si es HttpException, intentamos leer getResponse()
  const httpResp =
    exception instanceof HttpException ? exception.getResponse() : null;

  // 1) AppError nuevo: { code, message, details }
  if (isObject(httpResp) && isErrorCode(httpResp.code)) {
    code = httpResp.code;
    if (typeof httpResp.message === 'string') message = httpResp.message;
    if ('details' in httpResp) details = (httpResp as any).details;
    return { code, message, details };
  }


  // 2) AppError viejo: { ok:false, error:{ code,message,details } }
  if (
    isObject(httpResp) &&
    isObject(httpResp.error) &&
    isErrorCode(httpResp.error.code)
  ) {
    code = httpResp.error.code;
    if (typeof httpResp.error.message === 'string')
      message = httpResp.error.message;
    if ('details' in httpResp.error) details = (httpResp.error as any).details;
    return { code, message, details };
  }


  // 3) Nest típico: { message: string | string[], ... }
  if (isObject(httpResp)) {
    const msg = httpResp.message;
    if (Array.isArray(msg)) message = msg.join(', ');
    else if (typeof msg === 'string') message = msg;
    // detalles “crudos” si querés
    // details = { ...httpResp }  // (opcional)
  }

  // 4) ValidationPipe: message suele ser array de strings
  // Lo convertimos a estructura estable
  if (exception instanceof BadRequestException && isObject(httpResp)) {
    const msg = httpResp.message;
    if (Array.isArray(msg)) {
      details = {
        validationErrors: msg.map((m) => ({ message: String(m) })),
      };
    }
  }

  return { code, message, details };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: PinoLogger,
    private readonly audit: AuditService,
  ) {}

  async catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req: any = ctx.getRequest();
    const res: any = ctx.getResponse();

    const requestId = req?.id ?? null;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const normalized = extractNormalizedError(exception, status);

    const logPayload = {
      context: 'AllExceptionsFilter',
      requestId,
      method: req?.method,
      url: req?.url,
      statusCode: status,
      errorCode: normalized.code,
    };

    // ✅ 5xx: error + audit + sentry
    if (status >= 500) {
      this.logger.error(
        { ...logPayload, err: exception },
        'unhandled_exception',
      );

      await this.audit.write('error_5xx', {
        tenant_id: req?.tenantId ?? null,
        request_id: requestId ?? 'unknown',
        method: req?.method ?? null,
        path: req?.url ?? null,
        status_code: status,
        actor_user_id: req?.user?.sub ?? null,
        actor_email: req?.user?.email ?? null,
        payload: {
          code: normalized.code,
          message: normalized.message,
        },
      });

      captureException(exception, {
        requestId,
        path: req?.url,
        method: req?.method,
        status_code: status,
      });
    } else {
      // ✅ 4xx: warn (sin audit, sin sentry)
      this.logger.warn(logPayload, 'http_exception');
    }

    // ✅ UN SOLO FORMATO FINAL (SIEMPRE)
    return res.status(status).json({
      ok: false,
      requestId,
      statusCode: status,
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details ?? undefined,
      },
      timestamp: new Date().toISOString(),
      path: req?.url,
    });
  }
}
