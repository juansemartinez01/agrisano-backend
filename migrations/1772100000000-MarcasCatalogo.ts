import { MigrationInterface, QueryRunner } from "typeorm";

export class MarcasCatalogo1772100000000 implements MigrationInterface {
    name = 'MarcasCatalogo1772100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "marcas" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "nombre" character varying(150) NOT NULL,
                "activo" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_marcas" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_marcas_tenant_id" ON "marcas" ("tenant_id")`);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_marcas_tenant_nombre"
                ON "marcas" ("tenant_id", "nombre")
                WHERE "deleted_at" IS NULL
        `);

        await queryRunner.query(`ALTER TABLE "quimicos" ADD "marca_id" uuid`);
        await queryRunner.query(`
            ALTER TABLE "quimicos" ADD CONSTRAINT "FK_quimicos_marca"
                FOREIGN KEY ("marca_id") REFERENCES "marcas"("id")
        `);
        await queryRunner.query(`CREATE INDEX "IDX_quimicos_marca_id" ON "quimicos" ("marca_id")`);

        await queryRunner.query(`ALTER TABLE "lotes" ADD "marca_id" uuid`);
        await queryRunner.query(`
            ALTER TABLE "lotes" ADD CONSTRAINT "FK_lotes_marca"
                FOREIGN KEY ("marca_id") REFERENCES "marcas"("id")
        `);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_marca_id" ON "lotes" ("marca_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lotes_marca_id"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP CONSTRAINT "FK_lotes_marca"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "marca_id"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quimicos_marca_id"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP CONSTRAINT "FK_quimicos_marca"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "marca_id"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_marcas_tenant_nombre"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_marcas_tenant_id"`);
        await queryRunner.query(`DROP TABLE "marcas"`);
    }
}
