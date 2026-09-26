# One multi-stage build for the whole brick. Targets:
#   api        API server, jobs process and seed (same image, different command)
#   dashboard  static dashboard served by nginx, proxying /api to the API
#   dev        full workspace with dev dependencies: tests, coverage, lint, format

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY dashboard/package.json dashboard/
RUN npm ci --no-audit --no-fund

FROM deps AS dev
COPY . .

FROM deps AS dashboard-build
COPY dashboard dashboard
RUN npm run build -w dashboard

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY dashboard/package.json dashboard/
RUN npm ci --omit=dev -w api --no-audit --no-fund && npm cache clean --force
COPY api api
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/readyz || exit 1
CMD ["node", "api/src/main.js"]

FROM nginxinc/nginx-unprivileged:1.27-alpine AS dashboard
COPY dashboard/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY dashboard/nginx/15-vigie-csp.envsh /docker-entrypoint.d/15-vigie-csp.envsh
COPY --from=dashboard-build /app/dashboard/dist /usr/share/nginx/html
EXPOSE 8080
