import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';

import { AppModule } from '../../app.module';
import { UsersService } from '../../modules/users/users.service';
import { ConfigService } from '@nestjs/config';
import { tenantContext } from '../../modules/tenancy/tenant-context';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  const usersService = app.get(UsersService);
  const config = app.get(ConfigService);

  const adminEmail = config.get<string>('SEED_ADMIN_EMAIL');
  const adminPassword = config.get<string>('SEED_ADMIN_PASSWORD');
  const seedTenantId = config.get<string>('SEED_TENANT_ID');

  if (!adminEmail || !adminPassword) {
    await app.close();
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required');
  }

  if (!seedTenantId) {
    await app.close();
    throw new Error('SEED_TENANT_ID is required');
  }

  await tenantContext.run({ tenantId: seedTenantId, tenantKey: 'seed' }, async () => {
    const existing = await usersService.findByEmail(adminEmail);

    if (existing) {
      console.log('✅ Admin user already exists, skipping seed');
      return;
    }

    const password_hash = await bcrypt.hash(adminPassword, 10);

    // createUser calls getOrCreateRole('admin') internally — role is created if missing
    const admin = await usersService.createUser({
      tenant_id: seedTenantId,
      email: adminEmail,
      password_hash,
      roleNames: ['admin'],
    });

    console.log('✅ Admin user created');
    console.log({
      id: admin.id,
      email: admin.email,
      roles: admin.roles.map((r) => r.name),
    });
  });

  await app.close();
}

bootstrap().catch((err) => {
  console.error('❌ Seed failed', err);
  process.exit(1);
});
