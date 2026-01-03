#!/bin/bash

# Script para ver logs de servicios Docker
# Uso: ./scripts/logs.sh [servicio]
#      ./scripts/logs.sh              (todos los servicios)
#      ./scripts/logs.sh nestjs       (solo backend)
#      ./scripts/logs.sh mosquitto    (solo MQTT)

# Detectar comando de docker compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ Error: No se encontró docker-compose ni docker compose"
    exit 1
fi

cd "$(dirname "$0")/../docker"

if [ -z "$1" ]; then
    echo "📋 Mostrando logs de TODOS los servicios (Ctrl+C para salir)..."
    echo ""
    $DOCKER_COMPOSE logs -f --tail=100
else
    echo "📋 Mostrando logs de: $1 (Ctrl+C para salir)..."
    echo ""
    $DOCKER_COMPOSE logs -f --tail=100 "$1"
fi
