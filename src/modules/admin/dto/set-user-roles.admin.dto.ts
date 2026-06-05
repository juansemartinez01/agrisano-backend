import { IsArray, IsString } from 'class-validator';

export class SetUserRolesAdminDto {
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}
