// src/modules/tenancy/tenant-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantContextStore = {
  tenantId: string | null;
  tenantKey: string | null;
  requestId?: string | null;
};

export const tenantContext = new AsyncLocalStorage<TenantContextStore>();

export function getTenantContext(): TenantContextStore {
  return tenantContext.getStore() ?? { tenantId: null, tenantKey: null };
}
