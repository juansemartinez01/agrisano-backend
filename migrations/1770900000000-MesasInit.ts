import { MigrationInterface, QueryRunner } from "typeorm";

export class MesasInit1770900000000 implements MigrationInterface {
    name = 'MesasInit1770900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Step 1: ENUM types
        await queryRunner.query(`CREATE TYPE "mesa_estado" AS ENUM ('activa', 'en_cosecha', 'baja')`);
        await queryRunner.query(`
            CREATE TYPE "historial_tipo_evento" AS ENUM (
                'trasplante',
                'cosecha',
                'cambio_posicion',
                'aplicacion_quimica',
                'reactivacion',
                'baja'
            )
        `);

        // Step 2: mesas table
        await queryRunner.query(`
            CREATE TABLE "mesas" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "establecimiento_id" uuid NOT NULL,
                "tunel_id" uuid NOT NULL,
                "codigo_qr" character varying(100) NOT NULL,
                "posicion_actual" integer,
                "estado" "mesa_estado" NOT NULL DEFAULT 'activa',
                "fecha_ultimo_trasplante" TIMESTAMP WITH TIME ZONE,
                "plantas_estimadas" integer NOT NULL DEFAULT 450,
                "activo" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_mesas" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_mesas_codigo_qr" UNIQUE ("codigo_qr")
            )
        `);

        // Step 3: mesas indexes
        await queryRunner.query(`CREATE INDEX "IDX_mesas_tenant_id" ON "mesas" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_mesas_establecimiento_id" ON "mesas" ("establecimiento_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_mesas_tunel_id" ON "mesas" ("tunel_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_mesas_estado" ON "mesas" ("estado")`);
        await queryRunner.query(`CREATE INDEX "IDX_mesas_activo" ON "mesas" ("activo")`);

        // Step 4: FIFO uniqueness — partial index prevents two tables at same position in same tunnel
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_mesas_tunel_posicion"
                ON "mesas" ("tunel_id", "posicion_actual")
                WHERE "posicion_actual" IS NOT NULL
        `);

        // Step 5: historial_mesa table (no deleted_at — immutable append-only log)
        await queryRunner.query(`
            CREATE TABLE "historial_mesa" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "mesa_id" uuid NOT NULL,
                "tipo_evento" "historial_tipo_evento" NOT NULL,
                "fecha_hora" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "detalle" jsonb,
                "usuario_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_historial_mesa" PRIMARY KEY ("id")
            )
        `);

        // Step 6: historial_mesa indexes
        await queryRunner.query(`CREATE INDEX "IDX_historial_mesa_mesa_id" ON "historial_mesa" ("mesa_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_historial_mesa_tenant_id" ON "historial_mesa" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_historial_mesa_tipo_evento" ON "historial_mesa" ("tipo_evento")`);
        await queryRunner.query(`CREATE INDEX "IDX_historial_mesa_fecha_hora" ON "historial_mesa" ("fecha_hora")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reverse: historial first, then mesas, then ENUMs
        await queryRunner.query(`DROP INDEX "public"."IDX_historial_mesa_fecha_hora"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_historial_mesa_tipo_evento"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_historial_mesa_tenant_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_historial_mesa_mesa_id"`);
        await queryRunner.query(`DROP TABLE "historial_mesa"`);

        await queryRunner.query(`DROP INDEX "public"."UQ_mesas_tunel_posicion"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_mesas_activo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_mesas_estado"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_mesas_tunel_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_mesas_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_mesas_tenant_id"`);
        await queryRunner.query(`DROP TABLE "mesas"`);

        await queryRunner.query(`DROP TYPE "historial_tipo_evento"`);
        await queryRunner.query(`DROP TYPE "mesa_estado"`);
    }

}
