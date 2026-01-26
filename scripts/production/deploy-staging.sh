#!/bin/bash
# Script de deployment para Staging - Solo servicios de infraestructura
# NestJS se ejecuta manualmente fuera de Docker

set -e

# Directorios
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/docker"

echo "🚀 Deployment IMOX Cloud - Staging (Sin NestJS en Docker)"
echo "============================================================"

# Verificar sistema
if [ ! -f /proc/device-tree/model ]; then
    echo "⚠️  Advertencia: No se detectó Raspberry Pi"
fi

# Verificar memoria
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
echo "💾 RAM Total: ${TOTAL_MEM}MB"

if [ "$TOTAL_MEM" -lt 900 ]; then
    echo "❌ Error: Memoria insuficiente (mínimo 1GB recomendado)"
    exit 1
fi

# Detectar comando de docker compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ Error: No se encontró docker-compose ni docker compose"
    echo "   Instala Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Usando: $DOCKER_COMPOSE"
echo ""

# Verificar archivo .env
if [ ! -f "$DOCKER_DIR/.env.production" ]; then
    echo "❌ Error: Falta archivo .env.production en $DOCKER_DIR"
    echo "💡 Copia .env.production.example y configura los valores"
    exit 1
fi

# Verificar que se cambiaron los passwords por defecto
if grep -q "CHANGE_THIS" "$DOCKER_DIR/.env.production"; then
    echo "⚠️  ADVERTENCIA: Aún hay passwords por defecto en .env.production"
    echo "   Asegúrate de cambiar todos los valores CHANGE_THIS"
    read -p "Continuar de todas formas? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Detener contenedores existentes
echo ""
echo "🛑 Deteniendo contenedores existentes..."
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.staging.yml" down

# Iniciar servicios de infraestructura
echo ""
echo "🚀 Iniciando servicios de infraestructura (sin NestJS)..."
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.staging.yml" --env-file "$DOCKER_DIR/.env.production" up -d

# Verificar estado
echo ""
echo "⏳ Esperando que los servicios estén listos..."
sleep 10

echo ""
echo "📊 Estado de los contenedores:"
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.staging.yml" ps

echo ""
echo "💾 Uso de recursos:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo ""
echo "✅ Servicios de infraestructura iniciados!"
echo ""
echo "📝 Próximos pasos para ejecutar NestJS:"
echo "   1. Instalar dependencias:"
echo "      cd $PROJECT_ROOT"
echo "      npm ci --production"
echo ""
echo "   2. Build de NestJS:"
echo "      npm run build"
echo ""
echo "   3. Ejecutar en modo producción:"
echo "      NODE_ENV=production node dist/main.js"
echo ""
echo "   O usar PM2 (recomendado):"
echo "      pm2 start dist/main.js --name imox-backend"
echo ""
echo "🌐 Puertos expuestos en localhost:"
echo "   - MariaDB:   127.0.0.1:3306"
echo "   - Redis:     127.0.0.1:6379"
echo "   - InfluxDB:  127.0.0.1:8086"
echo "   - MQTT:      127.0.0.1:1883"
echo "   - MQTT WS:   127.0.0.1:9001"
echo ""
