FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN apk add --no-cache openssl postgresql-client \
    && corepack enable \
    && corepack prepare pnpm@8.15.4 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/mail/package.json packages/mail/package.json
COPY packages/security/package.json packages/security/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/vps/package.json packages/vps/package.json
RUN apk add --no-cache --virtual .build-deps python3 py3-setuptools make g++ \
    && pnpm install --frozen-lockfile --filter api...

FROM deps AS builder
COPY . .
RUN pnpm --filter @deployforge/shared build \
    && pnpm --filter @deployforge/database generate \
    && pnpm --filter @deployforge/database build \
    && pnpm --filter @deployforge/mail build \
    && pnpm --filter @deployforge/security build \
    && pnpm --filter @deployforge/vps build \
    && pnpm --filter api build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/mail/package.json packages/mail/package.json
COPY packages/security/package.json packages/security/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/vps/package.json packages/vps/package.json
RUN apk add --no-cache --virtual .build-deps python3 py3-setuptools make g++ \
    && pnpm install --prod --frozen-lockfile --filter api...
# Generate the Prisma client into prod node_modules.
# prisma CLI is a devDep (excluded by --prod). npx downloads it on the fly
# without touching the pnpm workspace, so pnpm-workspace.yaml doesn't interfere.
COPY prisma ./prisma
RUN PRISMA_GENERATE_SKIP_AUTOINSTALL=1 npx --yes prisma@5.22.0 generate --schema ./prisma/schema.prisma

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
# node_modules from prod-deps already contains the generated Prisma client
# (written into the pnpm virtual store during the npx generate step above).
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /app/packages/mail/dist ./packages/mail/dist
COPY --from=builder --chown=node:node /app/packages/security/dist ./packages/security/dist
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /app/packages/vps/dist ./packages/vps/dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]

