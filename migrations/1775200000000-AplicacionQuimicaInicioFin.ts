import { MigrationInterface, QueryRunner } from 'typeorm';

// Inicio y fin de cada aplicación química (cuánto tardó el operario).
// `fecha_hora` se conserva y pasa a ser siempre igual a `fecha_hora_fin`
// (ancla de carencia, orden y trazabilidad). Filas anteriores: ambas NULL,
// sin backfill. ADD COLUMN nullable es instantáneo; los CHECK pasan por la
// rama IS NULL sobre las filas existentes.
export class AplicacionQuimicaInicioFin1775200000000
  implements MigrationInterface
{
  name = 'AplicacionQuimicaInicioFin1775200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ADD "fecha_hora_inicio" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ADD "fecha_hora_fin" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ADD CONSTRAINT "CHK_aplicacion_fin_eq_fecha_hora" CHECK ("fecha_hora_fin" IS NULL OR "fecha_hora_fin" = "fecha_hora")`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ADD CONSTRAINT "CHK_aplicacion_inicio_fin_par" CHECK (("fecha_hora_inicio" IS NULL) = ("fecha_hora_fin" IS NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ADD CONSTRAINT "CHK_aplicacion_inicio_lte_fin" CHECK ("fecha_hora_inicio" IS NULL OR "fecha_hora_inicio" <= "fecha_hora_fin")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" DROP CONSTRAINT "CHK_aplicacion_inicio_lte_fin"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" DROP CONSTRAINT "CHK_aplicacion_inicio_fin_par"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" DROP CONSTRAINT "CHK_aplicacion_fin_eq_fecha_hora"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "fecha_hora_fin"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "fecha_hora_inicio"`,
    );
  }
}
