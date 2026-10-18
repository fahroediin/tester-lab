# ==============================================================================
# Tester Lab — Docker image
#
# Base image: the OFFICIAL Playwright image, which already bundles Node.js,
# Chromium, and all the OS libraries Playwright needs. This is essential because
# Tester Lab spawns real headless Chromium for generate/run; a plain node:slim
# image would fail at runtime without those browser dependencies.
#
# The tag MUST match the `playwright` version in package.json (1.62.1), so the
# bundled browser matches the one the app drives.
# ==============================================================================

# ---- Stage 1: build (compile TypeScript, copy templates & public) ----
FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS build
WORKDIR /app

# Install deps first (better layer caching); include dev deps to run tsc.
COPY package.json package-lock.json* ./
RUN npm ci

# Build: tsc -> dist, plus copy templates and public into dist (see package.json).
COPY . .
RUN npm run build

# Drop dev dependencies so only production deps are carried to the runtime stage.
RUN npm prune --omit=dev

# ---- Stage 2: runtime (slim: only what's needed to run) ----
FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg is used to merge multi-tab run recordings into a single video
# (video-merge service); without it, merging is skipped (per-tab videos remain).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Carry only the built app + production node_modules from the build stage.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# The app reads config from environment at startup (dotenv). Provide via
# docker-compose env_file / -e at RUN time — never baked into the image.
EXPOSE 3000

# Run as the non-root user the Playwright image already provides.
USER pwuser

CMD ["node", "dist/server/index.js"]
