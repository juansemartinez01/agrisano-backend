import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/database/base.entity';

@Entity('app_settings')
export class AppSetting extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  key!: string;

  @Column({ type: 'text' })
  value!: string;
}
