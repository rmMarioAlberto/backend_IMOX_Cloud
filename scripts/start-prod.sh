#!/bin/bash

# ============================================================
# IMOX Cloud - Iniciar en modo PRODUCCIÓN (Raspberry Pi)
# Levanta solo infraestructura: MariaDB, Redis, InfluxDB, Mosquitto
# NestJS se ejecuta en el host con: npm run start:prod
# Uso: ./scripts/start-prod.sh
# ============================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/docker"
ENV_FILE="$PROJECT_ROOT/.env"

# Detectar docker compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Error: No se encontró docker compose"
    exit 1
fi

# Verificar .env
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: No se encontró .env en la raíz del proyecto"
    exit 1
fi

# Verificar memoria (Raspberry Pi)
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
echo "RAM Total: ${TOTAL_MEM}MB"

if [ "$TOTAL_MEM" -lt 900 ]; then
    echo "Advertencia: Memoria baja (${TOTAL_MEM}MB). Mínimo recomendado: 1GB"
fi

echo ""
echo "Iniciando IMOX Cloud en modo PRODUCCIÓN (solo infraestructura)..."
echo "Usando: $DOCKER_COMPOSE"
echo ""

# Detener contenedores existentes
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.prod.yml" --env-file "$ENV_FILE" down

# Levantar servicios de infraestructura
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.prod.yml" --env-file "$ENV_FILE" up -d

echo ""
echo " Esperando que los servicios estén listos..."
sleep 10

echo ""
echo "Infraestructura iniciada!"
echo ""
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.prod.yml" --env-file "$ENV_FILE" ps

echo ""
echo "Uso de recursos:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || true

echo ""
echo "Puertos expuestos en 127.0.0.1:"
echo "   MariaDB:    127.0.0.1:3306"
echo "   Redis:      127.0.0.1:6379"
echo "   InfluxDB:   127.0.0.1:8086"
echo "   MQTT:       127.0.0.1:1883"
echo "   MQTT WS:    127.0.0.1:9001"
echo ""
echo "Siguiente paso — iniciar NestJS en el host:"
echo "   npm run build && npm run start:prod"
echo ""
echo "Ver logs:     $DOCKER_COMPOSE -f $DOCKER_DIR/docker-compose.prod.yml logs -f"
echo "Detener:      $DOCKER_COMPOSE -f $DOCKER_DIR/docker-compose.prod.yml down"
