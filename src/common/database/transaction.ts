import { DataSource } from 'typeorm';

export async function runInTx<T>(
  ds: DataSource,
  fn: (manager: DataSource['manager']) => Promise<T>,
): Promise<T> {
  return ds.transaction(async (manager) => fn(manager));
}
