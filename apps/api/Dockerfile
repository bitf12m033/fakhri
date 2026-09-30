# api — build
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run db:generate
RUN npm run build:packages
RUN npm run build -w apps/api

# api — runtime
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/package-lock.json* ./
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/packages packages
COPY --from=build /repo/.env.example /repo/apps/api/.env.example
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]