#!/bin/bash

# Script para iniciar todos los servicios en modo desarrollo
# Uso: ./scripts/development/start-dev.sh

set -e

# Directorios
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/docker"
ENV_FILE="$PROJECT_ROOT/.env"

echo "Iniciando servicios IMOX Cloud en modo DESARROLLO..."

# Detectar si usar docker-compose o docker compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ Error: No se encontró docker-compose ni docker compose"
    echo "   Por favor instala Docker y Docker Compose"
    exit 1
fi

echo "Usando comando: $DOCKER_COMPOSE"

# Verificar que existe el archivo .env
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$PROJECT_ROOT/.env.example" ]; then
        echo "Archivo .env no encontrado. Copiando desde .env.example..."
        cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"
        echo "Archivo .env creado. Por favor, revisa y ajusta las variables antes de continuar."
        echo "Presiona ENTER para continuar o CTRL+C para salir..."
        read
    else
        echo "❌ Error: No se encontró .env ni .env.example"
        echo "   Crea un archivo .env en la raíz del proyecto"
        exit 1
    fi
fi

echo "Deteniendo contenedores existentes..."
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.yml" --env-file "$ENV_FILE" down

echo "Construyendo imágenes..."
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.yml" --env-file "$ENV_FILE" build

echo "Levantando servicios..."
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.yml" --env-file "$ENV_FILE" up -d

echo ""
echo "Servicios iniciados correctamente!"
echo ""
echo "Estado de los servicios:"
$DOCKER_COMPOSE -f "$DOCKER_DIR/docker-compose.yml" ps

echo ""
echo "URLs de acceso:"
echo "   - Backend Nest.js:  http://localhost:3000"
echo "   - InfluxDB UI:      http://localhost:8086"
echo "   - MariaDB:          localhost:3306"
echo "   - Redis:            localhost:6379"
echo "   - MQTT Broker:      localhost:1883"
echo "   - MQTT WebSocket:   ws://localhost:9001"
echo ""
echo "Ver logs en tiempo real:"
echo "   ./scripts/development/logs.sh [servicio]"
echo ""
echo "   Servicios disponibles:"
echo "   - nestjs"
echo "   - influxdb"
echo "   - mariadb"
echo "   - redis"
echo "   - mosquitto"
echo ""
echo ""
echo "Para detener todos los servicios:"
echo "   ./scripts/development/stop-all.sh"
