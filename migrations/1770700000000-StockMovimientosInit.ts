import { MigrationInterface, QueryRunner } from "typeorm";

export class StockMovimientosInit1770700000000 implements MigrationInterface {
    name = 'StockMovimientosInit1770700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "movimiento_tipo" AS ENUM ('ingreso', 'egreso_manual')
        `);

        await queryRunner.query(`
            CREATE TABLE "movimientos_stock" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "quimico_id" uuid NOT NULL,
                "establecimiento_id" uuid NOT NULL,
                "tipo" "movimiento_tipo" NOT NULL,
                "cantidad" numeric(10,3) NOT NULL,
                "unidad_medida" character varying(30) NOT NULL,
                "numero_remito" character varying(100),
                "observaciones" text,
                "usuario_id" uuid NOT NULL,
                "fecha" date NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_movimientos_stock" PRIMARY KEY ("id"),
                CONSTRAINT "FK_movimientos_stock_quimico" FOREIGN KEY ("quimico_id")
                    REFERENCES "quimicos"("id")
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_movimientos_stock_tenant_id" ON "movimientos_stock" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_movimientos_stock_quimico_id" ON "movimientos_stock" ("quimico_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_movimientos_stock_establecimiento_id" ON "movimientos_stock" ("establecimiento_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_movimientos_stock_tipo" ON "movimientos_stock" ("tipo")`);
        await queryRunner.query(`CREATE INDEX "IDX_movimientos_stock_fecha" ON "movimientos_stock" ("fecha")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_movimientos_stock_fecha"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_movimientos_stock_tipo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_movimientos_stock_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_movimientos_stock_quimico_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_movimientos_stock_tenant_id"`);
        await queryRunner.query(`DROP TABLE "movimientos_stock"`);
        await queryRunner.query(`DROP TYPE "movimiento_tipo"`);
    }
}
