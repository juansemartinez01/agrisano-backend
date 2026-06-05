import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class QueryAuditLogsDto {
  @IsOptional()
  @IsIn(['admin', 'error_5xx'])
  kind?: 'admin' | 'error_5xx';

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  actor_user_id?: string;

  @IsOptional()
  @IsString()
  target_user_id?: string;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status_code?: number;

  @IsOptional()
  @IsISO8601()
  from?: string; // inclusive

  @IsOptional()
  @IsISO8601()
  to?: string; // inclusive

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
