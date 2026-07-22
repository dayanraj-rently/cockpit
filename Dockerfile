# ---- Stage 1: build the client SPA ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: production server, serving the built client alongside the API ----
FROM node:20-alpine
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src

# Placed as a sibling of server/, mirroring the local repo layout — index.js
# resolves it via a relative ../../client/dist path that's identical whether
# running locally (npm run dev, where this simply doesn't exist yet) or here.
COPY --from=client-build /app/client/dist /app/client/dist

ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "src/index.js"]
