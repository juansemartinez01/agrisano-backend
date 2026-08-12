import { MigrationInterface, QueryRunner } from "typeorm";

// Solo agrega el valor del enum. Postgres no permite usar un valor de enum
// recién agregado dentro de la misma transacción que lo agregó (ver
// migración siguiente, que sí lo usa en el CHECK de "grado") — deben ir
// separadas. Mismo patrón que 1772200000000-BandejaCoolingPeriod.
export class LoteTipoVermiculita1774500000000 implements MigrationInterface {
    name = 'LoteTipoVermiculita1774500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "lote_tipo" ADD VALUE 'vermiculita'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres no permite DROP VALUE en un enum — 'vermiculita' queda en el tipo
        // (misma limitación ya documentada en migraciones previas de este proyecto).
        // La reversión real de la feature la hace la migración siguiente: sin la
        // columna "grado" ni "bandejas"."lote_vermiculita_id", el valor es inerte.
    }
}
