# Stage 1: Build the React application with Vite
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation caching
COPY package.json package-lock.json ./

# Install clean dependencies using ci
RUN npm ci

# Copy frontend source code
COPY . .

# Set Vite build-time environment variables
# Building with VITE_API_URL="" forces relative API paths so all requests route through Nginx proxy
ENV VITE_API_URL=""
ENV VITE_WS_URL=""

# Build production bundle
RUN npm run build

# Stage 2: Serve production bundle using Nginx
FROM nginx:1.25-alpine

# Copy compiled assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
