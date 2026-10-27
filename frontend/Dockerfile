FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_CLIENT_ID
ARG VITE_REDIRECT_URI

ENV VITE_CLIENT_ID=${VITE_CLIENT_ID}
ENV VITE_REDIRECT_URI=${VITE_REDIRECT_URI}

RUN test -n "${VITE_CLIENT_ID}" \
    && test -n "${VITE_REDIRECT_URI}" \
    && npm run build

FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
