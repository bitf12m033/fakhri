# web — build
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build:packages
RUN npm run build -w apps/web

# web — runtime
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages packages
COPY --from=build /repo/apps/web apps/web
COPY --from=build /repo/apps/web/package.json /repo/apps/web/package.json
COPY --from=build /repo/apps/web/next.config.mjs /repo/apps/web/next.config.mjs
COPY --from=build /repo/apps/web/.next /repo/apps/web/.next
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "apps/web"]