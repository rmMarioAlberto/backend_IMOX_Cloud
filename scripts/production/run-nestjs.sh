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
    echo "❌ Error: No se encontró docker/.env.production"
    exit 1
fi

# Cargar variables de entorno
export $(grep -v '^#' "$PROJECT_ROOT/docker/.env.production" | xargs)

# Configurar conexiones para localhost (servicios en Docker)
export MYSQL_HOST=127.0.0.1
export REDIS_HOST=127.0.0.1
export INFLUXDB_URL=http://127.0.0.1:8086
export MQTT_BROKER_URL=mqtt://127.0.0.1:1883

export NODE_ENV=production
export PORT=3000

echo "✅ Variables de entorno cargadas"
echo "📡 Conectando a servicios en localhost"
echo ""

# Ejecutar NestJS
cd "$PROJECT_ROOT"
exec node dist/main.js
