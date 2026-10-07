import { MigrationInterface, QueryRunner } from 'typeorm';

// Cantidades de stock químico de numeric(10,3) a numeric(13,6): 6 decimales
// para poder repartir consumos chicos entre muchos chunks de una misma
// operación lógica, y 13 de precisión para conservar los 7 dígitos enteros
// que ya admitían las columnas (con (10,6) quedarían 4 y un lote grande
// desbordaría).
//
// Los valores históricos no cambian (1.500 pasa a 1.500000). No se tocan las
// columnas `dosis`: la dosis sigue en 3 decimales.
export class CantidadSeisDecimales1775000000000 implements MigrationInterface {
  name = 'CantidadSeisDecimales1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas_detalle" ALTER COLUMN "cantidad" TYPE numeric(13,6)`,
    );
    await queryRunner.query(
      `ALTER TABLE "lotes_quimicos" ALTER COLUMN "cantidad_inicial" TYPE numeric(13,6)`,
    );
    await queryRunner.query(
      `ALTER TABLE "lotes_quimicos" ALTER COLUMN "cantidad_actual" TYPE numeric(13,6)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Volver a 3 decimales redondea en silencio: con aplicaciones o stock ya
    // cargados con más precisión se perdería consumo real. Se aborta en lugar
    // de truncar.
    await queryRunner.query(`
      DO $$
      DECLARE n integer;
      BEGIN
        SELECT
          (SELECT count(*) FROM "aplicaciones_quimicas_detalle"
            WHERE "cantidad" <> round("cantidad", 3))
          + (SELECT count(*) FROM "lotes_quimicos"
            WHERE "cantidad_inicial" <> round("cantidad_inicial", 3)
               OR "cantidad_actual" <> round("cantidad_actual", 3))
        INTO n;
        IF n > 0 THEN
          RAISE EXCEPTION 'No se puede volver a numeric(10,3): % fila(s) tienen más de 3 decimales', n;
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "lotes_quimicos" ALTER COLUMN "cantidad_actual" TYPE numeric(10,3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "lotes_quimicos" ALTER COLUMN "cantidad_inicial" TYPE numeric(10,3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas_detalle" ALTER COLUMN "cantidad" TYPE numeric(10,3)`,
    );
  }
}
