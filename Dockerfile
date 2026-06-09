FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build && echo "✅ Build complete" && ls -la dist/src/main.js

EXPOSE 3000
CMD ["sh", "entrypoint.sh"]
