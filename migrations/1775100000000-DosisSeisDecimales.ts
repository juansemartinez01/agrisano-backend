import { MigrationInterface, QueryRunner } from 'typeorm';

// Dosis de aplicaciones químicas de numeric(10,3) a numeric(13,6), la misma
// escala que ya tienen las cantidades de stock (ver CantidadSeisDecimales).
// Con 3 decimales una dosis como 0.00025 L/L (0.25 mL/L) se guardaba como
// 0.000 y 0.0005 como 0.001, sin error. 13 de precisión conservan los 7
// dígitos enteros que ya admitían las columnas.
//
// Los valores históricos no cambian (1.000 pasa a 1.000000).
export class DosisSeisDecimales1775100000000 implements MigrationInterface {
  name = 'DosisSeisDecimales1775100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ALTER COLUMN "dosis" TYPE numeric(13,6)`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas_detalle" ALTER COLUMN "dosis" TYPE numeric(13,6)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Volver a 3 decimales redondea en silencio: con dosis ya cargadas con más
    // precisión se perdería el dato. Se aborta en lugar de truncar.
    await queryRunner.query(`
      DO $$
      DECLARE n integer;
      BEGIN
        SELECT
          (SELECT count(*) FROM "aplicaciones_quimicas"
            WHERE "dosis" <> round("dosis", 3))
          + (SELECT count(*) FROM "aplicaciones_quimicas_detalle"
            WHERE "dosis" <> round("dosis", 3))
        INTO n;
        IF n > 0 THEN
          RAISE EXCEPTION 'No se puede volver a numeric(10,3): % fila(s) tienen dosis con más de 3 decimales', n;
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas_detalle" ALTER COLUMN "dosis" TYPE numeric(10,3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ALTER COLUMN "dosis" TYPE numeric(10,3)`,
    );
  }
}
