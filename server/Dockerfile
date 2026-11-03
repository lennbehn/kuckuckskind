# Build-Kontext: Wurzel des Repos (docker build -f server/Dockerfile .)
FROM public.ecr.aws/docker/library/node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --filter @kuckuckskind/server...
COPY shared shared
COPY server server
RUN pnpm --filter @kuckuckskind/server build

FROM public.ecr.aws/docker/library/node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/server/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]
