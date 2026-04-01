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

# Build shared -> server -> client
RUN npm run build -w shared && \
    npm run build -w server && \
    npm run build -w client

# ── Production Stage ──
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install production deps only
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/

RUN npm ci --omit=dev --workspace=server --workspace=shared && \
    npm cache clean --force

# Copy built artifacts
COPY --from=build /app/server/dist/ server/dist/
COPY --from=build /app/client/dist/ client/dist/

# pdfmake needs font files at runtime
COPY --from=build /app/node_modules/pdfmake/build/vfs_fonts/ node_modules/pdfmake/build/vfs_fonts/

EXPOSE 3001

USER node

CMD ["node", "server/dist/index.js"]
