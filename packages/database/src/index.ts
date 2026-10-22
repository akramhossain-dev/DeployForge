import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { EncryptionService } from '@deployforge/security';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to initialize Prisma');
}

const adapter = new PrismaPg({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 5000),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 300000),
});

type MutationEvent = {
  model?: string;
  operation: string;
  result: unknown;
};

const mutationListeners = new Set<(event: MutationEvent) => void>();
export function registerPrismaMutationListener(listener: (event: MutationEvent) => void) {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
}

const ENV_MODELS = new Set(['Deployment', 'DeploymentHistory']);
const WRITE_OPERATIONS = new Set(['create', 'update', 'upsert', 'createMany', 'updateMany']);

function encryptionService() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is required for encrypted deployment environment data');
  return new EncryptionService(key);
}

function transformEnvironment(value: unknown, direction: 'encrypt' | 'decrypt'): void {
  const records = Array.isArray(value) ? value : [value];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const row = record as Record<string, unknown>;
    if (typeof row.env !== 'string' || !row.env) continue;
    const parts = row.env.split(':');
    const encrypted = parts.length === 3 && parts.every((part) => /^[a-f0-9]+$/i.test(part));
    if (direction === 'encrypt' && !encrypted) {
      const result = encryptionService().encrypt(row.env);
      row.env = `${result.iv}:${result.tag}:${result.content}`;
    } else if (direction === 'decrypt' && encrypted) {
      try {
        const [iv, tag, content] = parts;
        row.env = encryptionService().decrypt({ iv, tag, content });
      } catch {

      }
    }
  }
}

const prisma = new PrismaClient({ adapter }).$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (ENV_MODELS.has(model) && WRITE_OPERATIONS.has(operation)) {
          const data = (args as Record<string, unknown>).data;
          transformEnvironment(data, 'encrypt');
        }

        const result = await query(args);
        if (ENV_MODELS.has(model)) transformEnvironment(result, 'decrypt');

        if (WRITE_OPERATIONS.has(operation)) {
          for (const listener of mutationListeners) listener({ model, operation, result });
        }
        return result;
      },
    },
  },
});

export * from '@prisma/client';
export default prisma;
