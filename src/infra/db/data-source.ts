import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as dotenv } from 'dotenv';
import { makeOrmConfig } from './ormconfig';

// Carga .env.local primero (dev) y si no existe, .env
dotenv({ path: '.env.local' });
dotenv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export const AppDataSource = new DataSource(
  makeOrmConfig(databaseUrl) as any, // evitamos fricción de tipos por paths js/ts
);
