FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_DOCKER_API_URL=/api/docker/containers
ARG VITE_DOCKER_STATS_URL=/api/docker/stats
ENV VITE_DOCKER_API_URL=${VITE_DOCKER_API_URL}
ENV VITE_DOCKER_STATS_URL=${VITE_DOCKER_STATS_URL}

RUN npm run build

FROM nginx:alpine AS runtime

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
