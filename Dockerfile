FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG PUBLIC_POCKETBASE_URL=https://admin.videotheatre.gr
ENV PUBLIC_POCKETBASE_URL=$PUBLIC_POCKETBASE_URL
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 4321
CMD ["node","./dist/server/entry.mjs"]
