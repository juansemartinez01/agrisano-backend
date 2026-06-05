import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const nodeEnv = cfg.get<string>('nodeEnv') ?? 'development';
        const level = cfg.get<string>('LOG_LEVEL') ?? 'info';
        const pretty =
          (cfg.get<string>('LOG_PRETTY') ?? 'true').toLowerCase().trim() ===
          'true';

        return {
          pinoHttp: {
            level,
            // requestId lo resolvemos acá, así queda en todos los logs
            genReqId: (req, res) => {
              const header =
                (req.headers['x-request-id'] as string) ||
                (req.headers['x-correlation-id'] as string);

              const id =
                header ||
                (globalThis.crypto?.randomUUID?.() ??
                  `${Date.now()}-${Math.random().toString(16).slice(2)}`);

              res.setHeader('x-request-id', id);
              return id;
            },

            // Serialización mínima para no loguear cosas sensibles
            serializers: {
              req(req) {
                return {
                  id: req.id,
                  method: req.method,
                  url: req.url,
                  remoteAddress: req.remoteAddress,
                  userAgent: req.headers?.['user-agent'],
                };
              },
              res(res) {
                return {
                  statusCode: res.statusCode,
                };
              },
            },

            // Redactar headers sensibles
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["set-cookie"]',
              ],
              remove: true,
            },

            // Pretty sólo en dev (o si lo forzás)
            transport:
              pretty && nodeEnv !== 'production'
                ? {
                    target: 'pino-pretty',
                    options: {
                      singleLine: true,
                      translateTime: 'SYS:standard',
                      ignore: 'pid,hostname',
                    },
                  }
                : undefined,
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
