import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryUsersAdminDto {
  @IsOptional()
  @IsString()
  q?: string; // busca por email (like)

  @IsOptional()
  @IsBooleanString()
  includeDeleted?: string; // 'true' | 'false'

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
