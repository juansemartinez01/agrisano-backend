import { DataSourceOptions } from 'typeorm';

export function makeOrmConfig(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,

    // Importante: en runtime puede ser dist (js) y en dev puede ser ts
    entities: [__dirname + '/../../modules/**/*.entity{.ts,.js}'],

    // migrations en raíz del repo
    migrations: [__dirname + '/../../../migrations/*{.ts,.js}'],

    synchronize: false,
    migrationsRun: true,
    logging: false,
  };
}
