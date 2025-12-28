#!/bin/bash

# Script para detener todos los servicios Docker
# Uso: ./scripts/stop-all.sh [--remove-volumes]

set -e

echo "Deteniendo servicios IMOX Cloud..."

# Detectar comando de docker compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ Error: No se encontró docker-compose ni docker compose"
    exit 1
fi

# Cambiar al directorio correcto
cd "$(dirname "$0")/../docker"

# Verificar si se debe eliminar volúmenes
if [ "$1" == "--remove-volumes" ] || [ "$1" == "-v" ]; then
    echo "Eliminando contenedores y volúmenes..."
    $DOCKER_COMPOSE down -v
    echo "Contenedores y volúmenes eliminados."
else
    echo "Deteniendo contenedores (volúmenes preservados)..."
    $DOCKER_COMPOSE down
    echo "Contenedores detenidos."
    echo ""
    echo "Para eliminar también los volúmenes (DATOS PERDIDOS):"
    echo "   ./scripts/stop-all.sh --remove-volumes"
fi

echo ""
echo "Estado de contenedores Docker:"
docker ps -a | grep imox || echo "No hay contenedores IMOX activos"
