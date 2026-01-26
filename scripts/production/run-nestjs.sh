#!/bin/bash
# Script para ejecutar NestJS en modo producción (fuera de Docker)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "🚀 Iniciando NestJS en modo producción..."
echo ""

# Verificar que existe el build
if [ ! -d "$PROJECT_ROOT/dist" ]; then
    echo "❌ Error: No se encontró el directorio dist/"
    echo "   Ejecuta primero: npm run build"
    exit 1
fi

# Verificar que existen las variables de entorno
if [ ! -f "$PROJECT_ROOT/docker/.env.production" ]; then
    exit 1
fi

# Cargar variables de entorno de forma segura
echo "📂 Cargando variables desde: $PROJECT_ROOT/docker/.env.production"
set -a
. "$PROJECT_ROOT/docker/.env.production"
set +a

# Verificar si se cargaron las credenciales críticas
if [ -z "$MYSQL_USER" ]; then
    echo "❌ Error: MYSQL_USER está vacío. Revisa que el archivo .env.production tenga el formato correcto."
    exit 1
fi

# Configurar conexiones para localhost (servicios en Docker)
export MYSQL_HOST=127.0.0.1
export REDIS_HOST=127.0.0.1
export INFLUXDB_URL=http://127.0.0.1:8086
export MQTT_BROKER_URL=mqtt://127.0.0.1:1883

# Construir MYSQL_URL dinámica para Prisma
# Esto evita errores si la URL en .env tiene password incorrecta
export MYSQL_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT:-3306}/${MYSQL_DATABASE}"

export NODE_ENV=production
export PORT=3000

echo "✅ Variables de entorno cargadas"
echo "📡 Conectando a servicios en localhost"
echo "   - MySQL User: ${MYSQL_USER}"
echo "   - MySQL DB:   ${MYSQL_DATABASE}"
echo ""

# Ejecutar NestJS
cd "$PROJECT_ROOT"
exec node dist/main.js
