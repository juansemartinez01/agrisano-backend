import { MigrationInterface, QueryRunner } from "typeorm";

// QA Etapa 2 (integridad de datos): agrega las FKs que faltaban desde la
// creación de cada tabla. NO aplicar todavía — antes de correr esta migración
// en Railway hay que confirmar que no existan filas huérfanas (Etapa 7),
// porque un ADD CONSTRAINT sobre datos huérfanos falla.
export class AddMissingForeignKeys1772700000000 implements MigrationInterface {
    name = 'AddMissingForeignKeys1772700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // cosechas -> mesas / tuneles
        await queryRunner.query(`
            ALTER TABLE "cosechas" ADD CONSTRAINT "FK_cosechas_mesa"
                FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "cosechas" ADD CONSTRAINT "FK_cosechas_tunel"
                FOREIGN KEY ("tunel_id") REFERENCES "tuneles"("id")
        `);

        // mesas -> tuneles
        await queryRunner.query(`
            ALTER TABLE "mesas" ADD CONSTRAINT "FK_mesas_tunel"
                FOREIGN KEY ("tunel_id") REFERENCES "tuneles"("id")
        `);

        // historial_mesa -> mesas
        await queryRunner.query(`
            ALTER TABLE "historial_mesa" ADD CONSTRAINT "FK_historial_mesa_mesa"
                FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id")
        `);

        // bandejas -> mesas / establecimientos
        await queryRunner.query(`
            ALTER TABLE "bandejas" ADD CONSTRAINT "FK_bandejas_mesa"
                FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "bandejas" ADD CONSTRAINT "FK_bandejas_establecimiento"
                FOREIGN KEY ("establecimiento_id") REFERENCES "establecimientos"("id")
        `);

        // aplicaciones_quimicas -> establecimientos
        await queryRunner.query(`
            ALTER TABLE "aplicaciones_quimicas" ADD CONSTRAINT "FK_aq_establecimiento"
                FOREIGN KEY ("establecimiento_id") REFERENCES "establecimientos"("id")
        `);

        // aplicaciones_quimicas_detalle -> aplicaciones_quimicas
        await queryRunner.query(`
            ALTER TABLE "aplicaciones_quimicas_detalle" ADD CONSTRAINT "FK_aqd_aplicacion"
                FOREIGN KEY ("aplicacion_id") REFERENCES "aplicaciones_quimicas"("id")
        `);

        // aplicacion_quimica_bandeja -> aplicaciones_quimicas / bandejas
        await queryRunner.query(`
            ALTER TABLE "aplicacion_quimica_bandeja" ADD CONSTRAINT "FK_aqb_aplicacion"
                FOREIGN KEY ("aplicacion_id") REFERENCES "aplicaciones_quimicas"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "aplicacion_quimica_bandeja" ADD CONSTRAINT "FK_aqb_bandeja"
                FOREIGN KEY ("bandeja_id") REFERENCES "bandejas"("id")
        `);

        // aplicacion_quimica_mesa -> aplicaciones_quimicas / mesas
        await queryRunner.query(`
            ALTER TABLE "aplicacion_quimica_mesa" ADD CONSTRAINT "FK_aqm_aplicacion"
                FOREIGN KEY ("aplicacion_id") REFERENCES "aplicaciones_quimicas"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "aplicacion_quimica_mesa" ADD CONSTRAINT "FK_aqm_mesa"
                FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "aplicacion_quimica_mesa" DROP CONSTRAINT "FK_aqm_mesa"`);
        await queryRunner.query(`ALTER TABLE "aplicacion_quimica_mesa" DROP CONSTRAINT "FK_aqm_aplicacion"`);
        await queryRunner.query(`ALTER TABLE "aplicacion_quimica_bandeja" DROP CONSTRAINT "FK_aqb_bandeja"`);
        await queryRunner.query(`ALTER TABLE "aplicacion_quimica_bandeja" DROP CONSTRAINT "FK_aqb_aplicacion"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas_detalle" DROP CONSTRAINT "FK_aqd_aplicacion"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" DROP CONSTRAINT "FK_aq_establecimiento"`);
        await queryRunner.query(`ALTER TABLE "bandejas" DROP CONSTRAINT "FK_bandejas_establecimiento"`);
        await queryRunner.query(`ALTER TABLE "bandejas" DROP CONSTRAINT "FK_bandejas_mesa"`);
        await queryRunner.query(`ALTER TABLE "historial_mesa" DROP CONSTRAINT "FK_historial_mesa_mesa"`);
        await queryRunner.query(`ALTER TABLE "mesas" DROP CONSTRAINT "FK_mesas_tunel"`);
        await queryRunner.query(`ALTER TABLE "cosechas" DROP CONSTRAINT "FK_cosechas_tunel"`);
        await queryRunner.query(`ALTER TABLE "cosechas" DROP CONSTRAINT "FK_cosechas_mesa"`);
    }
}
