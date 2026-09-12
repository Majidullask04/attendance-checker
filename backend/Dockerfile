FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    APP_TIMEZONE=Asia/Kolkata

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY . ./

EXPOSE 3001

CMD ["node", "server.js"]
