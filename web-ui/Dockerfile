FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
RUN mkdir -p public/monaco-editor && \
    cp -r node_modules/monaco-editor/min/. public/monaco-editor/
COPY server.js .
COPY public/ public/
# Run as root: required for docker.sock access on Docker Desktop (root:root, mode 660).
# Mitigated by localhost-only binding (see docker-compose.yml).
EXPOSE 3000
CMD ["node", "server.js"]
