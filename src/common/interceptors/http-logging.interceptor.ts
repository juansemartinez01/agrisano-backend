import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req: any = http.getRequest();
    const res: any = http.getResponse();

    const start = Date.now();

    this.logger.info(
      {
        context: 'HttpLoggingInterceptor',
        requestId: req.id,
        method: req.method,
        url: req.url,
      },
      'http_in',
    );

    return next.handle().pipe(
      tap(() => {
        this.logger.info(
          {
            context: 'HttpLoggingInterceptor',
            requestId: req.id,
            statusCode: res.statusCode,
            duration_ms: Date.now() - start,
          },
          'http_out',
        );
      }),
    );
  }
}

