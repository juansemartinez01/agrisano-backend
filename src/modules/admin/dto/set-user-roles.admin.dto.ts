import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class SetUserRolesAdminDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles!: string[];
}
