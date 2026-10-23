FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/cloud/package.json server/cloud/package-lock.json ./server/cloud/
RUN npm ci --prefix server/cloud --omit=dev && mkdir -p contracts/demo && ln -s /app/server/cloud/node_modules /app/node_modules && ln -s /app/server/cloud/node_modules /app/contracts/demo/node_modules
COPY package.json ./package.json
COPY server ./server
COPY src/game ./src/game
COPY assets/chog-testnet ./assets/chog-testnet
COPY contracts/demo/package.json ./contracts/demo/package.json
ENV NODE_ENV=production CHOG_SIM_CPU_ONLY=1 CHOG_DATA_DIR=/tmp/chog-data CHOG_BROWSER_PATH=/usr/bin/chromium CHOG_GAME_URL=http://127.0.0.1:8803/ CHOG_MAX_REWARD_ROOMS=1 CHOG_MAX_QUEUED_ROOMS=4
# Chromium uses its normal non-root sandbox. Runtime smoke test must verify the host permits it.
USER node
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server/cloud/start.mjs"]
