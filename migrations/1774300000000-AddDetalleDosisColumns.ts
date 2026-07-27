import { MigrationInterface, QueryRunner } from "typeorm";

// Los químicos adicionales (aplicaciones_quimicas_detalle) nunca capturaron
// dosis/dosis_unidad al crearse, a diferencia del químico principal
// (aplicaciones_quimicas.dosis/dosis_unidad). Reutiliza el enum
// "quimico_rate_unidad" ya existente (AddChemicalFields1771500000000) — no
// se crea un tipo nuevo. Sin backfill: filas históricas quedan con NULL a
// propósito, porque el dato nunca existió (mismo criterio que
// AddUsuarioSnapshotColumns1774200000000).
export class AddDetalleDosisColumns1774300000000 implements MigrationInterface {
    name = 'AddDetalleDosisColumns1774300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas_detalle" ADD "dosis" numeric(10,3)`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas_detalle" ADD "dosis_unidad" "quimico_rate_unidad"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas_detalle" DROP COLUMN "dosis_unidad"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas_detalle" DROP COLUMN "dosis"`);
    }

}
