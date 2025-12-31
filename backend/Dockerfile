# Use lightweight Node image
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy package files first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy rest of backend code
COPY . .

# Expose backend port
EXPOSE 3000

# Start backend server
CMD ["node", "server.js"]
