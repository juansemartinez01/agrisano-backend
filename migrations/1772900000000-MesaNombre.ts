import { MigrationInterface, QueryRunner } from "typeorm";

export class MesaNombre1772900000000 implements MigrationInterface {
    name = 'MesaNombre1772900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mesas" ADD "nombre" character varying(100)`);

        // Backfill existing rows: use current posicion_actual where present,
        // otherwise fall back to a short id fragment (unique per row) so the
        // column can be made NOT NULL without collisions.
        await queryRunner.query(`
            UPDATE "mesas"
            SET "nombre" = COALESCE('Mesa ' || "posicion_actual"::text, 'Mesa ' || substr("id"::text, 1, 8))
            WHERE "nombre" IS NULL
        `);

        await queryRunner.query(`ALTER TABLE "mesas" ALTER COLUMN "nombre" SET NOT NULL`);

        // One name per tunel — mirrors UQ_mesas_tunel_posicion
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_mesas_tunel_nombre"
                ON "mesas" ("tunel_id", "nombre")
                WHERE "deleted_at" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_mesas_tunel_nombre"`);
        await queryRunner.query(`ALTER TABLE "mesas" DROP COLUMN "nombre"`);
    }

}
