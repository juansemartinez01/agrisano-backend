import { MigrationInterface, QueryRunner } from "typeorm";

export class TareasInit1774700000000 implements MigrationInterface {
    name = 'TareasInit1774700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "tarea_ambito" AS ENUM ('nursery', 'greenhouse')`);
        await queryRunner.query(`CREATE TYPE "tarea_estado" AS ENUM ('pendiente', 'en_progreso', 'completada', 'cancelada')`);

        await queryRunner.query(`
            CREATE TABLE "tareas" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "establecimiento_id" uuid NOT NULL,
                "ambito" "tarea_ambito" NOT NULL,
                "estado" "tarea_estado" NOT NULL DEFAULT 'pendiente',
                "titulo" character varying(150) NOT NULL,
                "descripcion" text,
                "asignado_a_usuario_id" uuid,
                "orden" integer NOT NULL,
                "creada_por_usuario_id" uuid NOT NULL,
                "completada_at" TIMESTAMP WITH TIME ZONE,
                "completada_por_usuario_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_tareas" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_tareas_tenant_id" ON "tareas" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_tareas_tablero" ON "tareas" ("tenant_id", "establecimiento_id", "ambito", "orden")`);
        await queryRunner.query(`CREATE INDEX "IDX_tareas_estado" ON "tareas" ("tenant_id", "establecimiento_id", "estado")`);
        // Parcial: la mayoria de las tareas no tiene responsable asignado, asi que
        // el indice solo cubre las filas que el filtro "mis tareas" puede devolver.
        await queryRunner.query(`
            CREATE INDEX "IDX_tareas_asignado" ON "tareas" ("tenant_id", "asignado_a_usuario_id")
                WHERE "asignado_a_usuario_id" IS NOT NULL
        `);

        // NO ACTION en las cuatro: establecimientos y users se dan de baja logicamente,
        // nunca se borran fisicamente, y perder el rastro de quien creo o cerro una
        // tarea seria peor que fallar ante un borrado manual en la base.
        await queryRunner.query(`
            ALTER TABLE "tareas" ADD CONSTRAINT "FK_tareas_establecimiento"
                FOREIGN KEY ("establecimiento_id") REFERENCES "establecimientos"("id")
                ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "tareas" ADD CONSTRAINT "FK_tareas_asignado"
                FOREIGN KEY ("asignado_a_usuario_id") REFERENCES "users"("id")
                ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "tareas" ADD CONSTRAINT "FK_tareas_creada_por"
                FOREIGN KEY ("creada_por_usuario_id") REFERENCES "users"("id")
                ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "tareas" ADD CONSTRAINT "FK_tareas_completada_por"
                FOREIGN KEY ("completada_por_usuario_id") REFERENCES "users"("id")
                ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tareas" DROP CONSTRAINT "FK_tareas_completada_por"`);
        await queryRunner.query(`ALTER TABLE "tareas" DROP CONSTRAINT "FK_tareas_creada_por"`);
        await queryRunner.query(`ALTER TABLE "tareas" DROP CONSTRAINT "FK_tareas_asignado"`);
        await queryRunner.query(`ALTER TABLE "tareas" DROP CONSTRAINT "FK_tareas_establecimiento"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_tareas_asignado"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tareas_estado"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tareas_tablero"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tareas_tenant_id"`);

        await queryRunner.query(`DROP TABLE "tareas"`);

        await queryRunner.query(`DROP TYPE "tarea_estado"`);
        await queryRunner.query(`DROP TYPE "tarea_ambito"`);
    }

}
