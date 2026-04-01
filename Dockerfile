# ── Build Stage ──
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files for dependency install
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

# Copy source code
COPY shared/ shared/
COPY server/ server/
COPY client/ client/
COPY tsconfig.base.json ./

# Build client (produces client/dist/)
RUN npm run build -w client

# ── Production Stage ──
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/tmp

# Copy package files and install all deps (tsx needed for runtime)
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/

RUN npm ci --workspace=server --workspace=shared && \
    npm cache clean --force

# Copy server and shared source (tsx runs TypeScript directly)
COPY shared/src/ shared/src/
COPY shared/tsconfig.json shared/
COPY server/src/ server/src/
COPY server/tsconfig.json server/
COPY tsconfig.base.json ./

# Copy built client
COPY --from=build /app/client/dist/ client/dist/

EXPOSE 3001

USER node

CMD ["npx", "tsx", "server/src/index.ts"]
