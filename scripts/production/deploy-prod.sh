#!/bin/bash
# Script de deployment para Raspberry Pi 3 - Producción

set -e

# Directorio base del proyecto
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/docker"

echo "🚀 Deployment IMOX Cloud - Raspberry Pi 3"
echo "=========================================="

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

# Build de imágenes
echo ""
echo "🔨 Building NestJS production image..."
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.prod.yml" build nestjs

# Detener contenedores existentes
echo ""
echo "🛑 Deteniendo contenedores existentes..."
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.prod.yml" down

# Iniciar servicios
echo ""
echo "🚀 Iniciando servicios en modo producción..."
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.prod.yml" --env-file "$DOCKER_DIR/.env.production" up -d

# Verificar estado
echo ""
echo "⏳ Esperando que los servicios estén listos..."
sleep 10

echo ""
echo "📊 Estado de los contenedores:"
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.prod.yml" ps

echo ""
echo "💾 Uso de recursos:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo ""
echo "✅ Deployment completado!"
echo ""
echo "📝 Próximos pasos:"
echo "   1. Configurar Cloudflare Tunnel"
echo "   2. Verificar logs: docker-compose -f $DOCKER_DIR/docker-compose.prod.yml logs -f"
echo "   3. Monitorear recursos: docker stats"
echo ""
