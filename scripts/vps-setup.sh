#!/bin/bash

# VPS Setup Script for Iawarrior tech (chat.ianampudia.com)
# Run this on your Ubuntu VPS as root

set -e

DOMAIN="chat.ianampudia.com"
REPO_URL="https://github.com/PointerSoftware/ianampudia11.git"
APP_DIR="/opt/iawarrior-tech"
EMAIL="admin@ianampudia.com" # Change this if needed

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Starting VPS Setup for $DOMAIN...${NC}"

# 1. Update System
echo -e "${GREEN}Updating system packages...${NC}"
apt-get update && apt-get upgrade -y

# 2. Install Dependencies
echo -e "${GREEN}Installing dependencies (Docker, Nginx, Certbot, Node.js)...${NC}"
apt-get install -y apt-transport-https ca-certificates curl software-properties-common gnupg nginx certbot python3-certbot-nginx git

# Install Docker
if ! command -v docker &> /dev/null; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Install Node.js (for build scripts)
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# 3. Clone Repository
echo -e "${GREEN}Cloning repository...${NC}"
if [ -d "$APP_DIR" ]; then
    echo "Directory exists, pulling latest changes..."
    cd "$APP_DIR"
    git pull
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# 4. Install Project Dependencies
echo -e "${GREEN}Installing project dependencies...${NC}"
npm install

# 5. Deploy Instance
echo -e "${GREEN}Deploying application instance...${NC}"
# Make scripts executable
chmod +x scripts/*.sh
chmod +x deploy.sh

# Deploy using the instance script
# We'll call the instance "main" and use port 5000
./scripts/deploy-instance.sh "main" --app-port 5000 --db-port 5432 --company-name "Iawarrior tech" --admin-email "$EMAIL"

# 6. Configure Nginx
echo -e "${GREEN}Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/$DOMAIN << EOF
server {
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# 7. Setup SSL
echo -e "${GREEN}Setting up SSL with Certbot...${NC}"
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m "$EMAIL" --redirect

echo -e "${GREEN}Setup Complete!${NC}"
echo -e "Access your app at: https://$DOMAIN"
