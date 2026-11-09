FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime

RUN apk add --no-cache docker-cli \
    && addgroup -S nexus \
    && adduser -S -G nexus nexus

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3001

COPY --from=build --chown=nexus:nexus /app/package.json /app/package-lock.json ./
COPY --from=build --chown=nexus:nexus /app/node_modules ./node_modules
COPY --from=build --chown=nexus:nexus /app/dist-server ./dist-server

USER nexus

EXPOSE 3001

CMD ["node", "dist-server/index.js"]
