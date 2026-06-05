import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    tenantId?: string | null;
    tenantKey?: string | null;
  }
}
