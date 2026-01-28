FROM node:18-alpine

WORKDIR /app

# Install ffmpeg for media processing
RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["npm", "start"]
