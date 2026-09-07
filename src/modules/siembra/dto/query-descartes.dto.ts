import { IsOptional, IsUUID, IsIn, IsEnum, Matches } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';
import { BandejaEstado } from '../entities/bandeja.entity';
import { BandejaDescarteMotivo } from '../entities/bandeja-descarte.entity';

export class QueryDescartesDto extends PageQueryDto {
  // establecimiento_id y siembra_id viven en bandejas, no en la constancia:
  // se resuelven con el join, no con una columna denormalizada.
  @IsOptional()
  @IsUUID()
  establecimiento_id?: string;

  @IsOptional()
  @IsUUID()
  siembra_id?: string;

  @IsOptional()
  @IsEnum(BandejaDescarteMotivo)
  motivo?: BandejaDescarteMotivo;

  // Sin 'descartada': es el unico valor que estado_anterior nunca toma, asi que
  // aceptarlo solo serviria para devolver cero filas sin explicar por que.
  // Separar nursery de invernadero es justamente para lo que sirve el filtro.
  @IsOptional()
  @IsIn([
    BandejaEstado.COOLING_PERIOD,
    BandejaEstado.EN_NURSERY,
    BandejaEstado.TRASPLANTADA,
  ])
  estado_anterior?: BandejaEstado;

  // Solo se valida la forma, no que el dia exista. Al escribir un descarte una
  // fecha imposible es un dato malo y se rechaza; aca es una cota de un
  // reporte, y como la comparacion es lexicografica sobre 'YYYY-MM-DD' un
  // 2026-02-30 cae entre el 28 de febrero y el 1 de marzo, que es lo que
  // quiso decir quien lo escribio.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fecha_desde debe tener formato YYYY-MM-DD',
  })
  fecha_desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fecha_hasta debe tener formato YYYY-MM-DD',
  })
  fecha_hasta?: string;

  @IsOptional()
  @IsIn(['fecha_descarte', 'created_at'])
  sortBy?: 'fecha_descarte' | 'created_at';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
