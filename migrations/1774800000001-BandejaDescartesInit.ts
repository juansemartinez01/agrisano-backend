import { MigrationInterface, QueryRunner } from "typeorm";

export class BandejaDescartesInit1774800000001 implements MigrationInterface {
    name = 'BandejaDescartesInit1774800000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Conjunto cerrado: sumar un motivo es un ALTER TYPE, no una pantalla
        // de administracion.
        await queryRunner.query(`
            CREATE TYPE "bandeja_descarte_motivo" AS ENUM (
                'caida', 'rotura', 'contaminacion', 'plaga',
                'mala_germinacion', 'error_carga', 'otro'
            )
        `);

        // PK sobre bandeja_id: como maximo una perdida por bandeja, garantizado
        // por la base. Append-only, asi que no lleva updated_at ni deleted_at.
        await queryRunner.query(`
            CREATE TABLE "bandeja_descartes" (
                "bandeja_id" uuid NOT NULL,
                "tenant_id" uuid,
                "estado_anterior" "bandeja_estado" NOT NULL,
                "motivo" "bandeja_descarte_motivo" NOT NULL,
                "observaciones" text,
                "fecha_descarte" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "usuario_id" uuid NOT NULL,
                "usuario_email_snapshot" character varying(150),
                "usuario_nombre_snapshot" character varying(100),
                "usuario_apellido_snapshot" character varying(100),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_bandeja_descartes" PRIMARY KEY ("bandeja_id")
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_bandeja_descartes_tenant_id" ON "bandeja_descartes" ("tenant_id")`);
        // Analisis de mermas por causa y por rango de fechas.
        await queryRunner.query(`CREATE INDEX "IDX_bandeja_descartes_motivo" ON "bandeja_descartes" ("motivo")`);
        await queryRunner.query(`CREATE INDEX "IDX_bandeja_descartes_fecha" ON "bandeja_descartes" ("fecha_descarte")`);

        // Sin ON DELETE CASCADE en ninguna de las dos: las bandejas se dan de
        // baja logicamente y los usuarios tampoco se borran fisicamente. La
        // constancia de una perdida no debe poder desaparecer en cascada; si
        // alguien borra a mano en la base, es preferible que la FK falle.
        await queryRunner.query(`
            ALTER TABLE "bandeja_descartes" ADD CONSTRAINT "FK_bandeja_descartes_bandeja"
                FOREIGN KEY ("bandeja_id") REFERENCES "bandejas"("id")
                ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "bandeja_descartes" ADD CONSTRAINT "FK_bandeja_descartes_usuario"
                FOREIGN KEY ("usuario_id") REFERENCES "users"("id")
                ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bandeja_descartes" DROP CONSTRAINT "FK_bandeja_descartes_usuario"`);
        await queryRunner.query(`ALTER TABLE "bandeja_descartes" DROP CONSTRAINT "FK_bandeja_descartes_bandeja"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_bandeja_descartes_fecha"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bandeja_descartes_motivo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bandeja_descartes_tenant_id"`);

        await queryRunner.query(`DROP TABLE "bandeja_descartes"`);

        await queryRunner.query(`DROP TYPE "bandeja_descarte_motivo"`);
    }

}
