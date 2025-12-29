#!/bin/bash

# Script para iniciar todos los servicios en modo desarrollo
# Uso: ./scripts/start-dev.sh

set -e

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

# Asegurarse de estar en el directorio correcto
cd "$(dirname "$0")/.."

# Verificar que existe el archivo .env
if [ ! -f ".env" ]; then
    echo "Archivo .env no encontrado. Copiando desde .env.example..."
    cp .env.example .env
    echo "Archivo .env creado. Por favor, revisa y ajusta las variables antes de continuar."
    echo "Presiona ENTER para continuar o CTRL+C para salir..."
    read
fi

# Cambiar al directorio de docker
cd docker

echo "Deteniendo contenedores existentes..."
$DOCKER_COMPOSE --env-file ../.env down

echo "Construyendo imágenes..."
$DOCKER_COMPOSE --env-file ../.env build

echo "Levantando servicios..."
$DOCKER_COMPOSE --env-file ../.env up -d

echo ""
echo "Servicios iniciados correctamente!"
echo ""
echo "Estado de los servicios:"
$DOCKER_COMPOSE ps

echo ""
echo "URLs de acceso:"
echo "   - Backend Nest.js:  http://localhost:3000"
echo "   - GlitchTip:       http://localhost:8000"
echo "   - MongoDB:         localhost:27017"
echo "   - PostgreSQL:      localhost:5432"
echo "   - MQTT Broker:     localhost:1883"
echo "   - MQTT WebSocket:  ws://localhost:9001"
echo ""
echo "er logs en tiempo real:"
echo "   cd docker && $DOCKER_COMPOSE logs -f [servicio]"
echo ""
echo "   Servicios disponibles:"
echo "   - nestjs"
echo "   - mongodb"
echo "   - postgres"
echo "   - redis"
echo "   - mosquitto"
echo "   - glitchtip_web"
echo ""
echo ""
echo "Para detener todos los servicios:"
echo "   ./scripts/stop-all.sh"
