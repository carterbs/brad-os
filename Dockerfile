# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY packages/functions/package.json packages/functions/package.json
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY packages/functions/tsconfig.json packages/functions/tsconfig.json
COPY packages/functions/src packages/functions/src

RUN npm run build -w @brad-os/functions \
    && test -f packages/functions/lib/server.js \
    && find packages/functions/lib -type f \( -name '*.map' -o -name '*.d.ts' \) -delete

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/functions/package.json packages/functions/package.json
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY --from=build --chown=node:node /workspace/packages/functions/lib packages/functions/lib

USER node
EXPOSE 8080

CMD ["node", "packages/functions/lib/server.js"]
