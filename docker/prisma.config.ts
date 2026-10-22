import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: '/app/prisma/schema.prisma',
  migrations: {
    path: '/app/prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
