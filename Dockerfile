FROM node:20-slim

WORKDIR /app

# Install dependencies for media processing and Prisma
RUN apt-get update && apt-get install -y \
    ffmpeg \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# Copy all source
COPY . .

# Build Dashboard
WORKDIR /app/dashboard
RUN npm install
RUN npm run build

# Back to root and build Backend
WORKDIR /app
RUN npx prisma generate
RUN npm run build

CMD ["npm", "start"]
