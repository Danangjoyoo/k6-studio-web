FROM node:20-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production && \
    mkdir -p public/monaco-editor && \
    cp -r node_modules/monaco-editor/min/vs public/monaco-editor/vs
COPY server.js .
COPY public/ public/
EXPOSE 3000
CMD ["node", "server.js"]
