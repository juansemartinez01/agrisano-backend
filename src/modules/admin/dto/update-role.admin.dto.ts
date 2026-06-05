import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRoleAdminDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name?: string;
}
