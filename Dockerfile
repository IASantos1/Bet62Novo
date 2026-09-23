FROM node:24-bookworm-slim AS builder

WORKDIR /app

ENV CI=true

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/bet62/package.json artifacts/bet62/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY scripts/package.json scripts/package.json
COPY scripts/preinstall.cjs scripts/preinstall.cjs

RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.json
COPY tsconfig.base.json tsconfig.base.json
COPY .npmrc .npmrc
COPY artifacts/api-server artifacts/api-server
COPY artifacts/bet62 artifacts/bet62
COPY lib/api-client-react lib/api-client-react
COPY lib/api-zod lib/api-zod
COPY lib/db lib/db
COPY scripts scripts

RUN pnpm --filter @workspace/bet62 run build \
  && pnpm --filter @workspace/api-server run build

FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV CI=true

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/bet62/package.json artifacts/bet62/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY scripts/package.json scripts/package.json
COPY scripts/preinstall.cjs scripts/preinstall.cjs

RUN pnpm install --frozen-lockfile --prod=false

COPY --from=builder /app/artifacts/api-server/dist /app/artifacts/api-server/dist
COPY --from=builder /app/artifacts/bet62/dist /app/artifacts/bet62/dist

EXPOSE 8080

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
