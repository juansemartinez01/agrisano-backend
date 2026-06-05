import { MigrationInterface, QueryRunner } from "typeorm";

export class QuimicosInit1770600000000 implements MigrationInterface {
    name = 'QuimicosInit1770600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "principios_activos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "nombre" character varying(100) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_principios_activos_nombre" UNIQUE ("nombre"),
                CONSTRAINT "PK_principios_activos" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "quimicos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "establecimiento_id" uuid NOT NULL,
                "nombre" character varying(150) NOT NULL,
                "unidad_medida" character varying(30) NOT NULL,
                "stock_actual" numeric(10,3) NOT NULL DEFAULT 0,
                "activo" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_quimicos" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "quimico_principio_activo" (
                "quimico_id" uuid NOT NULL,
                "principio_activo_id" uuid NOT NULL,
                CONSTRAINT "PK_quimico_principio_activo" PRIMARY KEY ("quimico_id", "principio_activo_id"),
                CONSTRAINT "FK_qpa_quimico" FOREIGN KEY ("quimico_id")
                    REFERENCES "quimicos"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_qpa_principio_activo" FOREIGN KEY ("principio_activo_id")
                    REFERENCES "principios_activos"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_quimicos_tenant_id" ON "quimicos" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_quimicos_establecimiento_id" ON "quimicos" ("establecimiento_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_quimicos_activo" ON "quimicos" ("activo")`);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_quimicos_tenant_est_nombre"
                ON "quimicos" ("tenant_id", "establecimiento_id", "nombre")
                WHERE "deleted_at" IS NULL
        `);
        await queryRunner.query(`CREATE INDEX "IDX_qpa_principio_activo_id" ON "quimico_principio_activo" ("principio_activo_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_qpa_principio_activo_id"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_quimicos_tenant_est_nombre"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_quimicos_activo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_quimicos_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_quimicos_tenant_id"`);
        await queryRunner.query(`DROP TABLE "quimico_principio_activo"`);
        await queryRunner.query(`DROP TABLE "quimicos"`);
        await queryRunner.query(`DROP TABLE "principios_activos"`);
    }

}
