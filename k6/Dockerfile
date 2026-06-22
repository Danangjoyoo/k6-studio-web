FROM grafana/k6:0.55.0 AS k6bin
FROM node:20-alpine
RUN apk add --no-cache wget
COPY --from=k6bin /usr/local/bin/k6 /usr/local/bin/k6
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY runner.js .
EXPOSE 8080
CMD ["node", "runner.js"]
