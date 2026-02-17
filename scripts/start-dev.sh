#!/bin/bash

# ============================================================
# IMOX Cloud - Iniciar en modo DESARROLLO
# Levanta todos los servicios incluyendo NestJS en Docker
# Uso: ./scripts/start-dev.sh
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
    if [ -f "$PROJECT_ROOT/.env.example" ]; then
        echo " .env no encontrado. Copiando desde .env.example..."
        cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"
        echo "Revisa y ajusta las variables en .env antes de continuar."
        echo "Presiona ENTER para continuar o CTRL+C para salir..."
        read
    else
        echo "❌ Error: No se encontró .env ni .env.example"
        exit 1
    fi
fi

echo "Iniciando IMOX Cloud en modo DESARROLLO..."
echo "Usando: $DOCKER_COMPOSE"
echo ""

# Detener contenedores existentes
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.yml" --env-file "$ENV_FILE" down

# Construir y levantar
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.yml" --env-file "$ENV_FILE" build
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.yml" --env-file "$ENV_FILE" up -d

echo ""
echo "Servicios iniciados!"
echo ""
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.yml" --env-file "$ENV_FILE" ps
echo ""
echo "URLs de acceso:"
echo "   - Backend:    http://localhost:3000"
echo "   - InfluxDB:   http://localhost:8086"
echo "   - MariaDB:    localhost:3306"
echo "   - Redis:      localhost:6379"
echo "   - MQTT:       localhost:1883"
echo "   - MQTT WS:    ws://localhost:9001"
echo ""
echo "Ver logs:     $DOCKER_COMPOSE -f $DOCKER_DIR/docker-compose.yml logs -f"
echo "Detener:      $DOCKER_COMPOSE -f $DOCKER_DIR/docker-compose.yml down"
echo "Detener+data: $DOCKER_COMPOSE -f $DOCKER_DIR/docker-compose.yml down -v"
