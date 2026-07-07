import { MigrationInterface, QueryRunner } from "typeorm";

export class ProveedoresInit1771700000000 implements MigrationInterface {
    name = 'ProveedoresInit1771700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "proveedores" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "establecimiento_id" uuid NOT NULL,
                "nombre" character varying(150) NOT NULL,
                "activo" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_proveedores" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_proveedores_tenant_id" ON "proveedores" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_proveedores_establecimiento_id" ON "proveedores" ("establecimiento_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_proveedores_activo" ON "proveedores" ("activo")`);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_proveedores_tenant_est_nombre"
                ON "proveedores" ("tenant_id", "establecimiento_id", "nombre")
                WHERE "deleted_at" IS NULL
        `);

        // lotes: drop free-text proveedor/supplier, add establecimiento_id (informational,
        // lotes remains shared across establecimientos) and proveedor_id FK
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "proveedor"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "supplier"`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "establecimiento_id" uuid`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "proveedor_id" uuid`);
        await queryRunner.query(`
            ALTER TABLE "lotes" ADD CONSTRAINT "FK_lotes_proveedor"
                FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id")
        `);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_proveedor_id" ON "lotes" ("proveedor_id")`);

        // quimicos: drop free-text supplier, add proveedor_id FK
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "supplier"`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "proveedor_id" uuid`);
        await queryRunner.query(`
            ALTER TABLE "quimicos" ADD CONSTRAINT "FK_quimicos_proveedor"
                FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id")
        `);
        await queryRunner.query(`CREATE INDEX "IDX_quimicos_proveedor_id" ON "quimicos" ("proveedor_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_quimicos_proveedor_id"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP CONSTRAINT "FK_quimicos_proveedor"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "proveedor_id"`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "supplier" character varying(200)`);

        await queryRunner.query(`DROP INDEX "public"."IDX_lotes_proveedor_id"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP CONSTRAINT "FK_lotes_proveedor"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "proveedor_id"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "establecimiento_id"`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "supplier" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "proveedor" character varying(200)`);

        await queryRunner.query(`DROP INDEX "public"."UQ_proveedores_tenant_est_nombre"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_proveedores_activo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_proveedores_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_proveedores_tenant_id"`);
        await queryRunner.query(`DROP TABLE "proveedores"`);
    }

}
