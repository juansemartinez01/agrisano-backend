import { MigrationInterface, QueryRunner } from "typeorm";

// Solo agrega los valores de enum. Postgres no permite usar un valor de enum
// recien agregado dentro de la misma transaccion que lo agrego, y la migracion
// siguiente crea una tabla con una columna "bandeja_estado" — deben ir
// separadas. Mismo criterio que 1772200000000-BandejaCoolingPeriod.ts.
//
// Los dos ALTER TYPE van juntos porque ninguno de los dos se usa aca: lo que
// no se puede compartir es la transaccion entre agregar el valor y usarlo.
export class BandejaEstadoDescartada1774800000000 implements MigrationInterface {
    name = 'BandejaEstadoDescartada1774800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Al final del enum: 'descartada' es el estado terminal del ciclo.
        await queryRunner.query(`ALTER TYPE "bandeja_estado" ADD VALUE 'descartada'`);
        await queryRunner.query(`ALTER TYPE "historial_tipo_evento" ADD VALUE 'bandeja_descartada'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres no permite DROP VALUE en un enum — los dos valores quedan en
        // sus tipos (misma limitacion ya documentada en migraciones previas).
    }
}
