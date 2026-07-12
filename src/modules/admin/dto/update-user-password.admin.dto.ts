import { IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateUserPasswordAdminDto {
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}
