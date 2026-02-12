# Dockerfile para EasyPanel (Multi-stage build)

# Etapa 1: Construcción
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias del sistema necesarias para la construcción
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

# Copiar archivos de definición de paquetes
COPY package*.json ./

# Instalar todas las dependencias (incluyendo devDependencies para el build)
RUN npm install

# Copiar el código fuente
COPY . .

# Construir la aplicación (Frontend y Backend)
# Esto generará la carpeta dist/
RUN npm run build:production

# Etapa 2: Producción
FROM node:20-slim

WORKDIR /app

# Instalar cliente de PostgreSQL y herramientas básicas
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    procps \
    && echo "deb http://apt.postgresql.org/pub/repos/apt/ bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - \
    && apt-get update && apt-get install -y postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=9000
ENV PGUSER=postgres
ENV PGPASSWORD=postgres
ENV PGHOST=postgres
ENV PGDATABASE=powerchat

# Copiar package.json para referencia
COPY package.json ./

# Copiar node_modules de producción desde la etapa de build
COPY --from=builder /app/node_modules ./node_modules

# Copiar los artefactos construidos desde la etapa anterior
COPY --from=builder /app/dist ./dist
# Copiar migraciones y scripts necesarios
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

# Copiar archivo de licencia si existe
COPY --from=builder /app/license ./license

# Copiar script de entrypoint
COPY --from=builder /app/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Crear directorios necesarios para persistencia
RUN mkdir -p /app/uploads /app/whatsapp-sessions /app/backups

# Exponer el puerto
EXPOSE 9000

# Configurar entrypoint y comando
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
