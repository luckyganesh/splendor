import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function resolveDataDir(): string {
  const dataDir = process.env.DATA_DIR
    ? join(process.env.DATA_DIR, 'games')
    : join(__dirname, '..', '..', '..', 'data', 'games');
  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}
