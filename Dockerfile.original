FROM node:20-slim

WORKDIR /app

# Install PostgreSQL client, Git, and other dependencies
RUN apt-get update && apt-get install -y lsb-release curl gnupg git \
    # Download and add the PostgreSQL GPG key
    && curl -sSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | tee /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg > /dev/null \
    # Add the PostgreSQL APT repository for Debian Bookworm (node:20-slim base)
    && echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list \
    # Update apt-get again to recognize the new repository
    && apt-get update \
    # Install the specific PostgreSQL 16 client
    && apt-get install -y postgresql-client-16 \
    # Clean up apt caches to keep the image size down
    && rm -rf /var/lib/apt/lists/*

# Default environment variables (can be overridden)
ENV PGUSER=postgres
ENV PGPASSWORD=root
ENV PGHOST=postgres
ENV PGDATABASE=powerchat
ENV APP_PORT=9000

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --include=optional

# Copy the rest of the application
COPY . .

# Fix Rollup optional dependency issue
RUN npm install @rollup/rollup-linux-x64-gnu --save-optional

# Create migrations directory (will be overridden by instance-specific migrations)


# Copy and make entrypoint script executable (for database readiness check only)
COPY docker-entrypoint-simple.sh /usr/local/bin/docker-entrypoint.sh
# Fix line endings (in case of Windows CRLF) and make executable
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

# Build arguments for instance customization
ARG ADMIN_EMAIL="admin@powerchatapp.net"
ARG COMPANY_NAME="PowerChat"
ARG INSTANCE_NAME="default"

# Build the application
RUN npm run build

# Perform string replacements in built files
RUN find dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) -exec sed -i "s/admin@powerchatapp\.net/${ADMIN_EMAIL}/g" {} \; && \
    find dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) -exec sed -i "s/PowerChat/${COMPANY_NAME}/g" {} \; && \
    find client/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) -exec sed -i "s/admin@powerchatapp\.net/${ADMIN_EMAIL}/g" {} \; 2>/dev/null || true && \
    find client/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) -exec sed -i "s/PowerChat/${COMPANY_NAME}/g" {} \; 2>/dev/null || true

# Create directories for instance-specific data
RUN mkdir -p /app/data/uploads /app/data/whatsapp-sessions /app/data/backups /app/volumes/backups /app/temp/backups

# Expose configurable port
EXPOSE $APP_PORT

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

CMD ["node", "dist/index.js"]