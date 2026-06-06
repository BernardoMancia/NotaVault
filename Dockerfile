FROM node:22-alpine

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads public

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server.js"]
