import { Injectable } from '@nestjs/common';
import { getTenantContext } from './tenant-context';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

@Injectable()
export class TenancyService {
  getTenantId(): string | null {
    return getTenantContext().tenantId;
  }

  getTenantKey(): string | null {
    return getTenantContext().tenantKey;
  }

  requireTenantId(): string {
    const id = this.getTenantId();
    if (!id) {
      throw new AppError({
        code: ErrorCodes.TENANT_REQUIRED,
        message: 'Tenant is required',
        status: 400,
      });
    }
    return id;
  }
}
