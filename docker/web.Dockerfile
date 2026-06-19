FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN apk add --no-cache openssl \
    && corepack enable \
    && corepack prepare pnpm@8.15.4 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter web...

FROM deps AS builder
COPY . .
RUN pnpm --filter @deployforge/shared build && pnpm --filter web build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --prod --frozen-lockfile --filter web...

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/web/package.json ./apps/web/package.json
COPY --from=prod-deps --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["pnpm", "--dir", "apps/web", "start"]
