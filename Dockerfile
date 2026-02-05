FROM node:20-slim

WORKDIR /app

# Install dependencies for media processing and Prisma
RUN apt-get update && apt-get install -y \
    ffmpeg \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

CMD ["npm", "start"]
