import { IsString, MinLength } from 'class-validator';

export class UpdateUserPasswordAdminDto {
  @IsString()
  @MinLength(6)
  password!: string;
}
