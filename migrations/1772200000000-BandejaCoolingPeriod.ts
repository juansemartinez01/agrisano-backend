import { MigrationInterface, QueryRunner } from "typeorm";

// Solo agrega el valor del enum. Postgres no permite usar un valor de enum
// recién agregado dentro de la misma transacción que lo agregó (ver
// migración siguiente, que sí lo usa en un DEFAULT) — deben ir separadas.
export class BandejaCoolingPeriod1772200000000 implements MigrationInterface {
    name = 'BandejaCoolingPeriod1772200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "bandeja_estado" ADD VALUE 'cooling_period' BEFORE 'en_nursery'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres no permite DROP VALUE en un enum — 'cooling_period' queda en el tipo
        // (misma limitación ya documentada en migraciones previas de este proyecto)
    }
}
