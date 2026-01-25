#!/bin/bash

# Script para ver logs de servicios Docker
# Uso: ./scripts/development/logs.sh [servicio]
#      ./scripts/development/logs.sh              (todos los servicios)
#      ./scripts/development/logs.sh nestjs       (solo backend)
#      ./scripts/development/logs.sh mosquitto    (solo MQTT)

# Directorios
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Detectar comando de docker compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ Error: No se encontró docker-compose ni docker compose"
    exit 1
fi

if [ -z "$1" ]; then
    echo "📋 Mostrando logs de TODOS los servicios (Ctrl+C para salir)..."
    echo ""
    $DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.yml" logs -f --tail=100
else
    echo "📋 Mostrando logs de: $1 (Ctrl+C para salir)..."
    echo ""
    $DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.yml" logs -f --tail=100 "$1"
fi
