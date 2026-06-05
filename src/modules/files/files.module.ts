import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FilesController } from './files.controller';
import { FilesProvider } from './files.provider';

@Module({
  imports: [
    ConfigModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: Number(cfg.get('FILES_MAX_BYTES') ?? 15 * 1024 * 1024),
        },
      }),
    }),
  ],
  controllers: [FilesController],
  providers: [FilesProvider],
  exports: [FilesProvider],
})
export class FilesModule {}
