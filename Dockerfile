FROM node:20-alpine

# Prisma engines + OpenSSL на Alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

COPY . .

ENV NODE_ENV=production

CMD ["npm", "run", "worker"]
