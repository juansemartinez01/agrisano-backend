import { MigrationInterface, QueryRunner } from "typeorm";

export class LoteProveedorSemilla1771800000000 implements MigrationInterface {
    name = 'LoteProveedorSemilla1771800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "seed_company"`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "proveedor_semilla_id" uuid`);
        await queryRunner.query(`
            ALTER TABLE "lotes" ADD CONSTRAINT "FK_lotes_proveedor_semilla"
                FOREIGN KEY ("proveedor_semilla_id") REFERENCES "proveedores"("id")
        `);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_proveedor_semilla_id" ON "lotes" ("proveedor_semilla_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_lotes_proveedor_semilla_id"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP CONSTRAINT "FK_lotes_proveedor_semilla"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "proveedor_semilla_id"`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "seed_company" character varying(200)`);
    }

}
