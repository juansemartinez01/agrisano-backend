import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-codes';

export class AppError extends HttpException {
  readonly code: ErrorCode;
  readonly details?: any;

  constructor(opts: {
    code: ErrorCode;
    message: string;
    status?: number;
    details?: any;
  }) {
    const status = opts.status ?? HttpStatus.BAD_REQUEST;

    // ✅ IMPORTANTE: AppError ya transporta el error “puro”.
    // El envelope final lo arma AllExceptionsFilter (1 solo formato en toda la API).
    super(
      {
        code: opts.code,
        message: opts.message,
        details: opts.details ?? undefined,
      },
      status,
    );

    this.code = opts.code;
    this.details = opts.details;
  }
}
