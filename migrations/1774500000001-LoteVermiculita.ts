import { MigrationInterface, QueryRunner } from "typeorm";

// Tercer tipo de lote: vermiculita. Usa el valor de enum agregado por la
// migración anterior (1774500000000), que va aparte por la restricción
// transaccional de Postgres.
//
// "grado" nace NULL en todas las filas existentes y el CHECK bicondicional se
// satisface trivialmente para semilla y sustrato — no hace falta backfill.
//
// "bandejas"."lote_vermiculita_id" es nullable a diferencia de lote_semilla_id
// y lote_sustrato_id (NOT NULL): la vermiculita es opcional al sembrar y las
// bandejas históricas no la llevaron, así que no existe backfill honesto.
export class LoteVermiculita1774500000001 implements MigrationInterface {
    name = 'LoteVermiculita1774500000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lotes" ADD "grado" smallint`);
        await queryRunner.query(`
            ALTER TABLE "lotes" ADD CONSTRAINT "CHK_lotes_grado" CHECK (
                ("tipo" =  'vermiculita' AND "grado" IS NOT NULL AND "grado" BETWEEN 1 AND 3) OR
                ("tipo" <> 'vermiculita' AND "grado" IS NULL)
            )
        `);
        await queryRunner.query(`ALTER TABLE "bandejas" ADD "lote_vermiculita_id" uuid`);
        await queryRunner.query(`
            ALTER TABLE "bandejas" ADD CONSTRAINT "FK_bandejas_lote_vermiculita"
                FOREIGN KEY ("lote_vermiculita_id") REFERENCES "lotes"("id")
        `);
        await queryRunner.query(`CREATE INDEX "IDX_bandejas_lote_vermiculita_id" ON "bandejas" ("lote_vermiculita_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_bandejas_lote_vermiculita_id"`);
        await queryRunner.query(`ALTER TABLE "bandejas" DROP CONSTRAINT "FK_bandejas_lote_vermiculita"`);
        await queryRunner.query(`ALTER TABLE "bandejas" DROP COLUMN "lote_vermiculita_id"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP CONSTRAINT "CHK_lotes_grado"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "grado"`);
    }
}
