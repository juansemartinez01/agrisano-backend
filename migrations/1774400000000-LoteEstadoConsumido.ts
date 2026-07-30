import { MigrationInterface, QueryRunner } from "typeorm";

// Segundo eje de estado para lotes, independiente de "activo" (baja
// administrativa): habilitado/consumido. DEFAULT 'habilitado' cubre todas
// las filas existentes sin backfill (todo lote, nuevo o preexistente, nace
// habilitado salvo que alguien lo consuma explícitamente). Sin FK en
// usuario_consumido_id, mismo criterio que el resto del codebase.
export class LoteEstadoConsumido1774400000000 implements MigrationInterface {
    name = 'LoteEstadoConsumido1774400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "lote_estado" AS ENUM ('habilitado', 'consumido')`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "estado" "lote_estado" NOT NULL DEFAULT 'habilitado'`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "fecha_consumido" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "usuario_consumido_id" uuid`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "usuario_consumido_email_snapshot" character varying(150)`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "usuario_consumido_nombre_snapshot" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "usuario_consumido_apellido_snapshot" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "observaciones_consumo" text`);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_estado" ON "lotes" ("estado")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_lotes_estado"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "observaciones_consumo"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "usuario_consumido_apellido_snapshot"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "usuario_consumido_nombre_snapshot"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "usuario_consumido_email_snapshot"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "usuario_consumido_id"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "fecha_consumido"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "estado"`);
        await queryRunner.query(`DROP TYPE "lote_estado"`);
    }

}
