import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantIdCoreTables1769994200000 implements MigrationInterface {
  name = 'AddTenantIdCoreTables1769994200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================
    // users (tenant-scoped)
    // =========================
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "tenant_id" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_tenant_id"
      ON "users" ("tenant_id")
    `);

    // opcional/recomendado: búsquedas por email dentro del tenant
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_tenant_id_email"
      ON "users" ("tenant_id", "email")
    `);

    // =========================
    // refresh_tokens (tenant-scoped)
    // =========================
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "tenant_id" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_tenant_id"
      ON "refresh_tokens" ("tenant_id")
    `);

    // opcional/recomendado: queries por user_id dentro del tenant
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_tenant_id_user_id"
      ON "refresh_tokens" ("tenant_id", "user_id")
    `);

    // =========================
    // audit_logs (tenant-scoped)
    // =========================
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
      ADD COLUMN IF NOT EXISTS "tenant_id" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_tenant_id"
      ON "audit_logs" ("tenant_id")
    `);

    // opcional/recomendado: para filtros típicos (tenant + created_at)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_tenant_id_created_at"
      ON "audit_logs" ("tenant_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // audit_logs
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_logs_tenant_id_created_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_tenant_id"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "tenant_id"`,
    );

    // refresh_tokens
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_refresh_tokens_tenant_id_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_refresh_tokens_tenant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "tenant_id"`,
    );

    // users
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_tenant_id_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_tenant_id"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "tenant_id"`,
    );
  }
}
