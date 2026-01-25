# Multi-stage build para producción optimizada
FROM node:20-alpine AS base

# Instalación de dependencias del sistema
RUN apk add --no-cache libc6-compat openssl procps

WORKDIR /app

# ==================== DEPENDENCIES ====================
FROM base AS deps

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# ==================== BUILDER ====================
FROM base AS builder

WORKDIR /app

# Copiar dependencias instaladas
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente
COPY . .

# Build de la aplicación
RUN npm run build

# Limpiar devDependencies
RUN npm prune --production

# ==================== DEVELOPMENT ====================
FROM base AS development

WORKDIR /app

ENV NODE_ENV=development

# Copiar dependencias
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente
COPY . .

# Exponer puerto
EXPOSE 3000

# Hot reload en desarrollo
CMD ["npm", "run", "start:dev"]

# ==================== PRODUCTION ====================
FROM base AS production

WORKDIR /app

ENV NODE_ENV=production

# Crear usuario no-root para seguridad
RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 nestjs

# Copiar dependencias de producción
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules

# Copiar build
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Copiar package.json para scripts
COPY --chown=nestjs:nodejs package*.json ./

# Cambiar a usuario no-root
USER nestjs

# Exponer puerto
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Comando de inicio
CMD ["node", "dist/main.js"]
