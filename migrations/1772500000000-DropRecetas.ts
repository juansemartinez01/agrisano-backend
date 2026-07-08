import { MigrationInterface, QueryRunner } from "typeorm";

// El módulo Recetas quedó huérfano: aplicaciones_quimicas.receta_id se eliminó
// en el refactor de gestión de químicos por lote y nada más lo referencia.
export class DropRecetas1772500000000 implements MigrationInterface {
    name = 'DropRecetas1772500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_recetas_tenant_est_nombre"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_recetas_activo"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_recetas_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_recetas_tenant_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "recetas"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "recetas" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "establecimiento_id" uuid NOT NULL,
                "nombre" character varying(150) NOT NULL,
                "descripcion" text,
                "activo" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_recetas" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_recetas_tenant_id" ON "recetas" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_recetas_establecimiento_id" ON "recetas" ("establecimiento_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_recetas_activo" ON "recetas" ("activo")`);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_recetas_tenant_est_nombre"
                ON "recetas" ("tenant_id", "establecimiento_id", "nombre")
                WHERE "deleted_at" IS NULL
        `);
    }
}
