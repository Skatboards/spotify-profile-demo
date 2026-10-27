FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY --chown=node:node server.mjs app.mjs ./

USER node

EXPOSE 3000

CMD ["node", "server.mjs"]
